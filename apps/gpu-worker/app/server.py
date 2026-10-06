"""
GPU worker — runs on RunPod A40 48GB.

Hosts an open-source video model (Wan 2.1 or Hunyuan Video), runs inference,
uploads the generated clip to S3, and returns the S3 key + measured GPU time.
This is what lets the platform avoid per-generation vendor fees: you pay only
for GPU-seconds.

Deploy one image per model (MODEL_NAME env) so VRAM usage is predictable.

Every route except `GET /livez` sits behind the Media Runtime Gateway
(app/gateway; docs/38 §O, §AV.2; docs/39): a short-lived Ed25519 execution
token bound to this deployment, the action, the job, the exact request body and
the authorized workflow + models. GATEWAY_MODE=report logs violations without
blocking (rollout step R2); GATEWAY_MODE=enforce rejects them.
"""

from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from importlib import metadata
from typing import Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel

from .gateway import (
    AUTHZ_VERSION,
    Enforcer,
    GatewayConfig,
    GatewayConfigError,
    ModelSpec,
    RequestBinding,
    authz_digest,
    resolve_weights_digest,
)
from .gateway.authz import TimingRequest
from .gateway.manifest import PLACEHOLDER
from .pipeline import VideoPipeline, upload_clip

MODEL_NAME = os.environ.get("MODEL_NAME", "wan-2.1")  # "wan-2.1" | "hunyuan"

log = logging.getLogger("cineforge.gateway")


class GenerateInput(BaseModel):
    # Grant id minted by Cineforge; must equal the token's `sub`.
    jobId: str | None = None
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


class RuntimeIdentity:
    """What this worker would actually run: workflow, runtime and resolved models."""

    def __init__(self, pipeline, resolve: Callable[[ModelSpec], str | None]) -> None:
        self.pipeline = pipeline
        self._resolve = resolve
        self._weights: dict[str, str | None] = {}

    def runtime(self) -> str:
        if not self.pipeline.is_real:
            return PLACEHOLDER
        try:
            return f"diffusers@{metadata.version('diffusers')}"
        except metadata.PackageNotFoundError:
            return "diffusers@unknown"

    def specs(self) -> dict[str, ModelSpec]:
        return {role: ModelSpec(role, repo, rev) for role, (repo, rev) in self.pipeline.model_specs().items()}

    def resolve_all(self) -> None:
        """Resolve every model's weights digest once, at startup (never per request,
        so an unauthenticated caller cannot trigger cache scans or Hub lookups)."""
        for spec in self.specs().values():
            self._weights[spec.role] = self._resolve(spec) if spec.pinned else None

    def weights(self, spec: ModelSpec) -> str | None:
        if not self.pipeline.is_real:
            return PLACEHOLDER
        return self._weights.get(spec.role)

    def workflow_for(self, inp: GenerateInput) -> tuple[str, str]:
        """(workflow id, model role). Mirrors VideoPipeline.generate's choice."""
        if inp.referenceImageKeys and self.pipeline.has_i2v():
            return f"diffusers.{self.pipeline.model_name}.i2v@1", "i2v"
        return f"diffusers.{self.pipeline.model_name}.t2v@1", "t2v"

    def expected_authz(self, inp: GenerateInput) -> tuple[str | None, str | None]:
        """(digest, error code). Error when the model cannot be identified."""
        workflow, role = self.workflow_for(inp)
        spec = self.specs()[role]
        weights = self.weights(spec)
        if self.pipeline.is_real and (not spec.pinned or not weights):
            return None, "MODEL_UNRESOLVED"
        digest = authz_digest(
            workflow=workflow,
            runtime=self.runtime(),
            models=[{"role": role, "id": spec.repo_id, "revision": spec.revision or "", "weights": weights or ""}],
            loras=inp.loraKeys or [],
            timing=TimingRequest(
                duration_us=round(inp.durationSec * 1_000_000), fps=inp.fps, width=inp.width, height=inp.height
            ),
        )
        return digest, None

    def manifest(self) -> dict:
        return {
            "authzVersion": AUTHZ_VERSION,
            "runtime": self.runtime(),
            "models": [
                {"role": s.role, "id": s.repo_id, "revision": s.revision, "pinned": s.pinned, "weights": self.weights(s)}
                for s in self.specs().values()
            ],
        }


def create_app(
    *,
    config: GatewayConfig | None = None,
    pipeline=None,
    uploader=upload_clip,
    resolve_weights: Callable[[ModelSpec], str | None] = resolve_weights_digest,
) -> FastAPI:
    config = config or GatewayConfig.from_env()
    pipeline = pipeline or VideoPipeline(MODEL_NAME)
    enforcer = Enforcer(config)
    identity = RuntimeIdentity(pipeline, resolve_weights)

    app = FastAPI(title=f"cineforge-gpu-worker:{pipeline.model_name}")
    app.state.enforcer = enforcer
    app.state.identity = identity

    # One GPU, one model — serialize inference. The worker dispatches a scene's shots
    # concurrently, but running several diffusers inferences on the same pipeline at
    # once blows up VRAM and crashes the process; this lock runs them one at a time.
    infer_lock = threading.Lock()

    async def guard(request: Request, binding: RequestBinding) -> None:
        body = await request.body()
        decision = enforcer.check(
            authorization=request.headers.get("authorization"),
            body=body,
            binding=binding,
            path=request.url.path,
        )
        if not decision.allowed:
            raise HTTPException(status_code=decision.status, detail={"error": decision.code})

    @app.on_event("startup")
    def _startup() -> None:
        # Fail closed: enforce mode never starts half-configured.
        problems = config.problems()
        unpinned = [f"{s.role}:{s.repo_id}" for s in identity.specs().values() if not s.pinned]
        if config.enforcing and problems:
            raise GatewayConfigError("; ".join(problems))
        for p in problems:
            log.warning('{"event":"gateway.config","problem":%r}', p)
        # Load weights once; keep the model warm in memory.
        pipeline.load()
        if pipeline.is_real:
            identity.resolve_all()
        if pipeline.is_real and unpinned:
            if config.enforcing:
                raise GatewayConfigError(f"unpinned model revision(s): {', '.join(unpinned)}")
            log.warning('{"event":"gateway.config","problem":"unpinned models %s"}', unpinned)
        if pipeline.is_real and config.enforcing and not identity.weights(identity.specs()["t2v"]):
            raise GatewayConfigError("primary model weights digest could not be resolved")

    @app.get("/livez", response_class=PlainTextResponse)
    def livez() -> str:
        # Public liveness probe: discloses nothing about model, version or state.
        return "ok"

    @app.get("/health")
    async def health(request: Request) -> dict:
        await guard(request, RequestBinding(scope="status"))
        return {
            "status": "ok",
            "model": pipeline.model_name,
            "modelLoaded": pipeline.is_loaded,
            "vramFreeMb": pipeline.vram_free_mb(),
        }

    @app.get("/capabilities")
    async def capabilities(request: Request) -> dict:
        await guard(request, RequestBinding(scope="status"))
        return {
            **pipeline.capabilities(),
            "deploymentId": config.deployment_id or None,
            "gatewayMode": config.mode,
            "manifest": identity.manifest(),
        }

    @app.post("/warm")
    async def warm(request: Request) -> dict:
        await guard(request, RequestBinding(scope="warm"))
        await run_in_threadpool(pipeline.load)
        return {"modelLoaded": pipeline.is_loaded}

    @app.post("/generate", response_model=GenerateOutput)
    async def generate(request: Request, inp: GenerateInput) -> GenerateOutput:
        authz, authz_error = identity.expected_authz(inp)
        fields = inp.model_fields_set
        await guard(
            request,
            RequestBinding(
                scope="video:run",
                job_id=inp.jobId or "",
                authz=authz,
                authz_error=authz_error,
                # Timing is part of the production request, never a silent default.
                checks=[("TIMING_MISSING", {"durationSec", "fps", "width", "height"} <= fields)],
            ),
        )
        return await run_in_threadpool(_generate, inp)

    def _generate(inp: GenerateInput) -> GenerateOutput:
        seed = inp.seed if inp.seed is not None else uuid.uuid4().int % (2**31)
        started = time.monotonic()

        # Serialize: only one inference runs on the GPU at a time (see infer_lock).
        with infer_lock:
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

        key = f"_generated/{pipeline.model_name}/{uuid.uuid4().hex}.mp4"
        thumb_key = uploader(local_mp4, key, thumb)

        return GenerateOutput(
            videoKey=key,
            thumbnailKey=thumb_key,
            seed=seed,
            gpuMs=gpu_ms,
            width=inp.width,
            height=inp.height,
            durationSec=inp.durationSec,
        )

    # ── Per-character LoRA training (docs/28): disabled ───────────────────
    # The trainer was a stub that returned placeholder artifacts. Until a real
    # trainer exists these routes do no work in any mode (docs/39 decision 3).
    # Cineforge's LoRA queue treats the failure as "no LoRA" and identity falls
    # back to seed + reference frames.

    @app.post("/train")
    def train() -> JSONResponse:
        return JSONResponse(status_code=503, content={"error": "TRAINER_DISABLED"})

    @app.get("/tasks/{task_id}")
    def task_status(task_id: str) -> JSONResponse:
        return JSONResponse(status_code=503, content={"error": "TRAINER_DISABLED"})

    return app


app = create_app()
