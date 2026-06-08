"""
GPU worker — runs on RunPod A40 48GB.

Hosts an open-source video model (Wan 2.1 or Hunyuan Video), runs inference,
uploads the generated clip to S3, and returns the S3 key + measured GPU time.
This is what lets the platform avoid per-generation vendor fees: you pay only
for GPU-seconds.

Deploy one image per model (MODEL_NAME env) so VRAM usage is predictable.
"""

from __future__ import annotations

import os
import time
import uuid

from fastapi import FastAPI
from pydantic import BaseModel

from .pipeline import VideoPipeline, upload_clip

MODEL_NAME = os.environ.get("MODEL_NAME", "wan-2.1")  # "wan-2.1" | "hunyuan"

app = FastAPI(title=f"cineforge-gpu-worker:{MODEL_NAME}")
pipeline = VideoPipeline(MODEL_NAME)


class GenerateInput(BaseModel):
    prompt: str
    negativePrompt: str | None = None
    seed: int | None = None
    durationSec: float = 5.0
    width: int = 832
    height: int = 480
    fps: int = 16
    referenceImageKeys: list[str] | None = None
    camera: dict | None = None
    extra: dict | None = None


class GenerateOutput(BaseModel):
    videoKey: str
    thumbnailKey: str | None = None
    seed: int
    gpuMs: int
    width: int
    height: int
    durationSec: float


@app.on_event("startup")
def _startup() -> None:
    # Load weights once; keep the model warm in memory.
    pipeline.load()


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "modelLoaded": pipeline.is_loaded,
        "vramFreeMb": pipeline.vram_free_mb(),
    }


@app.get("/capabilities")
def capabilities() -> dict:
    return pipeline.capabilities()


@app.post("/warm")
def warm() -> dict:
    pipeline.load()
    return {"modelLoaded": pipeline.is_loaded}


@app.post("/generate", response_model=GenerateOutput)
def generate(inp: GenerateInput) -> GenerateOutput:
    seed = inp.seed if inp.seed is not None else uuid.uuid4().int % (2**31)
    started = time.monotonic()

    local_mp4, thumb = pipeline.generate(
        prompt=inp.prompt,
        negative_prompt=inp.negativePrompt,
        seed=seed,
        duration_sec=inp.durationSec,
        width=inp.width,
        height=inp.height,
        fps=inp.fps,
        reference_image_keys=inp.referenceImageKeys or [],
        camera=inp.camera or {},
        extra=inp.extra or {},
    )

    gpu_ms = int((time.monotonic() - started) * 1000)

    key = f"_generated/{MODEL_NAME}/{uuid.uuid4().hex}.mp4"
    thumb_key = upload_clip(local_mp4, key, thumb)

    return GenerateOutput(
        videoKey=key,
        thumbnailKey=thumb_key,
        seed=seed,
        gpuMs=gpu_ms,
        width=inp.width,
        height=inp.height,
        durationSec=inp.durationSec,
    )
