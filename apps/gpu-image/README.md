# GPU image runtime — ComfyUI behind CineForge's API

This service draws CineForge's stills on its own GPU. It runs ComfyUI at a
pinned commit, listening on 127.0.0.1 only. In front of it is CineForge's own
API, behind the same Media Runtime Gateway as `apps/gpu-worker`. The gateway
code is copied in at build time; it is not a fork.

Full documentation, including the step-by-step RunPod deployment:
[docs/73](../../docs/73-comfyui-image-runtime.md).

## Endpoints

| Route | Scope | What it does |
|---|---|---|
| `GET /livez` | public | liveness check |
| `GET /health`, `GET /capabilities` | `status` | runtime state; `/capabilities` also returns the workflows and their hashes, the manifest and the image identity |
| `POST /images` | `image:run` | draws one still. Send `x-cineforge-async: 1` to get a `202` with a `taskId` back |
| `GET /images/jobs/{id}` | `status` | the state of an async still |

## Workflows

- Callers name a registry workflow (`workflows/manifest.json`) by id and
  version, and set its declared slots.
- No graph is ever accepted from a caller.
- Current workflows:
  - `cineforge.still.t2i@1` (Qwen-Image);
  - `cineforge.still.ref@1` (Qwen-Image-Edit-2511, 1–3 reference images).

## Local tests

No GPU is needed:

```
pip install fastapi==0.111.0 "uvicorn[standard]==0.30.0" pydantic==2.7.0 "PyJWT[crypto]==2.9.0" -r requirements-dev.txt
python -m pytest -q
```

In a repository checkout, `app.gateway`, `app.media_io` and `app.code_digest`
come from `../gpu-worker/app` (see `app/__init__.py`).

## Build

Build from the repository root:

```
docker build -f apps/gpu-image/Dockerfile --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) .
```

CI does this in `.github/workflows/build-gpu-image.yml`. It tags the image
`sha-<commit>` only, prints the digest, and verifies the image with
`verify_image.py --profile gpu-image`.
