# GPU worker image for RunPod. One image per model via MODEL_NAME:
#   MODEL_NAME=wan-2.1 (primary)  |  MODEL_NAME=hunyuan (premium)
# Weights download from Hugging Face on first run — bake them in or mount a
# RunPod network volume at /root/.cache/huggingface to avoid slow cold starts.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# torch + CUDA 12.4 wheels first (kept off requirements.txt so the version/index
# are explicit), then the rest of the inference stack. Torch 2.6 (not 2.4) is
# required: 2.4's torch.library.infer_schema can't parse the stringized type
# hints on the flash-attention op that recent transformers/diffusers register at
# import time ("Parameter q has unsupported type torch.Tensor"); fixed in 2.5+.
RUN pip3 install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app ./app

# Source commit baked in at build time (reported by /capabilities, scope status).
ARG SOURCE_COMMIT=unknown
ENV CINEFORGE_SOURCE_COMMIT=${SOURCE_COMMIT}

# Model selection + Hugging Face cache (mount a volume here to persist weights).
ENV MODEL_NAME=wan-2.1
ENV HF_HOME=/root/.cache/huggingface
# Use the classic HF download path: the newer Xet backend crashes mid-download
# ("Internal Writer Error: Background writer channel closed") on first pull.
ENV HF_HUB_DISABLE_XET=1
# Unbuffered stdout/stderr so inference progress (tqdm) shows live in the logs.
ENV PYTHONUNBUFFERED=1
# Set CINEFORGE_PLACEHOLDER=1 to force the no-GPU placeholder path (debugging).
EXPOSE 8000
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8000"]
