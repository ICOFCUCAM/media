# CI-only stand-in for the ComfyUI image runtime (no CUDA, torch or ComfyUI):
# the same /app/app composition (this app + the video worker's shared gateway,
# media_io.py and code_digest.py), the same /app/workflows, entrypoint and
# CINEFORGE_SOURCE_COMMIT build arg, so the image verifier's gpu-image profile
# can be exercised end-to-end against a local registry. Build context = repo
# root. Never pushed to Docker Hub.
FROM python:3.11-slim
RUN pip install --no-cache-dir fastapi==0.111.0 "uvicorn[standard]==0.30.0" pydantic==2.7.0 "PyJWT[crypto]==2.9.0"
WORKDIR /app
COPY apps/gpu-image/workflows ./workflows
COPY apps/gpu-image/app ./app
COPY apps/gpu-worker/app/gateway ./app/gateway
COPY apps/gpu-worker/app/media_io.py apps/gpu-worker/app/code_digest.py ./app/
ARG SOURCE_COMMIT=unknown
ENV CINEFORGE_SOURCE_COMMIT=${SOURCE_COMMIT}
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
ENV CINEFORGE_WORKFLOWS_DIR=/app/workflows
EXPOSE 8000
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8000"]
