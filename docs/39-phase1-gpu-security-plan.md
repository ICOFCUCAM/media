# 39 — Phase 1 implementation plan: GPU security / Media Runtime Gateway

Status: **APPROVED (2026-10-06) with all six recommended options in §7. PR 1 merged (`67ac8ae`); PR 2 implemented (under review). Production stays in report mode.**
Implements: docs/38 v2.6, **§AX.2 Phase 1**, which is specified in §O, §P, §Y, §AV.2, §AV.3 and §AW.11 (tests 5, 6).
Date: 2026-10-06.

## 1. Scope

Phase 1 builds one boundary:

```
Cineforge (apps/worker) ──► Media Runtime Gateway ──► existing Wan GPU worker (apps/gpu-worker)
```

The boundary is built so that later runtimes reuse it without change: Wan 2.1/2.2, ComfyUI workers (Phase 6), Diffusers workers, and future image, video and audio runtimes.

**In scope:**
- authenticated GPU requests;
- authorization of the requesting Cineforge job;
- workflow and model authorization;
- short-lived execution credentials;
- no permanent storage credentials on GPU workers;
- request, body and deployment binding;
- one-time media upload and download;
- audit and provenance;
- rejection of model substitution;
- compatibility with the existing Wan worker.

**Out of scope (explicitly not started):**
- ComfyUI;
- Qwen-Image or any new image worker;
- new video models;
- A/V synchronization implementation;
- model migration;
- billing changes;
- the timing-report contract (Phase 3).

The external providers (fal.ai, OpenAI, `EXTERNAL_VIDEO_API_URL`) are not GPU paths that Cineforge operates. They are untouched here and are retired later by model migration.

## 2. What the repository does today (inspected)

| # | Finding | Where | Consequence |
|---|---|---|---|
| F1 | **No authentication on any GPU endpoint.** `/generate`, `/train`, `/warm`, `/health`, `/capabilities` and `/tasks/{id}` accept any caller. | `apps/gpu-worker/app/server.py` | Anyone who has the pod's proxy URL can run inference on our GPU or write into our bucket (via F3). |
| F2 | **The RunPod account API key is sent to the pod** as `Authorization: Bearer <RUNPOD_API_KEY>` on every call. The pod ignores it. | `packages/model-adapters/src/runpod-client.ts` (`headers()`), `registry.ts` (`buildClusterRegistry`) | Our most powerful infrastructure credential (it can start, stop and create pods and spend money) travels to the GPU host and its proxy for no purpose. |
| F3 | **The GPU pod holds permanent bucket credentials** (`S3_ACCESS_KEY` / `S3_SECRET_KEY`, the Supabase S3 keys) and uses boto3 directly. | `apps/gpu-worker/app/pipeline.py` (`_download`, `upload_clip`); README "Env on the pod" | A compromised pod can read and overwrite every project's media. |
| F4 | **The pod chooses the output key** (`_generated/{MODEL_NAME}/{uuid}.mp4`), and Cineforge writes whatever key comes back into `shots.video_key` without checking it. | `server.py` `generate()`; `apps/worker/src/processors/video.processor.ts` (`result.videoKey` stored as is) | A compromised or buggy pod can point a shot at any object in the bucket, including another project's video. Outputs also sit outside `projects/{projectId}/` (§P). |
| F5 | **Inputs are raw bucket keys** (`referenceImageKeys`, `referenceVideoKeys`, `loraKeys`) with no project scoping. | `GenerateInput` in `server.py`; `resolveContinuity()` in `video.processor.ts` | Nothing limits which objects the pod reads. |
| F6 | **Model identity is unpinned and unverifiable:**<br>• the model is chosen by env (`MODEL_NAME`, `WAN_MODEL_ID`, `WAN_I2V_MODEL_ID`);<br>• `from_pretrained` loads it with no `revision`;<br>• the switch to the I2V model is implicit, triggered when a reference image is present.<br>Cineforge records `modelVersion` from a static constant (`MODEL_VERSIONS`), not from what actually ran. | `pipeline.py` (`MODEL_IDS`, `_load_real`, `_load_i2v`); `cost.ts` | An upstream repository change, or an env edit, silently swaps the weights. Provenance records a model that may not have run. |
| F7 | **`/train` is a stub and unauthenticated.** The LoRA client sends `LORA_TRAINER_KEY`, which nothing verifies. | `trainer.py`, `lora/lora-client.ts` | Open endpoint that produces placeholder artifacts. |
| F8 | **No audit trail.** `gpuMs` is self-reported by the pod, and no record links a request, a job and an output. | — | Nothing for incident investigation or provenance. |
| F9 | **Deployment pulls `:latest`.** `build-gpu-worker.yml` pushes `cineforge-gpu:latest` on every merge that touches `apps/gpu-worker/**`. | `.github/workflows/build-gpu-worker.yml` | A merged security change would reach production on the next pod restart, uncoordinated with secrets and env. A later rollback could silently re-deploy an unauthenticated image. |
| F10 | **GPU-worker CI is an import check only.** | `.github/workflows/ci.yml` job `gpu-worker` | Security behavior is untested. |
| F11 | **Health, warm and capabilities are called by Cineforge** (lifecycle/health via `RunpodClient.health()` / `warm()`). | `runpod-client.ts`, `packages/gpu` | Once authenticated, these need their own scopes. Only `/livez` stays public. |
| F12 | **Hunyuan uses the same worker image and client.** | `hunyuan.adapter.ts`, `registry.ts` | It inherits the boundary automatically. No Hunyuan-specific work is done. |

## 3. Target design (mapped to docs/38)

The gateway has two halves that together form the single boundary of §AV.2.

### 3.1 Gateway Authority — the Cineforge side (`packages/runtime-gateway`, TypeScript)

Called by `video.processor.ts` in place of the bare `RunpodClient`. For each GPU call it:

1. **Authorizes the job (requirement 2).**
   - Re-reads the shot row and requires all of the following:
     - status `GENERATING`;
     - project not deleted;
     - model allowed by the existing eligibility and policy rules;
     - every input key under `projects/{projectId}/` of the same project.
   - Anything else is refused before a token exists.
   - Legacy `_generated/…` keys stay accepted only as **read** inputs, as named exceptions.
2. **Binds the outputs (requirements 7, 9).** Cineforge, not the pod, chooses the output keys: `projects/{projectId}/video/{grantId}.mp4` and `.thumb.webp` (§P layout).
3. **Presigns the I/O (requirements 5, 7).**
   - GET for each input, TTL ≤ 15 min.
   - PUT for each output, TTL ≤ 30 min, to a unique key that is never reused; conditional create where the store supports it (§O).
4. **Computes the authorization digest (requirements 3, 9)** as in §AV.3. Phase 1 fills it as follows:
   - `workflow_id@version`: the Diffusers request template, e.g. `wan-t2v@1` or `wan-i2v@1`;
   - `runtime`: `diffusers@<version>`;
   - `graph_sha256`: the request-template hash;
   - `(model_role, model_version_id, weights_revision, weights_digest)`: one entry per pipeline used;
   - `(lora_key, lora_sha256)`;
   - `node_set_digest`: `"none"`;
   - `timing_contract_digest`: requested duration, fps and size. Phase 3 replaces it with the full contract.
5. **Mints the execution credential (requirements 1, 4, 6).** A JWT with:
   - `iss=cineforge-worker`, `aud=<DEPLOYMENT_ID>`;
   - `sub=<grantId>` (equal to the body's `jobId`);
   - `scope` ∈ {`video:run`, `status`, `warm`, `train`};
   - `jti`, `iat`, `exp ≤ iat+300 s`;
   - `bh=sha256(exact body bytes)`;
   - `authz=<digest>`;
   - `kid`.
6. **Records the audit trail (requirement 8).**
   - At mint time it writes a grant row with: deployment, job, scope, digest, body hash, input and output keys, expiry.
   - On completion it checks that the pod's result names exactly the granted output key, then HEADs the object for existence, size and content type.
   - It records the outcome, error code and `gpuMs`.
   - A result naming any other key is rejected; `shots.video_key` is never written from pod-supplied text (fixes F4).
7. **Removes the RunPod account key from GPU requests (fixes F2).** It stays only where the RunPod control API needs it (`packages/gpu`).

### 3.2 Gateway Enforcer — the GPU side (`apps/gpu-worker/app/gateway/`, Python)

This is a framework-independent verification core plus a thin FastAPI dependency.

- **In Phase 1** it runs in-process in front of the existing Wan/Hunyuan endpoints.
- **In Phase 6** the same core runs as the reverse-proxy sidecar in front of ComfyUI on 127.0.0.1 (§AT.10, §AV.2). The checks stay identical; only the deployment form changes.

**Check order** (§AV.2), on every request except `GET /livez`:
1. signature (key chosen by `kid`);
2. expiry and not-before (±30 s skew);
3. `jti` replay (in-memory cache for the token lifetime + skew);
4. `aud == DEPLOYMENT_ID`;
5. `scope` allowed for the endpoint;
6. `sub == body.jobId`;
7. `bh == sha256(raw body)`;
8. workflow authorization;
9. model authorization: recompute the digest from the request and the worker's resolved model manifest, and reject with `403 AUTHZ_MISMATCH` on any difference;
10. timing fields present;
11. resource limits (existing `WAN_MAX_*` caps; body size limit);
12. then execution.

**Other enforcer rules:**
- **Model manifest (fixes F6).**
  - At startup the worker resolves each pipeline's Hugging Face snapshot.
  - `WAN_MODEL_REVISION` / `WAN_I2V_MODEL_REVISION` must be pinned to a commit SHA, or startup fails in enforce mode.
  - The weights digest is computed from the snapshot's sorted `(file, blob sha256)` list. HF LFS blobs are already content-addressed by SHA-256, so this is cheap.
  - LoRA bytes are hashed after download and must match the grant.
  - The worker exposes its manifest digest only to `status`-scoped callers.
- **Storage (fixes F3, F5).**
  - Inputs are fetched only from the presigned GET URLs; outputs are written only to the presigned PUT URLs.
  - boto3 and the `S3_*` reads are removed.
  - In enforce mode the worker refuses to start if `S3_ACCESS_KEY`, `S3_SECRET_KEY` or `AWS_*` credentials are present (fail closed).
- **Endpoints.**
  - New `GET /livez` returns `ok` only.
  - `/health` and `/capabilities` need `status`; `/warm` needs `warm`; `/generate` needs `video:run`.
  - `/train` and `/tasks/*` need `train`, and are **disabled (`503 TRAINER_DISABLED`) in enforce mode while the trainer is a stub** (fixes F7).
- **Logging.** One structured line per decision: `grantId`, `jti`, decision, reason code, digest prefix. No prompts and no URLs (signed URLs are secrets).

### 3.3 Credentials

- **Recommended: Ed25519 (EdDSA) asymmetric tokens rather than §O's HS256.**
  - Cineforge holds the private signing key; each GPU deployment holds **only the public key**.
  - A compromised GPU host then has nothing it can forge or reuse anywhere. This matches requirement 5 ("no permanent credentials on GPU workers") more strictly than a shared HMAC secret.
  - `kid`-based dual-key rotation as in §O (`GPU_JWT_PUBLIC_KEYS=kid1:…,kid2:…`).
  - Libraries: `jose` (Node), `PyJWT[crypto]` (Python).
  - This is decision **D1**.
- **Per-deployment identity.** `DEPLOYMENT_ID` is set on the pod, and Cineforge's deployment map ties each GPU URL to its deployment id. A token for one pod is useless on another.

### 3.4 Data (requirement 8)

One migration, `0026_runtime_gateway.sql`, plus the Prisma mirror, following the repository's existing dual-schema convention:

| Table | Purpose | Access |
|---|---|---|
| `runtime_deployments` | `id` (`DEPLOYMENT_ID`), runtime, approved model manifest digest(s), status, `kid`s | admin read; service role write |
| `runtime_execution_grants` | grant id, `jti`, deployment, shot id, project id, scope, `authz_digest`, `body_sha256`, input keys, output keys, issued/expires, outcome (`issued` / `completed` / `rejected` / `expired` / `failed`), error code, `gpu_ms`, output size, completed at | service role only; RLS denies clients |

These are the first concrete provenance rows. The fuller `generation_provenance` table (§AU.16) comes in Phase 4. **No billing tables or credit logic change.**

## 4. Compatibility and rollout with the existing Wan worker (requirement 10)

The production pod pulls `:latest` (F9). The rollout therefore makes each step safe whichever side deploys first.

| Step | Cineforge (Render) | GPU pod (RunPod) | Production safe because |
|---|---|---|---|
| R0 | — | Build workflow tags images `:sha-<commit>` (plus `:latest`); the pod is pinned to a specific tag | No merge reaches production without an explicit pod tag change |
| R1 | Sends a token, `jobId`, presigned URLs **and** the legacy fields; `GATEWAY_RESULT_MODE=lenient` (accepts a legacy `_generated/` result with an audit warning) | Old image, unchanged | Old pod ignores the extra fields (pydantic's default `extra='ignore'`) |
| R2 | Same | New image with `GATEWAY_MODE=report`: verifies and logs, serves regardless, uses presigned URLs when present | Verification is observed in production without blocking |
| R3 | `GATEWAY_RESULT_MODE=strict` (only the granted output key is accepted) | `GATEWAY_MODE=enforce`; `S3_*` removed from the pod env; revisions pinned | Both sides enforce |
| R4 | Rotate the Supabase S3 keys (they were present on a GPU host and are treated as exposed) and update Render; stop sending `RUNPOD_API_KEY` to pods (done since R1) | — | The old credentials are dead |

Steps R0–R4 need dashboard actions by you: the RunPod pod image tag and env, the Render env, and the Supabase S3 key rotation. I'll supply an exact runbook in the rollout PR; I cannot perform those actions from here.

## 5. Tests (must pass before each PR merges)

**GPU side** (pytest, placeholder mode, no GPU, added to CI):
- **Authentication:**
  - no token, bad signature, expired token, future `iat`;
  - wrong `aud` (another deployment), wrong `scope` for each endpoint;
  - replayed `jti`;
  - body altered after signing (`bh`), `sub` ≠ `jobId`.
- **Model authorization:**
  - authz digest mismatch from each source: different model revision, LoRA hash, template, and timing fields (regression test 5, `AUTHZ_MISMATCH`);
  - unpinned revision refuses to start in enforce mode.
- **Endpoints and storage:**
  - `/livez` leaks no model or version information;
  - every non-`livez` route rejects requests without a token (regression test 6);
  - startup with `S3_*` present refuses in enforce mode;
  - `/train` is disabled in enforce mode.

**Cineforge side** (vitest, `packages/runtime-gateway`):
- **Mint-time refusals:**
  - input key from another project;
  - shot not `GENERATING`.
- **Credential and URL limits:**
  - token TTL ≤ 300 s;
  - presign TTLs ≤ 15/30 min;
  - unique output keys.
- **Result checks:**
  - a result naming a non-granted key is rejected, and `video_key` is not written;
  - a missing object on HEAD is treated as failed.
- **Audit:** grant rows are written for issue, complete and reject.

**Cross-language golden vectors.** Tokens and digests minted in TypeScript and verified in Python, from committed fixtures, so the two halves cannot drift.

**End-to-end in CI.**
- Placeholder pod in a container, with the real worker code issuing a grant.
- The output lands only at the granted key, against a local S3 (MinIO) container.

## 6. Delivery as small PRs (I stop after each for your review)

| PR | Content | Requirements |
|---|---|---|
| **1** | GPU-side enforcer core + FastAPI dependency (`off`/`report`/`enforce`), `/livez`, scopes, `/train` disabled in enforce mode, pytest in CI, immutable image tags (R0) | 1, 4, 6, 10 |
| **2** | `packages/runtime-gateway` authority: job authorization, minting, audit migration + Prisma; swap `RunpodClient` headers (removes `RUNPOD_API_KEY` from GPU calls); lenient result mode | 1, 2, 4, 6, 8 |
| **3** | Presigned one-time I/O on both sides; pod drops boto3 and `S3_*`; `projects/{projectId}/video/…` output layout; strict output verification | 5, 7, 8, 9 |
| **4** | Model manifest pinning + §AV.3 digest (workflow + model + LoRA + timing fields) on both sides; golden vectors | 3, 9 |
| **5** | Rollout runbook (R1–R4), env docs, key-rotation checklist, end-to-end CI test, docs/38 status note | all |

Requirement → PR → docs/38 section:

| # | Requirement | PR | docs/38 |
|---|---|---|---|
| 1 | Authenticated GPU requests | 1, 2 | O, AV.2 |
| 2 | Authorization of the requesting Cineforge job | 2 | O (`sub`), AV.2 |
| 3 | Workflow/model authorization | 4 | AV.3 |
| 4 | Short-lived execution credentials | 1, 2 | O |
| 5 | No permanent storage credentials on GPU workers | 3 | O, P, AV.1 (8) |
| 6 | Request/body/deployment binding | 1, 2 | O (`bh`, `aud`) |
| 7 | One-time media upload/download | 3 | O, P |
| 8 | Audit trail and provenance | 2, 3 | AV.2 ("every decision is logged"), Y |
| 9 | Protection against model substitution | 3 (output), 4 (model) | AV.3, AW.11 test 5 |
| 10 | Compatibility with the existing Wan worker | 1–5 (R0–R4) | AX.2 Phase 1 |

## 7. Decisions (approved 2026-10-06 — recommended option for all six)

Recorded outcome: D1 Ed25519 · D2 in-process enforcer · D3 `/train` disabled in
**every** mode (not only enforce) · D4 migration `0026` approved — delivered in
PR 2 with the Cineforge side that writes it · D5 rotate the Supabase S3 keys
only after enforcement is live and verified · D6 native signed-upload fallback
if presigned PUT is unsupported, keeping URLs short-lived, scoped and
single-use.

**PR 1 as delivered.** GPU-side only: the enforcer, scopes, `/livez`,
`/train` disabled, and — moved forward from PR 4 because it is GPU-side code —
the authorization digest (version 1, with a golden vector for the TypeScript
minter) and the model manifest with pinned revisions. Storage is untouched
(PR 3). Default `GATEWAY_MODE=report`, so the current Cineforge client keeps
working when the pod picks up the new image.

Original decision text:


1. **D1 — Token algorithm.**
   - **Recommended:** Ed25519 (GPU holds only a public key).
   - **Alternative:** HS256 per deployment, as written in §O.
   - If you approve Ed25519, PR 2 records it in docs/38 §O as an amendment.
2. **D2 — Enforcer form in Phase 1.**
   - **Recommended:** in-process for the existing worker, with the same core reused as the ComfyUI sidecar in Phase 6.
   - **Alternative:** a separate proxy process now.
3. **D3 — `/train`.**
   - **Recommended:** disabled in enforce mode until a real trainer exists. LoRA jobs then fail cleanly, and identity falls back to seed and reference frames, as it does today when `LORA_TRAINER_URL` is unset.
4. **D4 — Audit storage.** Approve the `0026` migration (two tables, no billing impact).
5. **D5 — Credential rotation (step R4).** You rotate the Supabase S3 keys after enforce mode is live. Until then, those keys should be treated as exposed to the GPU host.
6. **D6 — Supabase presigned PUT.**
   - To be verified in PR 3 against the live Storage S3 endpoint.
   - If presigned PUT or conditional create is not supported, the fallback is Supabase's native signed upload URL (single-use; no overwrite unless `upsert`).

## 8. Verification limits

- I verified the code paths above from the repository.
- I did **not** inspect:
  - the live RunPod pod's env;
  - the live Render env;
  - whether the production pod URL is a pod proxy URL or a serverless endpoint (the client shape implies a pod proxy).

  PR 5's runbook includes the checks you run to confirm these.


## 9. PR 2 as delivered — Cineforge controls and authorizes GPU execution

PR 2 carries what §6 split into PRs 2 and 3, per the "GO — start PR 2"
directive: token issuance, job authorization, audit (migration 0026),
image-digest pinning, enforcement configuration, and the one-time storage URLs
with the Supabase fallback. ComfyUI, models, A/V and billing are untouched.

**Chain of trust.** Cineforge job (shot row read fresh before dispatch) →
Gateway Authority (`packages/model-adapters/src/gateway`) checks the job, the
registered + approved deployment and, in enforce, the provider-attested image
digest → mints an Ed25519 token bound to deployment, scope, job, exact body and
the authorization digest computed from the **approved manifest** → the GPU
worker verifies it (PR 1) and recomputes the digest from what it would run →
execution reads/writes only through one-time URLs → Cineforge accepts only the
granted output key after a HEAD/size check → grant row completed.

**Image digest.** The authoritative running image comes from the provider's
control plane (RunPod `pod.imageName`), never from the pod. Enforcement needs it
to equal the approved `repo@sha256:<digest>`; the authority re-checks it on
dispatch (cached ≤ 60 s). `/capabilities` also reports the baked-in source
commit as status information. CI prints the digest of every built image.

**Modes.** Cineforge side: per-deployment `runtime_deployments.enforcement`
(default `report`), plus a global floor `GPU_GATEWAY_MODE` (default `report`).
GPU side: `GATEWAY_MODE` (default `report`). Deploying code changes none of
these. The only path to `enforce` for a deployment is
`gateway:admin enforce`, which checks live, at that moment: approval and
manifest; immutable approved image; provider-reported image equal to it; pod
reports enforce + its deployment id + the approved manifest; pod refuses an
unauthenticated request and a forged token. The switch and its evidence are
written to `runtime_gateway_events`; a database trigger also records every
change to a deployment row, however it is made.

## 10. Rollout runbook (operator actions)

| Step | Action | Production effect |
|---|---|---|
| 0 | Merge PR 2. Apply migration 0026 to the Supabase project (same as earlier migrations), regenerate `packages/db/supabase/types.ts`. | none — report mode; audit rows start appearing once keys are set |
| 1 | `pnpm --filter @cineforge/worker gateway:admin keygen` → set `GPU_JWT_SIGNING_KEY` on Render (secret) and `GPU_JWT_PUBLIC_KEYS` on the pod. Set `DEPLOYMENT_ID` on the pod. | calls become signed; pod (report mode) logs verification results |
| 2 | Pin the pod image to the digest from the build summary (`<user>/cineforge-gpu@sha256:…`), set `WAN_MODEL_REVISION` (and I2V/Hunyuan revisions if used), restart. | pinned image, pinned weights |
| 3 | `gateway:admin register --id … --model wan-2.1 --url … --pod …`, then `gateway:admin approve --id … --image <user>/cineforge-gpu@sha256:…` | deployment approved; still report |
| 4 | Verify presigned uploads work against Supabase: run one shot; check its grant row is `completed` (not `completed_unverified`) and the clip is under `projects/{id}/video/`. If uploads fail, set `GPU_UPLOAD_URL_MODE=supabase` (+ `SUPABASE_SERVICE_ROLE_KEY` on Render) and repeat. | outputs move to the project layout |
| 5 | Pod: `GATEWAY_MODE=enforce`, **remove** `S3_ACCESS_KEY` / `S3_SECRET_KEY` from the pod env, restart (it refuses to start otherwise). Then `gateway:admin enforce --id …`. | GPU path enforced end to end |
| 6 | After step 5 is verified with real shots: **rotate the Supabase S3 keys** and update them on Render only. Never put them back on a pod. | old keys (once present on a GPU host) are dead |
| 7 | Optional global floor: `GPU_GATEWAY_MODE=enforce` on Render, so any unregistered GPU URL is refused too. | strict everywhere |

Rollback at any point: `gateway:admin report --id … --reason "…"` (recorded)
and/or `GATEWAY_MODE=report` on the pod. Do not rotate the S3 keys (step 6)
before step 5 is live and verified: until then the report-mode path still uses
them.
