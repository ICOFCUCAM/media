# 73 — CineForge's own image runtime: ComfyUI on a GPU (W29)

**Status:** implemented in code (2026-10-11), not yet deployed. Migration
`0064` is **not applied**. The Docker image has **not been built yet**: this
work was done where Docker, a GPU and Hugging Face were not available.

**Builds on:**

- docs/38 §AT (Workflow Runtime / ComfyUI), §C–§D (image models and their
  licences);
- docs/39 (the Media Runtime Gateway);
- docs/62 (the Image Engine).

## 1. What it is

CineForge can now draw its stills on a GPU it rents itself instead of paying
OpenAI or fal per image:

- seed frames and seed candidates;
- wardrobe, location and prop references;
- character portraits.

The service is `apps/gpu-image`. It contains:

- **ComfyUI**, pinned to one exact commit, listening only inside its own
  container (on 127.0.0.1);
- **CineForge's own small API** in front of it. This API is the only thing
  reachable from outside.

The API never runs a graph sent by a caller. A caller names a **workflow from
the Workflow Registry** (an id and a version) and gives values for the
workflow's declared slots: prompt, negative prompt, seed, width, height,
steps, reference images and LoRA. The service puts those values into the
registry's graph and runs it.

Every request goes through the **same Media Runtime Gateway code** as the video
worker (`apps/gpu-worker/app/gateway`, copied into the image at build time, not
forked):

- an Ed25519 execution token, bound to this deployment, the action
  (`image:run`), the job, the exact request body, and an authorization digest
  covering:
  - the workflow id, version and graph hash;
  - the runtime;
  - the exact model files (repository, revision, weights digest);
  - the size;
- presigned one-time URLs for every input and output;
- no storage keys on the pod.

```
worker (Render)                                   RunPod GPU pod (cineforge-gpu-image)
┌───────────────────────────────┐   image:run    ┌───────────────────────────────────────┐
│ IMAGE_PROVIDERS=comfyui,fal,… │──── token ────▶│ CineForge API :8000 (FastAPI)          │
│  comfyui provider             │  + body with   │  gateway: verify token, body, authz    │
│  ImageGatewayAuthority        │  one-time URLs │  registry: bind slots → graph          │
│   (deployment registry,       │◀── result ─────│  ComfyUI 127.0.0.1:8188 (never public) │
│    signing key, presigner)    │                │  Qwen-Image / Qwen-Image-Edit-2511      │
└──────────┬────────────────────┘                └──────────────┬────────────────────────┘
           │ read back + sha256 check                           │ PUT once (presigned)
           ▼                                                    ▼
                        object storage: projects/<project>/…png
```

## 2. Models and their licences

All models are licence-safe for commercial use. The build refuses a manifest
whose model licence is not Apache-2.0, MIT or BSD-3-Clause. Model weights are
**downloaded when the pod starts**, from Hugging Face, at the exact 40-character
revision you set in the pod's env. They are not baked into the image and never
follow a moving branch.

| Model (registry key) | File | Hugging Face repo (revision env) | Licence | Source of the licence statement |
|---|---|---|---|---|
| Qwen-Image, fp8 (`qwen-image.diffusion`) | `split_files/diffusion_models/qwen_image_fp8_e4m3fn.safetensors` | `Comfy-Org/Qwen-Image_ComfyUI` (`QWEN_IMAGE_COMFY_REVISION`) | Apache-2.0 | docs/38 §C and §D: github.com/QwenLM/Qwen-Image, "Qwen-Image is licensed under Apache 2.0" (read 2026-10-06). docs/38 marks it the proposed primary image model. |
| Qwen-Image-Edit-2511, bf16 (`qwen-image-edit-2511.diffusion`) | `split_files/diffusion_models/qwen_image_edit_2511_bf16.safetensors` | `Comfy-Org/Qwen-Image-Edit_ComfyUI` (`QWEN_IMAGE_EDIT_COMFY_REVISION`) | Apache-2.0 | docs/38 §D: same repository; the Edit releases (2509, 2511) are under the same licence. |
| Qwen2.5-VL-7B text encoder, fp8 (`qwen2.5-vl-7b.text-encoder`) | `split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` | `Comfy-Org/Qwen-Image_ComfyUI` | Apache-2.0 | The Qwen/Qwen2.5-VL-7B-Instruct model card. **This model is not in docs/38's verified table:** verify and archive the licence before approving a deployment (docs/38 "No hidden dependencies"). |
| Qwen-Image VAE (`qwen-image.vae`) | `split_files/vae/qwen_image_vae.safetensors` | `Comfy-Org/Qwen-Image_ComfyUI` | Apache-2.0 | Part of the Qwen-Image release (docs/38 §D). |
| ComfyUI (the runtime) | v0.37.4, commit `8ff6dc384ba5c410266b40e137799e049459d4f2` | github.com/comfyanonymous/ComfyUI | GPL-3.0 | The LICENSE file at that commit (read 2026-10-11); docs/38 §AT.4 and §AT.15. CineForge uses it as a service and does not distribute it. |

**Not used, and why (docs/38 §C):**

- FLUX.1 [dev], Kontext, Fill and FLUX.2 [dev] / [klein] 9B: their licences
  forbid commercial use.
- SDXL: older quality, and its licence has use restrictions.
- FLUX.2 [klein] 4B (Apache-2.0): on the watch list as a compact alternative.

**About the weight files:** they are Comfy-Org's single-file repackages of
Qwen's own weights, the files ComfyUI's official Qwen blueprints use. At the
revision you pin, check that each model card still says `apache-2.0`.

**No custom nodes are installed.** Every node the workflows use is part of
ComfyUI core at the pinned commit.

## 3. The Workflow Registry

Files live in `apps/gpu-image/workflows/`:

| File | What it is |
|---|---|
| `manifest.json` | the registry: the runtime (ComfyUI commit and licence), `customNodes` (pinned by commit, empty today), the node allow-list, the models (repo, revision env, file, ComfyUI folder and name, licence, licence source), and the workflows |
| `cineforge.still.t2i@1.json` | text → still. Qwen-Image, 20 steps (4–50), CFG 4, euler/simple, shift 3.1 |
| `cineforge.still.ref@1.json` | reference images → still. Qwen-Image-Edit-2511 with `TextEncodeQwenImageEditPlus`, 1 to 3 reference images, CFGNorm, at the requested size |

**What each workflow declares:**

- its **slots**, each naming the node inputs it fills:
  - prompt, negative, seed, width, height, steps;
  - `references`: the LoadImage nodes, in order;
  - `lora`: a LoraLoaderModelOnly node, bypassed when no LoRA is given;
- its model roles;
- its limits: 2.1 megapixels at most; sides from 256 to 2048 px, in multiples
  of 16; a time limit.

The worker fits the asked size to these limits. For example, 1920×1080 becomes
1920×1072.

**Hashing.** Each workflow's `sha256` covers its id, version, graph, slots,
models and limits. The registry's `sha256` covers the runtime, nodes, models
and every workflow hash.

- `/capabilities` reports both hashes.
- `gateway:admin approve` stores them with the deployment.
- The token's authorization digest binds `id@version#sha256`.

So if a graph changes, the hash changes. The pod then refuses tokens computed
from the old approval with `AUTHZ_MISMATCH`, and `gateway:admin enforce`
refuses with `MANIFEST_MISMATCH`.

**Checks when the registry loads:**

- every node class is on the allow-list;
- every model loader names a model the workflow declares, so a model cannot be
  swapped;
- every model licence is commercial-safe;
- every slot points at real node inputs;
- there is exactly one SaveImage output.

**Checks when values are filled in:** unknown or extra request fields are
rejected (422 `INVALID_REQUEST`; there is no `graph` field to send), and every
value is range-checked.

**To change a workflow:**

1. Add a new version file, for example `cineforge.still.t2i@2.json`, and its
   manifest entry. Never edit a released version.
2. Build and verify the new image.
3. Approve the new deployment.
4. Point the worker at the new version: `COMFY_WORKFLOWS` in
   `packages/model-adapters/src/comfyui/image-client.ts`.

## 4. The service's API (`apps/gpu-image`)

| Route | Scope | What |
|---|---|---|
| `GET /livez` | public | `ok` and nothing else |
| `GET /health` | `status` | execution mode (`real`, `loading`, `unavailable` or `placeholder`), the reason when unavailable, free VRAM |
| `GET /capabilities` | `status` | the runtime and its commit, the workflows with their hashes, the registry hash, licences, the manifest (the authorization inputs), the deployment id, the gateway mode, the image's source commit, code digest and dependency-freeze digest |
| `POST /images` | `image:run` | the job, its workflow `{id, version}` and slot values, `inputUrls`, `output: {imageKey, imageUploadUrl}`. With `x-cineforge-async: 1` it answers `202 {taskId}` |
| `GET /images/jobs/{id}` | `status` | `queued`, `running`, `done` with the result, or `error` |

**The result** contains:

- the image key, its size in bytes and its sha256;
- the seed, the actual width and height, and gpuMs;
- the workflow (id, version, sha256), the bound graph's sha256 and the
  runtime;
- the models used (revision and weights digest);
- `execution` and `realExecution`.

**Placeholder rule** (the same as the video worker): the service returns a
placeholder PNG **only** when `CINEFORGE_PLACEHOLDER=1` is set. This is meant
for CI and image verification.

Without that flag, a pod that cannot run for real answers `503` with the
reason and never returns a fake still. The reasons are:

- `COMFYUI_NOT_INSTALLED`
- `MODEL_UNPINNED`
- `CUDA_UNAVAILABLE`
- `MODEL_DOWNLOAD_FAILED`
- `WEIGHTS_UNRESOLVED`
- `COMFYUI_*`
- `MODEL_LOADING` while the weights download

The worker also refuses a placeholder still unless `ALLOW_PLACEHOLDER_MEDIA=1`.

## 5. Security (the same gateway as the video worker)

- **Shared code.** The token check, replay cache, authorization digest,
  one-time media I/O and code digest are `apps/gpu-worker/app/{gateway,
  media_io.py, code_digest.py}`. The Dockerfile (build context: the repository
  root) copies them in, and a test fails if the copy list drifts. The video
  worker's own behaviour is unchanged.
- **The pod checks every request**, in order:
  1. the Ed25519 signature;
  2. the token's expiry and lifetime;
  3. the issuer;
  4. that the token was not used before (replay);
  5. `aud` = `DEPLOYMENT_ID`;
  6. `scope` = `image:run`, or `status` for reads;
  7. `sub` = the job id;
  8. `bh` = the sha256 of the body;
  9. `authz` = what this pod would run.

  In `report` mode it only logs failures. In `enforce` mode it rejects them.
- **Refuses to start in `enforce` mode** when `S3_*` or `AWS_*` keys are
  present, when `DEPLOYMENT_ID` or the public keys are missing, or when a model
  revision is not pinned.
- **One-time media I/O in every mode.** There is no legacy storage path:
  inputs are read only through `inputUrls`, and the still is written only to
  `output.imageUploadUrl`. LoRA bytes are checked against their authorized
  sha256 (`409 LORA_HASH_MISMATCH`).
- **ComfyUI is closed to the outside.** It binds to 127.0.0.1 and is started
  with `--disable-api-nodes`, `--disable-all-custom-nodes`, no manager and an
  in-memory database. Its routes (`/prompt`, `/object_info`, `/view`, …) are
  not reachable from outside. One graph runs at a time, and each job's input,
  LoRA and output files are removed after the job.
- **The worker side** (`ImageGatewayAuthority`, in
  `packages/model-adapters/src/gateway/image-authority.ts`):
  - the deployment must be registered and approved, and its approved manifest
    must list the workflow and every model the workflow uses;
  - output keys are chosen inside `projects/<project>/`, and inputs must be in
    the same folder (or already signed by CineForge);
  - in `enforce` mode, RunPod must report the approved image digest;
  - every grant is recorded in `runtime_execution_grants` with scope
    `image:run`;
  - the result is accepted only after the stored object is checked: the
    granted key, the size from a HEAD request, PNG magic bytes, and a sha256
    read back from storage.
- **There is no unsigned path for images.** A call that cannot be signed and
  presigned is refused in both modes. Report mode differs from enforce mode
  only for the image-digest attestation, which it records instead of refusing.

## 6. Deploying it on RunPod, step by step (for the owner)

**You need:**

- the video gateway already set up (docs/39 §10). The worker on Render has
  `GPU_JWT_SIGNING_KEY`, `RUNPOD_API_KEY` and the S3 storage variables;
- the Docker Hub secrets in GitHub.

### Step 1 — Build and verify the image

1. GitHub → **Actions** → **Build GPU image runtime (ComfyUI)** → **Run
   workflow**. It also runs by itself when `apps/gpu-image` changes.
2. Wait for both jobs, **build** and **verify**, to finish green. The first
   build takes a long time: it installs PyTorch and ComfyUI.
3. Open the run's **Summary** and copy the line
   **Pin and approve: `cineforge-gpu-image@sha256:…`**.
4. In the verification table, every row must show ✅. Deploy only a
   **VERIFIED** digest. You can re-check any digest later: Actions → **Verify
   GPU worker image** → profile `gpu-image` → paste `sha256:…`.

There is no `:latest` tag. The image is only ever tagged `sha-<commit>`, and
you deploy it by digest.

### Step 2 — Pin the model revisions

1. On huggingface.co open **Comfy-Org/Qwen-Image_ComfyUI** → **Files and
   versions** → **History**.
2. Copy the newest commit's full 40-character id (the copy button next to it).
   This is `QWEN_IMAGE_COMFY_REVISION`.
3. Do the same for **Comfy-Org/Qwen-Image-Edit_ComfyUI**. This is
   `QWEN_IMAGE_EDIT_COMFY_REVISION`.
4. On each model card, check that the licence says **apache-2.0**. Save a PDF
   of each model card and of the Qwen2.5-VL-7B-Instruct card for the licence
   archive.

### Step 3 — Create the pod

In RunPod → **Pods** → **Deploy**:

| Setting | Value |
|---|---|
| GPU | **1× L40S 48 GB** (or RTX 6000 Ada / A6000 / A40 48 GB). An H100 80 GB is faster and swaps models less. Do not use 24 GB cards. |
| CUDA filter | **12.8 or newer** (the host driver must be at least 570) |
| Container image | `<your-dockerhub-user>/cineforge-gpu-image@sha256:<digest from step 1>`. Paste the whole thing, digest included. |
| Container disk | 30 GB |
| Volume disk | **150 GB**, mounted at `/root/.cache/huggingface` (keeps the ~75 GB of weights across restarts) |
| Expose HTTP ports | `8000` |
| RAM | 64 GB or more if you can choose (models are moved out of the GPU between the two workflows) |

**Environment variables on the pod:**

| Name | Value |
|---|---|
| `DEPLOYMENT_ID` | a name you choose, for example `dep-comfy-1` |
| `GPU_JWT_PUBLIC_KEYS` | the same `k…:…` public key the video pod has (from `gateway:admin keygen`) |
| `GATEWAY_MODE` | `report` for now |
| `QWEN_IMAGE_COMFY_REVISION` | the 40-character id from step 2 |
| `QWEN_IMAGE_EDIT_COMFY_REVISION` | the 40-character id from step 2 |
| `HF_TOKEN` | optional: a Hugging Face read token, if downloads are rate-limited |

**Never** put `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `AWS_*` or the signing key
(`GPU_JWT_SIGNING_KEY`) on the pod.

Start the pod. The first start downloads about 75 GB, which takes roughly 10–40
minutes. `https://<podId>-8000.proxy.runpod.net/livez` says `ok` almost
immediately, while the models are still downloading.

### Step 4 — Register and approve the deployment

Run these from a machine with the worker's env: `DATABASE_URL`,
`GPU_JWT_SIGNING_KEY`, `RUNPOD_API_KEY` and `GATEWAY_OPERATOR=<your name>`.

```
pnpm --filter @cineforge/worker gateway:admin register --id dep-comfy-1 --model comfyui-image \
  --url https://<podId>-8000.proxy.runpod.net --pod <podId>
pnpm --filter @cineforge/worker gateway:admin approve --id dep-comfy-1 \
  --image <your-dockerhub-user>/cineforge-gpu-image@sha256:<digest>
```

`approve` checks that:

- RunPod reports exactly that image digest;
- the pod reports `dep-comfy-1`;
- every model is pinned, with its weights digest resolved.

If it answers `UNPINNED_OR_PLACEHOLDER`, the models are still downloading:
wait and run it again. It stores the pod's manifest, including the workflow
hashes.

### Step 5 — Turn it on in the worker

On Render, worker service → **Environment**:

| Name | Value |
|---|---|
| `IMAGE_PROVIDERS` | `comfyui,fal,openai`. ComfyUI is tried first; when the pod is off or fails, fal and then OpenAI draw the still and the record says which one did. |
| `COMFYUI_GPU_URL` | `https://<podId>-8000.proxy.runpod.net` |

`GPU_JWT_SIGNING_KEY` and the `S3_*` variables are already there from the video
gateway setup.

Redeploy the worker. Within about 5 minutes the system page shows **Own image
GPU (ComfyUI)** as *Experimental*. It shows *Unavailable* with the reason until
the pod reports real execution.

Optional: run the acceptance probe `image:comfyui` (docs/55). It draws a real
still, reads it back and decodes it.

### Step 6 — Enforce

1. On the pod, set `GATEWAY_MODE=enforce`. Make sure no S3 or AWS keys are set
   on the pod, then restart it.
2. Run:

   ```
   pnpm --filter @cineforge/worker gateway:admin enforce --id dep-comfy-1
   ```

   It checks, live:
   - the image digest;
   - that the pod is in `enforce` mode;
   - the deployment id;
   - that the manifest, including the workflow hashes, is identical to the
     approved one;
   - that an unauthenticated request and a forged token are both refused.

**Rollback:**

- `gateway:admin report --id dep-comfy-1 --reason "…"`;
- or remove `comfyui` from `IMAGE_PROVIDERS`. Stills then come from fal or
  OpenAI again straight away.

**Updating the image:**

1. Build and verify the new image (step 1).
2. Change the pod's image to the new digest.
3. Run `approve` again with the new digest, then `enforce`.

**Cost:** the pod bills while it runs. CineForge does not start or stop this
pod for you (see §8). Stop it from RunPod when you are not producing; stills
then fall back to the next provider.

## 7. Environment variables

**Pod (`apps/gpu-image`):**

| Name | Default | Meaning |
|---|---|---|
| `DEPLOYMENT_ID` | — | token audience; required in enforce |
| `GPU_JWT_PUBLIC_KEYS` | — | `kid:base64url(raw Ed25519 public key)`, comma-separated for key rotation |
| `GATEWAY_MODE` | `report` | `report` or `enforce`; any other value refuses to start |
| `QWEN_IMAGE_COMFY_REVISION` | — | 40-hex commit of Comfy-Org/Qwen-Image_ComfyUI |
| `QWEN_IMAGE_EDIT_COMFY_REVISION` | — | 40-hex commit of Comfy-Org/Qwen-Image-Edit_ComfyUI |
| `HF_TOKEN` | — | optional Hugging Face token |
| `CINEFORGE_PLACEHOLDER` | — | `1` = no model, placeholder PNGs (tests/verification only) |
| `COMFYUI_DIR`, `COMFYUI_WORK_DIR`, `COMFYUI_PORT`, `CINEFORGE_WORKFLOWS_DIR` | set in the image | where ComfyUI, its job folders and the registry are |
| `GATEWAY_ALLOW_HTTP_STORAGE` | — | `1` allows plain-http one-time URLs (local tests only) |

**Worker:**

| Name | Meaning |
|---|---|
| `IMAGE_PROVIDERS` | ordered list; `comfyui` is used only when listed |
| `COMFYUI_GPU_URL` | the pod URL (must equal the registered `--url`) |
| `GPU_JWT_SIGNING_KEY` | Ed25519 signing key (shared with video) |
| `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`, `S3_REGION` | presign the one-time URLs |
| `GPU_GATEWAY_MODE` | global floor; `enforce` makes every deployment enforce |
| `RUNPOD_API_KEY` | image-digest attestation |
| `ALLOW_PLACEHOLDER_MEDIA` | `1` accepts placeholder stills (development only) |

## 8. What is real, and what is limited

**Real and tested here:**

- **The Python service:**
  - registry loading, licence, node and loader checks;
  - hashing;
  - filling slots: references, bypassing the LoRA node, defaults;
  - size and parameter limits;
  - refusing unknown workflows and extra fields;
  - every gateway refusal;
  - async jobs;
  - LoRA hash checks;
  - placeholder only with the flag;
  - the unpinned / no-CUDA / no-ComfyUI states;
  - pinned model linking and weights digests;
  - the ComfyUI client against a fake ComfyUI (submit, errors, timeout and
    interrupt).

  62 pytest tests, no GPU needed.
- **The TypeScript authority:**
  - every refusal;
  - verifying the result: key, size, PNG, sha256 read back;
  - a golden vector shared with Python, so both compute the same digest;
  - admin approve/enforce comparing workflow hashes.
- **The client and the worker provider**, including the fallback chain and
  ledger rows with workflow provenance.
- **The Capability Registry** entry `self_hosted_image_runtime`.
- **An end-to-end test** (`packages/model-adapters/e2e/image-runtime.e2e.test.ts`,
  run with `GATEWAY_E2E=1`): the real Python service in enforce mode, driven
  by the real TypeScript authority. It covers register → approve → enforce →
  signed still → one-time write → read-back verification, and the
  `AUTHZ_MISMATCH` refusals.
- **Migration 0064**, validated on a scratch Postgres with all migrations
  0026–0062 and 0064.

**Not verified in this environment:**

- **The Docker build.** Docker was not available. The Dockerfile was checked
  by reading it and by tests (pins, shared COPY lines, ComfyUI commit equal to
  the registry). The first CI build is the real test. Specific risks:
  - ComfyUI v0.37.4's README recommends cu130 PyTorch builds. We pin torch
    2.8.0 / cu128 for wider driver support, and the README says 2.7 or newer
    is supported;
  - `comfy-kitchen` and `comfy-aimdo` may want newer torch. If the build or
    the first start fails on this, move the torch pins in `constraints.txt`
    and the Dockerfile together.
- **Real generation on a GPU.** The graphs follow ComfyUI's own Qwen-Image
  and Qwen-Image-Edit-2511 blueprints at the pinned commit (node names, inputs
  and file names were checked against that source), but no image has been
  drawn yet. The defaults (20 steps, CFG 4, shift 3.1) have not been
  benchmarked (docs/38 §AE bake-off).
- **The Hugging Face revisions and model cards.** Hugging Face could not be
  reached from here, so you pin the revisions (step 2). Until you do, the
  service refuses to run: `MODEL_UNPINNED`, and it refuses to start in enforce
  mode.

**Limits by design or still open:**

- **LoRAs.** The slot exists and is verified by hash, but CineForge's
  character LoRAs are Wan *video* LoRAs and do not fit Qwen-Image. The worker
  never sends one. Image LoRA training is future work.
- **The seed-still prompt** is still compiled with the `openai-image` profile:
  the shot processor chooses it, and that file was frozen for this work. The
  `comfyui-qwen-image` compiler profile exists (it has a still negative
  prompt and a 2,000-character budget). Switching the seed prompt to it is a
  one-line change in `video.processor.ts`. The provider sends the same still
  negative prompt either way.
- **References:** at most 3 (the node takes `image1..image3`). Extra ones are
  reported in `referenceGap`. If the reference workflow fails, the still is
  drawn from text and the reason is kept. A gateway refusal is never retried
  with another workflow.
- **Pod lifecycle:** the worker's GPU manager does not start or stop the
  image pod. While it is stopped, stills come from the next provider.
- **One still at a time per pod.** Async jobs are kept in memory, so a
  restarted pod forgets them and the still falls back.
- **Image grants have no shot or project-status check**, only the project
  folder scope. Stills are drawn for shots, references and portraits that the
  worker has already authorized.
- **Metering** counts images (as for fal and OpenAI). The GPU time is recorded
  on the grant (`gpu_ms`) but not billed separately yet.
- **Generated database types** (`packages/db/supabase/types.ts`,
  `apps/web/lib/database.types.ts`) are regenerated after 0064 is applied
  live, as usual.
- **The ComfyUI licence:** GPL-3.0. Running it as a service does not
  distribute it. Shipping the image to a customer would (docs/38 §AT.15).

## 9. Files

| Area | Files |
|---|---|
| Service | `apps/gpu-image/app/{__init__,server,registry,runtime,comfy,weights,png}.py`, `workflows/*`, `Dockerfile`, `requirements*.txt`, `constraints.txt`, `scripts/install_custom_nodes.py`, `tests/*` |
| Shared gateway (unchanged) | `apps/gpu-worker/app/gateway/*`, `media_io.py`, `code_digest.py` |
| Build and verify | `.github/workflows/build-gpu-image.yml`, `verify-gpu-image.yml` (`profile` input), `apps/gpu-worker/scripts/verify_image.py` (`--profile gpu-image`), `ci.yml` (job `gpu-image` and the verifier steps) |
| Worker side | `packages/model-adapters/src/gateway/image-authority.ts`, `src/comfyui/image-client.ts`, `apps/worker/src/images/comfyui.ts`, `providers.ts`, `ledger.ts`, `gateway/index.ts`, `truth/capabilities.ts`, `main.ts`, `acceptance/probes.ts` |
| Registry and UI | `packages/shared/src/truth/capabilities.ts`, `apps/web/lib/{truth,system}.ts` |
| Prompt | `packages/movie/src/prompt/compilers.ts` (`comfyui-qwen-image`, `STILL_NEGATIVE`) |
| Data | `packages/db/supabase/migrations/0064_image_runtime_provenance.sql` + test; Prisma `ImageGeneration` fields |
