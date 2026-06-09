# RunPod video setup — lighting up real video generation

This is the **last** piece. Everything else (screenplay, cast, scenes, shots,
images, narration) already runs on the Render worker. This guide deploys the
GPU service that turns shots into actual video clips.

## How it fits together

```
Render worker  ──HTTP /generate──▶  RunPod GPU pod (apps/gpu-worker, Wan 2.1)
                                         │ loads the model, renders a clip
                                         ▼
                                    your S3 bucket  ◀── worker reads the clip back
```

The GPU pod is a small FastAPI service (`apps/gpu-worker`) that loads Wan 2.1,
renders each shot, uploads the `.mp4` to **your S3 bucket**, and returns the key.
The Render worker calls it at `WAN_GPU_URL`, and (with `RUNPOD_API_KEY` +
`RUNPOD_WAN_POD_ID`) starts the pod when work arrives and stops it when idle, so
you only pay for GPU time you use.

The service listens on **port 8000** and needs **≥12 GB VRAM** for the default
`Wan-AI/Wan2.1-T2V-1.3B-Diffusers` model.

---

## Stage 1 — Get the image into a registry (the one hard part)

RunPod runs a Docker **image**, so `apps/gpu-worker` has to be built and pushed
to a registry (Docker Hub is free) first.

**Easiest:** let Claude build & push it for you. Then all you do is:
1. Create a free account at https://hub.docker.com
2. Create a **repository** named `cineforge-gpu` (Public is fine).
3. Account → **Settings → Personal access tokens** → **Generate** (Read/Write).
4. Give Claude your Docker Hub **username** + the **token** + repo name, and it
   builds `apps/gpu-worker/Dockerfile` and pushes `<username>/cineforge-gpu`.

**Or do it yourself** on any machine with Docker, from the repo root:
```sh
docker build -f apps/gpu-worker/Dockerfile -t <username>/cineforge-gpu .
docker push <username>/cineforge-gpu
```

---

## Stage 2 — Create the RunPod GPU pod

1. RunPod → **Pods** → **Deploy a Pod**.
2. **GPU:** an **RTX 4090 (24 GB)** or **L4 (24 GB)** is plenty for Wan 2.1 1.3B
   (~$0.34–0.69/hr; you'll auto-shut it down when idle). For the premium
   Hunyuan model you'd need an A40/A100 48 GB instead.
3. **Container image:** `<username>/cineforge-gpu` (from Stage 1).
4. **Expose HTTP port:** `8000`.
5. **Network volume:** create/attach one and mount it at
   `/root/.cache/huggingface`. This caches the model weights so they download
   **once** instead of on every start (Wan 2.1 1.3B is a few GB).

---

## Stage 3 — Set the pod's environment variables

On the pod (same values as your Render worker, so it can read seed frames and
write clips to the same bucket):

| Key | Value |
|---|---|
| `MODEL_NAME` | `wan-2.1` |
| `S3_ENDPOINT` | *(same as Render)* |
| `S3_ACCESS_KEY` | *(same as Render)* |
| `S3_SECRET_KEY` | *(same as Render)* |
| `S3_BUCKET` | *(same as Render)* |
| `S3_REGION` | `us-east-1` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `ASSET_PUBLIC_BASE_URL` | *(same as Render)* |

Start the pod. First boot downloads the weights (a few minutes); check the pod's
logs for the model loading, then `GET /health` should report `modelLoaded`.

---

## Stage 4 — Wire it to the Render worker

RunPod gives the pod a public URL like
`https://<POD_ID>-8000.proxy.runpod.net`. In **Render → cineforge-worker →
Environment**, set:

| Key | Value |
|---|---|
| `WAN_GPU_URL` | `https://<POD_ID>-8000.proxy.runpod.net` |
| `RUNPOD_API_KEY` | *(already set)* |
| `RUNPOD_WAN_POD_ID` | `<POD_ID>` — enables auto start/stop to save money |

Save → the worker redeploys. Now create an Auto film and the shots will render
real video on the pod, upload to S3, and the film assembles.

---

## Costs & auto-shutdown

- Wan 2.1 1.3B on a 4090 renders a few-second clip in well under a minute.
- With `RUNPOD_WAN_POD_ID` set, the worker's GPU lifecycle manager **stops the
  pod when no jobs are queued** and **starts it when they are** (see
  docs/23-gpu-lifecycle-manager.md), so an idle pod doesn't bill you.

---

## Simpler alternative — a hosted video API (no GPU to manage)

If you'd rather not run a GPU at all, the worker also supports a drop-in hosted
text/image-to-video API. Set on the Render worker:

| Key | Value |
|---|---|
| `EXTERNAL_VIDEO_API_URL` | the provider's endpoint |
| `EXTERNAL_VIDEO_API_KEY` | your key |

…and it's used automatically — no RunPod, no Docker, pay-per-clip instead of
per-GPU-hour. Good for getting video working fast; self-hosting on RunPod is
cheaper at volume.
