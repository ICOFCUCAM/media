# CineForge image runtime: ComfyUI behind CineForge's own API (docs/73).
#
# BUILD CONTEXT = REPOSITORY ROOT (not this folder): the Media Runtime Gateway,
# the one-time media I/O and the code digest are apps/gpu-worker's own files,
# copied in below, so both GPU services run the same security code.
#
#   docker build -f apps/gpu-image/Dockerfile --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) .
#
# Everything is pinned: base image tag, Python packages (constraints.txt), the
# ComfyUI commit and any custom node commit. Model weights are NOT baked in:
# they download at startup from Hugging Face at the 40-hex revisions given in
# the env (QWEN_IMAGE_COMFY_REVISION, QWEN_IMAGE_EDIT_COMFY_REVISION). Mount a
# volume at /root/.cache/huggingface to keep them across restarts.
FROM nvidia/cuda:12.8.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python stack, pinned (torch from the CUDA 12.8 wheel index).
COPY apps/gpu-image/constraints.txt apps/gpu-image/requirements.txt ./
RUN pip3 install --no-cache-dir -c constraints.txt torch==2.8.0 torchvision==0.23.0 torchaudio==2.8.0 \
      --index-url https://download.pytorch.org/whl/cu128 && \
    pip3 install --no-cache-dir -c constraints.txt -r requirements.txt

# ComfyUI at one exact commit (GPL-3.0; never distributed outside CineForge,
# docs/38 §AT.15). The commit is also in workflows/manifest.json; the build
# fails if the two disagree or the checkout is not that commit.
ARG COMFYUI_REPO=https://github.com/comfyanonymous/ComfyUI
ARG COMFYUI_COMMIT=8ff6dc384ba5c410266b40e137799e049459d4f2
COPY apps/gpu-image/workflows ./workflows
RUN python3 -c "import json,sys; c=json.load(open('workflows/manifest.json'))['runtime']['commit']; sys.exit(0 if c=='${COMFYUI_COMMIT}' else 'COMFYUI_COMMIT differs from workflows/manifest.json')" && \
    git init -q /opt/ComfyUI && \
    git -C /opt/ComfyUI fetch -q --depth 1 "${COMFYUI_REPO}" "${COMFYUI_COMMIT}" && \
    git -C /opt/ComfyUI checkout -q FETCH_HEAD && \
    test "$(git -C /opt/ComfyUI rev-parse HEAD)" = "${COMFYUI_COMMIT}" && \
    rm -rf /opt/ComfyUI/.git && \
    pip3 install --no-cache-dir -c constraints.txt -r /opt/ComfyUI/requirements.txt

# Custom nodes: pinned by commit in the registry, installed here only (none today).
COPY apps/gpu-image/scripts ./scripts
RUN python3 scripts/install_custom_nodes.py workflows/manifest.json /opt/ComfyUI --constraints constraints.txt && \
    pip3 freeze > /app/pip-freeze.txt

# The service: this app + the shared gateway, media I/O and code digest of the
# video worker (the same files, byte for byte; verified by the image check).
COPY apps/gpu-image/app ./app
COPY apps/gpu-worker/app/gateway ./app/gateway
COPY apps/gpu-worker/app/media_io.py apps/gpu-worker/app/code_digest.py ./app/

# Source commit baked in at build time (reported by /capabilities, scope status).
ARG SOURCE_COMMIT=unknown
ENV CINEFORGE_SOURCE_COMMIT=${SOURCE_COMMIT}
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}

ENV COMFYUI_DIR=/opt/ComfyUI
ENV COMFYUI_WORK_DIR=/tmp/cineforge-comfy
ENV CINEFORGE_WORKFLOWS_DIR=/app/workflows
ENV HF_HOME=/root/.cache/huggingface
# The classic HF download path (the Xet backend crashed mid-download for the video worker).
ENV HF_HUB_DISABLE_XET=1
ENV PYTHONUNBUFFERED=1
# Set CINEFORGE_PLACEHOLDER=1 only for tests/verification: no model runs and every result says so.
EXPOSE 8000
# Single process: the jti replay cache is in memory (app/gateway/replay.py).
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8000"]
