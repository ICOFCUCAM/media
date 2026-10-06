# CI-only stand-in for the GPU image (no CUDA/torch): same layout (/app/app),
# same entrypoint and the same CINEFORGE_SOURCE_COMMIT build arg, so the image
# verifier can be exercised end-to-end against a local registry. Never pushed
# to Docker Hub.
FROM python:3.11-slim
RUN pip install --no-cache-dir fastapi==0.111.0 "uvicorn[standard]==0.30.0" pydantic==2.7.0 "PyJWT[crypto]==2.9.0"
WORKDIR /app
COPY app ./app
ARG SOURCE_COMMIT=unknown
ENV CINEFORGE_SOURCE_COMMIT=${SOURCE_COMMIT}
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
EXPOSE 8000
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8000"]
