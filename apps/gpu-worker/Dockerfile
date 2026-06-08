# GPU worker image for RunPod (A40 48GB). One image per model via MODEL_NAME.
# Bake model weights into the image or mount a RunPod network volume to avoid
# per-cold-start downloads.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app ./app

# MODEL_NAME=wan-2.1 (primary) or hunyuan (premium)
ENV MODEL_NAME=wan-2.1
EXPOSE 8000
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8000"]
