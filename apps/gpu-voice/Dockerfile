# CineForge self-hosted Voice Engine — one image per engine (docs/74; Part 4 §171).
#
#   docker build -f apps/gpu-voice/Dockerfile --build-arg VOICE_ENGINE=qwen3-tts \
#     --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) .        # context = REPO ROOT
#
# The build context is the repository root because the Media Runtime Gateway,
# one-time media I/O and the code digest are SHARED with apps/gpu-worker
# (copied into /app/app below, not forked). apps/gpu-voice/Dockerfile.dockerignore
# limits the context to what this image needs.
#
# Everything is pinned: the CUDA base, Python packages (requirements*.txt),
# the torch wheels, and the git commits of engines installed from source.
# Model weights are NOT in the image: VOICE_MODEL_REPO + VOICE_MODEL_REVISION
# (a 40-hex Hugging Face commit) select them at run time; mount a RunPod
# network volume at /root/.cache/huggingface so they download once.
# No keys or credentials are ever baked in.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ARG VOICE_ENGINE
RUN test -n "$VOICE_ENGINE" || (echo "build-arg VOICE_ENGINE is required (qwen3-tts | cosyvoice-3 | gpt-sovits)" && exit 1)

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-dev build-essential cmake git ffmpeg sox libsox-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ubuntu 22.04's pip 22.0.2 builds source packages against the system
# setuptools 59, which cannot read a [project] table: pyopenjtalk 0.4.1
# (GPT-SoVITS) then reports its name as "unknown" and the install fails.
# A current, pinned pip builds them in a clean isolated environment.
RUN python3 -m pip install --no-cache-dir pip==25.1.1

# torch per engine, from the CUDA wheel index (exact versions).
#   qwen3-tts, gpt-sovits: torch 2.6.0 (cu124)    cosyvoice-3: torch 2.3.1 (cu121, the upstream pin)
RUN case "$VOICE_ENGINE" in \
      qwen3-tts|gpt-sovits) pip3 install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cu124 ;; \
      cosyvoice-3) pip3 install --no-cache-dir torch==2.3.1 torchaudio==2.3.1 --index-url https://download.pytorch.org/whl/cu121 ;; \
      *) echo "unknown VOICE_ENGINE $VOICE_ENGINE" && exit 1 ;; \
    esac

COPY apps/gpu-voice/requirements.txt apps/gpu-voice/requirements-*.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Engines that are not pip packages: their repository at a pinned commit
# (submodules follow that commit). The commit is recorded for /capabilities.
ARG COSYVOICE_COMMIT=074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc
ARG GPTSOVITS_COMMIT=1b47ca07ef43a284e0b8bd7f29d3e1e3ff76082a
RUN case "$VOICE_ENGINE" in \
      cosyvoice-3) git clone https://github.com/FunAudioLLM/CosyVoice.git /opt/CosyVoice && \
                   git -C /opt/CosyVoice checkout --detach "$COSYVOICE_COMMIT" && \
                   git -C /opt/CosyVoice submodule update --init --recursive && \
                   echo "$COSYVOICE_COMMIT" > /opt/engine-source-commit && rm -rf /opt/CosyVoice/.git ;; \
      gpt-sovits)  git clone https://github.com/RVC-Boss/GPT-SoVITS.git /opt/GPT-SoVITS && \
                   git -C /opt/GPT-SoVITS checkout --detach "$GPTSOVITS_COMMIT" && \
                   echo "$GPTSOVITS_COMMIT" > /opt/engine-source-commit && rm -rf /opt/GPT-SoVITS/.git && \
                   true ;; \
      *) : ;; \
    esac
RUN pip3 install --no-cache-dir -r "requirements-$VOICE_ENGINE.txt" && rm -f requirements*.txt

# Shared with apps/gpu-worker (one implementation of the gateway), then this service.
COPY apps/gpu-worker/app/gateway ./app/gateway
COPY apps/gpu-worker/app/media_io.py apps/gpu-worker/app/code_digest.py ./app/
COPY apps/gpu-voice/app ./app

# Source commit baked in at build time (reported by /capabilities, scope status).
ARG SOURCE_COMMIT=unknown
ENV CINEFORGE_SOURCE_COMMIT=${SOURCE_COMMIT}
ENV VOICE_ENGINE=${VOICE_ENGINE}
ENV COSYVOICE_HOME=/opt/CosyVoice
ENV GPTSOVITS_HOME=/opt/GPT-SoVITS
ENV HF_HOME=/root/.cache/huggingface
ENV HF_HUB_DISABLE_XET=1
ENV PYTHONUNBUFFERED=1
LABEL org.cineforge.voice-engine=${VOICE_ENGINE}
# CINEFORGE_PLACEHOLDER=1 forces the no-GPU placeholder path (verification only; never in production).
EXPOSE 8000
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8000"]
