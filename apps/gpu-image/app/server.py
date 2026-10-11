"""
CineForge image runtime — ComfyUI behind CineForge's own API (docs/73).

Callers name a workflow from the Workflow Registry (id + version) and give the
values of its declared slots: prompt, negative prompt, seed, size, steps,
reference images and a LoRA. The service binds them into the registry's graph
and runs it on a local ComfyUI. It never accepts a graph, a node or a model
name from a caller, and ComfyUI's own API is not reachable from outside.

Every route except `GET /livez` sits behind the Media Runtime Gateway, the
same code as apps/gpu-worker (app/gateway; docs/39): a short-lived Ed25519
execution token bound to this deployment, the action (`image:run` or
`status`), the job, the exact request body and the authorization digest of
the workflow (id, version and graph hash), the runtime and the exact model
files. GATEWAY_MODE=report logs violations; GATEWAY_MODE=enforce rejects them.

Media I/O only through the job's one-time URLs, in every mode: reference
images and LoRAs are read from presigned GET URLs, the still is written to the
presigned PUT URL Cineforge chose. This service has no storage credentials and
refuses to start in enforce mode when any are present.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, ValidationError

from .code_digest import code_digest
from .gateway import AUTHZ_VERSION, Enforcer, GatewayConfig, GatewayConfigError, RequestBinding, authz_digest
from .gateway.authz import TimingRequest
from .gateway.enforcer import STATUS
from .media_io import LoraIntegrityError, fetch_to_temp, put_file, sha256_file, storage_credentials_present, suffix_of
from .png import png_size
from .registry import BindRequest, Registry, SlotError, Workflow, bind, check_request, load_registry
from .runtime import PLACEHOLDER, ImageRuntime, PlaceholderRuntime, RuntimeUnavailable, build_runtime

log = logging.getLogger("cineforge.gateway")
CODE_SHA256 = code_digest(Path(__file__).resolve().parent)
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
SCOPE_RUN = "image:run"
# Codes this service adds to the gateway's (the shared table stays untouched).
LOCAL_STATUS = {"WORKFLOW_UNKNOWN": 404, "OUTPUT_TARGET_MISSING": 422, "INPUT_URL_MISSING": 422, "LORA_UNHASHED": 422}


def http_status(code: str) -> int:
    return STATUS.get(code) or LOCAL_STATUS.get(code) or 403


class WorkflowRef(BaseModel):
    id: str
    version: int


class ImageOutputTarget(BaseModel):
    imageKey: str
    imageUploadUrl: str


class ImageRequest(BaseModel):
    jobId: str | None = None
    workflow: WorkflowRef
    prompt: str
    negativePrompt: str | None = None
    seed: int | None = None
    width: int
    height: int
    steps: int | None = None
    referenceImageKeys: list[str] | None = None
    loraKeys: list[str] | None = None
    loraSha256: dict[str, str] | None = None
    loraScale: float | None = None
    inputUrls: dict[str, str] | None = None
    output: ImageOutputTarget | None = None

    model_config = {"extra": "forbid"}  # no graph, node or model field can ride along

    def input_keys(self) -> list[str]:
        return list(dict.fromkeys([*(self.referenceImageKeys or []), *(self.loraKeys or [])]))


class ImageResult(BaseModel):
    imageKey: str
    imageBytes: int
    sha256: str
    contentType: str = "image/png"
    seed: int
    width: int
    height: int
    gpuMs: int
    workflow: dict
    graphSha256: str
    runtime: str
    models: list[dict]
    execution: dict
    realExecution: bool


class Identity:
    """What this worker would run for a request, and its authorization digest."""

    def __init__(self, registry: Registry, runtime: ImageRuntime) -> None:
        self.registry, self.runtime = registry, runtime

    def models_for(self, wf: Workflow) -> list[dict]:
        out = []
        for key in wf.model_keys:
            pm = self.runtime.pins[key]
            out.append({"role": key, "id": pm.decl.model_id, "revision": pm.revision or "", "weights": self.runtime.weights(key) or ""})
        return out

    def expected_authz(self, req: ImageRequest) -> tuple[str | None, str | None, Workflow | None]:
        wf = self.registry.get(req.workflow.id, req.workflow.version)
        if wf is None:
            return None, "WORKFLOW_UNKNOWN", None
        models = self.models_for(wf)
        if self.runtime.is_real and any(not m["revision"] or not m["weights"] for m in models):
            return None, "MODEL_UNRESOLVED", wf
        digest = authz_digest(
            workflow=f"{wf.ref}#{wf.sha256}",
            runtime=self.runtime.runtime_id(),
            models=models,
            loras=[{"key": k, "sha256": (req.loraSha256 or {}).get(k, "")} for k in (req.loraKeys or [])],
            # A still has no duration or frame rate; its size is bound.
            timing=TimingRequest(duration_us=0, fps=0, width=req.width, height=req.height),
        )
        return digest, None, wf

    def manifest(self) -> dict:
        return {
            "authzVersion": AUTHZ_VERSION,
            "runtime": self.runtime.runtime_id(),
            "models": [
                {"role": k, "id": pm.decl.model_id, "revision": pm.revision, "pinned": pm.pinned, "weights": self.runtime.weights(k)}
                for k, pm in sorted(self.runtime.pins.items())
            ],
            "workflows": [{"id": w["id"], "version": w["version"], "sha256": w["sha256"], "models": w["models"]}
                          for w in self.registry.summary()],
            "registrySha256": self.registry.sha256,
        }


class ImageJobs:
    """Background /images runs (in memory; lost on restart), as /generate/jobs in the video worker."""

    TTL_SEC = 3600

    def __init__(self, run: Callable[..., ImageResult]):
        self._run = run
        self._lock = threading.Lock()
        self._jobs: dict[str, dict] = {}

    def submit(self, req: ImageRequest, wf: Workflow) -> str:
        task_id = uuid.uuid4().hex
        with self._lock:
            self._prune()
            self._jobs[task_id] = {"status": "queued", "started": time.time()}
        threading.Thread(target=self._work, args=(task_id, req, wf), name=f"image-{task_id[:8]}", daemon=True).start()
        return task_id

    def get(self, task_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(task_id)
            return None if job is None else {k: v for k, v in job.items() if k not in ("started", "finished")}

    def _work(self, task_id: str, req: ImageRequest, wf: Workflow) -> None:
        try:
            out = self._run(req, wf, on_start=lambda: self._mark(task_id, "running"))
            done = {"status": "done", "result": out.model_dump(mode="json")}
        except HTTPException as e:
            done = {"status": "error", "httpStatus": e.status_code, "detail": e.detail}
        except Exception as e:  # noqa: BLE001 — reported to the caller, never swallowed
            log.exception('{"event":"image.async_failed","sub":%r}', req.jobId)
            done = {"status": "error", "httpStatus": 500, "detail": {"error": "GENERATION_FAILED", "type": type(e).__name__}}
        with self._lock:
            if task_id in self._jobs:
                self._jobs[task_id] = {**done, "started": self._jobs[task_id]["started"], "finished": time.time()}

    def _mark(self, task_id: str, status: str) -> None:
        with self._lock:
            if task_id in self._jobs and self._jobs[task_id]["status"] in ("queued", "running"):
                self._jobs[task_id]["status"] = status

    def _prune(self) -> None:
        cutoff = time.time() - self.TTL_SEC
        for k in [k for k, j in self._jobs.items() if j.get("finished", time.time()) < cutoff]:
            del self._jobs[k]


def create_app(
    *,
    config: GatewayConfig | None = None,
    registry: Registry | None = None,
    runtime: ImageRuntime | None = None,
    fetch: Callable[[str, str], str] = fetch_to_temp,
    put: Callable[[str, str, str], int] = put_file,
    load_in_background: bool = True,
) -> FastAPI:
    config = config or GatewayConfig.from_env()
    registry = registry or load_registry()
    runtime = runtime or build_runtime(registry)
    enforcer = Enforcer(config)
    identity = Identity(registry, runtime)

    app = FastAPI(title="cineforge-gpu-image")
    app.state.enforcer, app.state.identity, app.state.registry, app.state.runtime = enforcer, identity, registry, runtime
    gpu_lock = threading.Lock()

    async def guard(request: Request, binding: RequestBinding) -> None:
        decision = enforcer.check(authorization=request.headers.get("authorization"), body=await request.body(),
                                  binding=binding, path=request.url.path)
        if not decision.allowed:
            raise HTTPException(status_code=http_status(decision.code or ""), detail={"error": decision.code})

    @app.on_event("startup")
    def _startup() -> None:
        problems = config.problems()
        if config.enforcing and problems:
            raise GatewayConfigError("; ".join(problems))
        creds = storage_credentials_present()
        if config.enforcing and creds:
            raise GatewayConfigError(f"storage credentials present in enforce mode: {', '.join(creds)}")
        if config.enforcing and not isinstance(runtime, PlaceholderRuntime) and runtime.unpinned():
            # Fail closed: an enforcing worker never runs a model it cannot identify.
            raise GatewayConfigError(f"unpinned model revision(s): {', '.join(runtime.unpinned())}")
        for p in problems:
            log.warning('{"event":"gateway.config","problem":%r}', p)
        if load_in_background:
            # Downloads can take many minutes: /livez answers meanwhile, /images says MODEL_LOADING.
            runtime._loading = True

            def _load() -> None:
                try:
                    runtime.load()
                except Exception as e:  # noqa: BLE001 — reported as unavailable, never a placeholder
                    log.exception('{"event":"image.runtime_load_failed"}')
                    runtime._unavailable = runtime._unavailable or f"LOAD_FAILED_{type(e).__name__}"
                    runtime._loaded = True
                finally:
                    runtime._loading = False

            threading.Thread(target=_load, name="image-runtime-load", daemon=True).start()
        else:
            runtime.load()

    @app.get("/livez", response_class=PlainTextResponse)
    def livez() -> str:
        return "ok"

    @app.get("/health")
    async def health(request: Request) -> dict:
        await guard(request, RequestBinding(scope="status"))
        return {"status": "ok", "model": runtime.model_name, "modelLoaded": runtime.is_loaded and not runtime.unavailable_reason,
                "execution": runtime.execution_mode, "unavailableReason": runtime.unavailable_reason,
                "vramFreeMb": runtime.vram_free_mb()}

    @app.get("/capabilities")
    async def capabilities(request: Request) -> dict:
        await guard(request, RequestBinding(scope="status"))
        rt = registry.runtime
        return {
            "model": runtime.model_name,
            "execution": runtime.execution_mode,
            "realExecution": runtime.is_real,
            "unavailableReason": runtime.unavailable_reason,
            "supportsRefImage": True,
            "supportsLora": True,
            "maxResolution": [2048, 2048],
            "runtime": {"name": "comfyui", "tag": rt.get("tag"), "commit": rt["commit"], "licence": rt.get("licence")},
            "customNodes": registry.custom_nodes,
            "workflows": registry.summary(),
            "registrySha256": registry.sha256,
            "licences": {k: {"model": m.model, "licence": m.licence, "source": m.licence_source} for k, m in sorted(registry.models.items())},
            "deploymentId": config.deployment_id or None,
            "gatewayMode": config.mode,
            "asyncImages": True,
            "manifest": identity.manifest(),
            "image": {"sourceCommit": os.environ.get("CINEFORGE_SOURCE_COMMIT") or None, "codeSha256": CODE_SHA256},
            "dependencies": {"freezeSha256": _freeze_sha256()},
        }

    @app.post("/images")
    async def images(request: Request):
        raw = await request.body()
        try:
            req = ImageRequest.model_validate_json(raw)
        except ValidationError:
            # Authenticate before describing anything about the schema.
            await guard(request, RequestBinding(scope=SCOPE_RUN))
            raise HTTPException(status_code=422, detail={"error": "INVALID_REQUEST"}) from None
        authz, authz_error, wf = identity.expected_authz(req)
        await guard(request, RequestBinding(
            scope=SCOPE_RUN,
            job_id=req.jobId or "",
            authz=authz,
            authz_error=authz_error,
            checks=[
                # No legacy storage path: outputs and inputs always go through one-time URLs.
                ("OUTPUT_TARGET_MISSING", req.output is not None),
                ("INPUT_URL_MISSING", set(req.input_keys()) <= set((req.inputUrls or {}).keys())),
                ("LORA_UNHASHED", not config.enforcing or all(_SHA256.match((req.loraSha256 or {}).get(k, "")) for k in (req.loraKeys or []))),
            ],
        ))
        # Report mode logs a would-reject; these still cannot run in any mode.
        if wf is None:
            raise HTTPException(status_code=404, detail={"error": "WORKFLOW_UNKNOWN"})
        if req.output is None:
            raise HTTPException(status_code=422, detail={"error": "OUTPUT_TARGET_MISSING"})
        if not set(req.input_keys()) <= set((req.inputUrls or {}).keys()):
            raise HTTPException(status_code=422, detail={"error": "INPUT_URL_MISSING"})
        problems = check_request(wf, _bind_request(req, seed=req.seed or 0, refs=req.referenceImageKeys or [], loras=req.loraKeys or []))
        if problems:
            raise HTTPException(status_code=422, detail={"error": "INVALID_PARAMETERS", "problems": problems})
        if runtime.execution_mode in ("loading", "unloaded"):
            raise HTTPException(status_code=503, detail={"error": "MODEL_LOADING"})
        if runtime.unavailable_reason:
            raise HTTPException(status_code=503, detail={"error": runtime.unavailable_reason})
        if request.headers.get("x-cineforge-async") == "1":
            return JSONResponse(status_code=202, content={"taskId": jobs.submit(req, wf)})
        return await run_in_threadpool(_run_checked, req, wf)

    @app.get("/images/jobs/{task_id}")
    async def image_job(task_id: str, request: Request) -> JSONResponse:
        await guard(request, RequestBinding(scope="status"))
        state = jobs.get(task_id)
        if state is None:
            raise HTTPException(status_code=404, detail={"error": "UNKNOWN_TASK"})
        return JSONResponse(status_code=200, content=state)

    def _run_checked(req: ImageRequest, wf: Workflow, on_start: Callable[[], None] | None = None) -> ImageResult:
        try:
            return _run(req, wf, on_start)
        except RuntimeUnavailable as e:
            raise HTTPException(status_code=503, detail={"error": e.code}) from None
        except LoraIntegrityError as e:
            log.warning('{"event":"gateway.lora_integrity","decision":"reject","code":%r,"sub":%r}', e.code, req.jobId)
            raise HTTPException(status_code=409, detail={"error": e.code}) from None
        except SlotError as e:
            raise HTTPException(status_code=422, detail={"error": "INVALID_PARAMETERS", "problems": e.problems}) from None
        except Exception as e:  # noqa: BLE001
            code = getattr(e, "code", None) or "GENERATION_FAILED"
            log.warning('{"event":"image.failed","code":%r,"sub":%r}', code, req.jobId)
            raise HTTPException(status_code=500, detail={"error": code}) from None

    jobs = ImageJobs(_run_checked)
    app.state.image_jobs = jobs

    def _run(req: ImageRequest, wf: Workflow, on_start: Callable[[], None] | None) -> ImageResult:
        seed = req.seed if req.seed is not None else uuid.uuid4().int % (2**31)
        job_id = uuid.uuid4().hex
        temps: list[str] = []
        try:
            # Inputs: one-time GET URLs only; LoRA bytes must match the authorized hash.
            refs = [_fetch(req, k, temps) for k in (req.referenceImageKeys or [])]
            loras = []
            for k in req.loraKeys or []:
                p = _fetch(req, k, temps)
                expected = (req.loraSha256 or {}).get(k)
                if not expected and config.enforcing:
                    raise LoraIntegrityError("LORA_UNHASHED", k)
                if expected and sha256_file(p) != expected:
                    raise LoraIntegrityError("LORA_HASH_MISMATCH", k)
                loras.append(p)
            with gpu_lock:
                started = time.monotonic()
                if on_start:
                    on_start()
                try:
                    ref_names, lora_names = runtime.stage(job_id, refs, loras)
                    graph, graph_sha = bind(registry, wf, _bind_request(req, seed=seed, refs=ref_names, loras=lora_names, job_id=job_id))
                    data = runtime.execute(graph, job_id, seed=seed, width=req.width, height=req.height, prompt=req.prompt,
                                           timeout_sec=float(wf.limits.get("timeoutSec", 900)))
                finally:
                    runtime.cleanup(job_id)
            gpu_ms = int((time.monotonic() - started) * 1000)
            size = png_size(data)
            if not size:
                raise RuntimeUnavailable("OUTPUT_NOT_PNG")
            local = os.path.join(_tmpdir(), f"{job_id}.png")
            with open(local, "wb") as f:
                f.write(data)
            temps.append(local)
            sha = hashlib.sha256(data).hexdigest()
            nbytes = put(req.output.imageUploadUrl, local, "image/png")
            real = runtime.is_real
            return ImageResult(
                imageKey=req.output.imageKey, imageBytes=nbytes, sha256=sha, seed=seed, width=size[0], height=size[1],
                gpuMs=gpu_ms, workflow={"id": wf.id, "version": wf.version, "sha256": wf.sha256, "modelLabel": wf.model_label},
                graphSha256=graph_sha, runtime=runtime.runtime_id(), models=identity.models_for(wf),
                execution={"mode": "real" if real else PLACEHOLDER, "referencesUsed": len(refs) if real else 0,
                           "referencesGiven": len(refs), "lorasApplied": len(loras) if real else 0,
                           **({} if real else {"reason": "PLACEHOLDER"})},
                realExecution=real,
            )
        finally:
            for t in temps:
                try:
                    os.unlink(t)
                except OSError:
                    pass

    def _fetch(req: ImageRequest, key: str, temps: list[str]) -> str:
        p = fetch((req.inputUrls or {})[key], suffix_of(key))
        temps.append(p)
        return p

    return app


def _bind_request(req: ImageRequest, *, seed: int, refs: list[str], loras: list[str], job_id: str = "x") -> BindRequest:
    return BindRequest(prompt=req.prompt, negative=req.negativePrompt, seed=seed, width=req.width, height=req.height,
                       steps=req.steps, image_names=[_name(r) for r in refs], lora_names=[_name(lo) for lo in loras],
                       lora_scale=req.loraScale, output_prefix=f"cf_{job_id}_out")


def _name(s: str) -> str:
    """Pre-run checks see storage keys; the binder sees runtime file names. Both must be safe names."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", s.rsplit("/", 1)[-1])[:128] or "x"


def _freeze_sha256(path: str = "/app/pip-freeze.txt") -> str | None:
    """sha256 of the Python package set resolved at build time (status only)."""
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


def _tmpdir() -> str:
    import tempfile  # noqa: PLC0415

    return tempfile.gettempdir()


app = create_app()
