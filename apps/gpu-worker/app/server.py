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
from .trainer import LoraTrainer

MODEL_NAME = os.environ.get("MODEL_NAME", "wan-2.1")  # "wan-2.1" | "hunyuan"

app = FastAPI(title=f"cineforge-gpu-worker:{MODEL_NAME}")
pipeline = VideoPipeline(MODEL_NAME)
trainer = LoraTrainer()


class GenerateInput(BaseModel):
    prompt: str
    negativePrompt: str | None = None
    seed: int | None = None
    durationSec: float = 5.0
    width: int = 832
    height: int = 480
    fps: int = 16
    referenceImageKeys: list[str] | None = None
    # Video-to-video (motion style) and identity-lock inputs (docs/22, docs/28).
    referenceVideoKeys: list[str] | None = None
    videoOp: str | None = None
    motionStrength: float | None = None
    loraKeys: list[str] | None = None
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
        reference_video_keys=inp.referenceVideoKeys or [],
        video_op=inp.videoOp,
        motion_strength=inp.motionStrength,
        lora_keys=inp.loraKeys or [],
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


# ── Per-character LoRA training (docs/28) ──────────────────────────────
# Matches the worker's LoraTrainerClient: POST /train (submit) → either a
# terminal result or { id } to poll via GET /tasks/{id}. The scaffold trains
# synchronously and returns the result directly.


class TrainInput(BaseModel):
    name: str
    caption: str = ""
    image_urls: list[str]
    steps: int = 1200


class TrainOutput(BaseModel):
    status: str = "succeeded"
    lora_key: str
    version: str


@app.post("/train", response_model=TrainOutput)
def train(inp: TrainInput) -> TrainOutput:
    lora_key, version = trainer.train(
        name=inp.name,
        caption=inp.caption,
        image_urls=inp.image_urls,
        steps=inp.steps,
    )
    return TrainOutput(lora_key=lora_key, version=version)


@app.get("/tasks/{task_id}")
def task_status(task_id: str) -> dict:
    # The scaffold trains synchronously, so jobs are already terminal. A real
    # async trainer would look the job up in a store and report progress.
    return trainer.status(task_id)
