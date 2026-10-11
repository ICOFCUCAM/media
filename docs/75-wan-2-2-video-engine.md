# 75: Wan 2.2, your own video engine (W28)

docs/38 §E names Wan 2.2 as CineForge's license-safe production video engine.
Its licence is Apache-2.0: commercial use, any country, no revenue limit.
Wan 2.1 (the 1.3B text-to-video model) becomes the legacy fallback. W28
builds Wan 2.2 into the same GPU service, behind the same gateway, with the
same job contract.

## What is built

| Part | What it does |
|---|---|
| GPU service (`apps/gpu-worker`, `MODEL_NAME=wan-2.2`) | Runs **Wan2.2-TI2V-5B**, one model for both text-to-video and image-to-video. Native 720p (1280×704, or 704×1280 portrait) at 24 fps, up to 121 frames (5 s). Fits a 24–48 GB GPU, so your A40 works. |
| Optional 14B model | Set `WAN22_I2V_MODEL_ID=Wan-AI/Wan2.2-I2V-A14B-Diffusers` (and its revision) on an 80 GB GPU (H100 / A100 80 GB). The larger two-expert model then animates the stills. |
| Starting from the approved still | Every shot that has a seed still (the storyboard picture, with wardrobe, place and brand references) is animated from that picture (image-to-video), not drawn again from text. This is what keeps people, vans and logos the same across shots. |
| Its own limits | 1280×704, 121 frames and 40 steps by default, instead of Wan 2.1's 832×480, 25 frames and 20 steps. The `WAN_MAX_*` variables still override them. |
| Pinned weights | `WAN22_MODEL_REVISION` (and `WAN22_I2V_MODEL_REVISION`) pin the exact Hugging Face commit. The gateway refuses to enforce an unpinned model. |
| Routing | `VIDEO_PRIMARY_MODEL=wan-2.2` on the worker sends every shot that was planned for Wan 2.1 to Wan 2.2, logged as `video.routed`. Shots that asked for another engine are not touched. |
| Pod start and stop | `WAN22_GPU_URL` and `RUNPOD_WAN22_POD_ID` give Wan 2.2 its own pool: it wakes on demand and sleeps when idle, like Wan 2.1. |
| Capability report | The site shows Wan 2.2 as the video engine once its worker reports in. |
| Image check | The Docker build fails if the pinned libraries cannot load the Wan 2.2 pipelines. A broken image never reaches your pod. |

## How to switch your pod to Wan 2.2 (owner steps)

You reuse the A40 pod you already have. Do these steps after the PR is merged
and the new image has passed its check (I give you the digest).

1. **RunPod → your pod → ⋮ → Edit Pod.**
   - **Container Image:** the new digest I give you (`icofcucam/cineforge-gpu@sha256:…`).
   - **Environment Variables:**

     | Key | Value |
     |---|---|
     | `MODEL_NAME` | `wan-2.2` |
     | `WAN22_MODEL_REVISION` | the newest commit code from `https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers/commits/main` |
     | `DEPLOYMENT_ID` | `dep-wan22-1` |

     Keep `GPU_JWT_PUBLIC_KEYS` from Phase 1 step 1. Save; the pod restarts.
     The first start downloads about 30 GB of weights and takes a while.

2. **DeployPro: point the worker at it.** The pod's address and id don't
   change; the worker also reads them under the Wan 2.2 names. The old
   `WAN_GPU_URL` / `RUNPOD_WAN_POD_ID` can stay: with `VIDEO_PRIMARY_MODEL`
   set, every Wan shot goes to Wan 2.2, and when both point at the same pod
   the worker manages it once (the idle Wan 2.1 pool never stops it while
   Wan 2.2 shots run).

   ```sh
   deploypro env set cineforge-worker WAN22_GPU_URL 'https://<POD_ID>-8000.proxy.runpod.net' --target production
   deploypro env set cineforge-worker RUNPOD_WAN22_POD_ID '<POD_ID>' --target production
   deploypro env set cineforge-worker VIDEO_PRIMARY_MODEL 'wan-2.2' --target production
   deploypro deploy cineforge-worker
   ```

3. **Register the deployment** (Phase 1 step 3, with the new name):

   ```sh
   pnpm --filter @cineforge/worker gateway:admin register --id dep-wan22-1 --model wan-2.2 --url https://<POD_ID>-8000.proxy.runpod.net --pod <POD_ID>
   pnpm --filter @cineforge/worker gateway:admin approve --id dep-wan22-1 --image icofcucam/cineforge-gpu@sha256:<digest>
   ```

4. **Make one short film.** Its shots should report 1280×704 at 24 fps, with
   conditioning `i2v` whenever the shot had a still.

To go back, set `MODEL_NAME=wan-2.1` on the pod and swap the worker variables back.

## What is still open

- **Not yet run on a real GPU.** It is covered by tests and the build check,
  but the first real film on it is the true test. Generation time per shot is
  an estimate until measured (`MODEL_COST` in `packages/model-adapters/src/cost.ts`).
- **Several takes per shot.** The worker already regenerates a shot that
  fails the quality gate when `QUALITY_GATES=enforce` and
  `VISUAL_REVIEW=enforce` are set. Making 2–3 takes per shot and keeping the
  best one is the next step.
- **Character and brand add-ons (LoRAs) trained for Wan 2.2.** The LoRA
  trainer targets Wan 2.1 today. LoRAs load per shot exactly as before, but
  2.1 LoRAs do not fit 2.2.
- **Wan 3.0.** It is cloud-only (no released weights or licence as of October
  2026). When Alibaba releases it, it is a new `MODEL_NAME` like this one.
