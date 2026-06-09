# GPU worker — Wan 2.1 (primary) & Hunyuan Video (premium)

FastAPI service that runs the real video model on a GPU, plus a per-character
LoRA trainer (`/train`). The worker (Render) drives it over HTTP; see docs/22
and docs/28. One image, one model per container via `MODEL_NAME`.

## Endpoints
- `POST /generate` — text/image-to-video; honors `referenceImageKeys` (seed →
  image-to-video when an I2V model is set), `loraKeys` (load + fuse), seed.
- `POST /train` + `GET /tasks/{id}` — per-character LoRA training.
- `GET /health` · `GET /capabilities` · `POST /warm`.

Real inference runs when CUDA is available; otherwise it falls back to a
placeholder clip (set `CINEFORGE_PLACEHOLDER=1` to force it).

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
4. **Env on the pod:** `MODEL_NAME`, `S3_*` (same bucket as the app, so it can
   read reference frames / write clips), optionally `WAN_MODEL_ID` /
   `HUNYUAN_MODEL_ID` / `WAN_I2V_MODEL_ID`, `LORA_TRAINER_*` if this pod also
   trains.
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
