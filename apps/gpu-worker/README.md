# GPU worker — Wan 2.1 (primary) & Hunyuan Video (premium)

FastAPI service that runs the real video model on a GPU. The worker (Render)
drives it over HTTP; see docs/22 and docs/28. One image, one model per
container via `MODEL_NAME`. Every route except `GET /livez` is behind the
**Media Runtime Gateway** (see below; docs/38 §O, §AV.2; docs/39).

## Endpoints
- `POST /generate` — text/image-to-video; honors `referenceImageKeys` (seed →
  image-to-video when an I2V model is set), `loraKeys` (load + fuse), seed.
- `GET /livez` — public liveness probe; returns `ok` and nothing else.
- `GET /health` · `GET /capabilities` (scope `status`; capabilities include
  the deployment id and the resolved model manifest) · `POST /warm` (scope
  `warm`). `POST /generate` needs scope `video:run`.
- `POST /train` + `GET /tasks/{id}` — **disabled** (`503 TRAINER_DISABLED`)
  until a real trainer exists (docs/39 decision 3).

## Media Runtime Gateway (execution tokens)
Each request carries `Authorization: Bearer <JWT>` minted by Cineforge, signed
with **Ed25519**. The pod holds only public keys, so nothing on the GPU host can
mint a token. Checks, in order: signature (`kid`) → expiry and lifetime
(≤ 300 s, ±30 s skew) → issuer → `jti` replay → `aud` = this `DEPLOYMENT_ID` →
`scope` → `sub` = body `jobId` → `bh` = SHA-256 of the exact body → `authz` =
workflow + model authorization digest (`app/gateway/authz.py`, v2: every
LoRA bound by key **and** SHA-256) → explicit timing fields. LoRA bytes are
hashed after download and must match the authorized hash (`409
LORA_HASH_MISMATCH`); in `enforce` an unhashed LoRA is refused. Rejections return `{"detail": {"error": "<CODE>"}}`; every decision is
logged as one JSON line with no token, prompt, body or URL.

| Env | Meaning |
|---|---|
| `GATEWAY_MODE` | `report` (default: verify and log, never block) or `enforce` (reject). Any other value fails startup. |
| `DEPLOYMENT_ID` | this pod's identity; tokens for another deployment are rejected. Required in `enforce`. |
| `GPU_JWT_PUBLIC_KEYS` | `kid:base64url(raw 32-byte Ed25519 public key)`, comma-separated for rotation. Required in `enforce`. |
| `WAN_MODEL_REVISION` · `WAN_I2V_MODEL_REVISION` · `HUNYUAN_MODEL_REVISION` | Hugging Face commit SHA (40 hex) pinning each model. `enforce` refuses to start with an unpinned real model. |

In `enforce` mode the pod fails to start if `DEPLOYMENT_ID` or the keys are
missing, a real model is unpinned, or the primary model's weights digest
cannot be resolved. Run tests with
`pip install -r requirements.txt -r requirements-dev.txt && python -m pytest`.

Real inference runs when CUDA is available. Without CUDA the worker is
**unavailable**: `/generate` returns 503 `CUDA_UNAVAILABLE` and `/capabilities`
reports `"execution": "unavailable"`. The FFmpeg placeholder clip runs only when
`CINEFORGE_PLACEHOLDER=1` is set explicitly (tests, local runs), and every
response says so: `realExecution` is false and `execution.mode` is
`"placeholder"`. Cineforge refuses placeholder results in production.

Every `/generate` response carries `execution`: what actually ran (mode,
`t2v`/`i2v` conditioning, the real width, height, frames and steps after the
`WAN_MAX_*` caps, references used or ignored, LoRAs applied or skipped with the
reason). `width`/`height` are the produced dimensions, not the request.

## Deploy on RunPod
1. **Build & push** the image (from the repo root):
   ```sh
   docker build -f apps/gpu-worker/Dockerfile -t <registry>/cineforge-gpu .
   docker push <registry>/cineforge-gpu
   ```
2. **Create a RunPod Pod** (or Serverless endpoint) from the image:
   - **Primary (Wan 2.1):** GPU ≥ 12 GB (e.g. RTX 4090 / L4) for the default
     `Wan-AI/Wan2.1-T2V-1.3B-Diffusers`. `MODEL_NAME=wan-2.1`.
   - **Premium (Hunyuan):** GPU ≥ 45 GB (A40/A100 48 GB). `MODEL_NAME=hunyuan`.
   - Run **one pod per model** so VRAM is predictable.
3. **Persist weights:** mount a RunPod **network volume** at
   `/root/.cache/huggingface` so the model downloads once, not every cold start.
   (Or bake weights into the image.)
4. **Env on the pod:** `MODEL_NAME`, the gateway env above, `S3_*` (same
   bucket as the app, so it can read reference frames / write clips — removed
   in docs/39 PR 3, when the pod switches to one-time presigned URLs),
   optionally `WAN_MODEL_ID` / `HUNYUAN_MODEL_ID` / `WAN_I2V_MODEL_ID` with
   their `*_REVISION` pins. Pin the pod to an immutable `sha-<commit>` image
   tag rather than `latest`.
5. **Wire it to the worker (Render):** set on the Render worker
   `WAN_GPU_URL=https://<wan-pod>` and/or `HUNYUAN_GPU_URL=https://<hunyuan-pod>`
   (or `WAN_GPU_URLS` / `HUNYUAN_GPU_URLS` for a comma-separated cluster), plus
   `RUNPOD_API_KEY` + `RUNPOD_*_POD_ID`/`*_ENDPOINT_ID` for auto start/stop
   (docs/23). The worker round-robins, dispatches by tier, and shuts the GPU
   down when idle.

## Model ids (override via env)
| Env | Default | Notes |
|---|---|---|
| `WAN_MODEL_ID` | `Wan-AI/Wan2.1-T2V-1.3B-Diffusers` | budget primary; 14B for higher quality |
| `WAN_I2V_MODEL_ID` | *(unset)* | set to a Wan I2V repo to enable seed-frame → image-to-video |
| `HUNYUAN_MODEL_ID` | `hunyuanvideo-community/HunyuanVideo` | premium |

## Notes / not-yet
- **Reference-video (v2v)** isn't applied by these diffusers pipelines yet (the
  key is plumbed; it's a future step).
- Tune `extra.steps` / `extra.guidance` per model. The defaults (30 steps,
  guidance 5.0) are a reasonable starting point.
- This inference code follows the diffusers API but **hasn't been run on a GPU
  in CI** — expect to pin exact `diffusers`/`torch` versions to your chosen
  model on first deploy.
