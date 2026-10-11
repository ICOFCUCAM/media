"""
CineForge Voice Engine — self-hosted GPU service (docs/74; Part 4 §136, §144,
§150–155, §171–172).

One container runs ONE voice model (VOICE_ENGINE = qwen3-tts | cosyvoice-3 |
gpt-sovits), loads its pinned checkpoint once and keeps it warm. Behind one
CineForge API, whatever the model:

  POST /v1/voices/enroll   reference recording → the engine's voice artifact
                           (speaker embedding / prompt audio), written to the
                           owner's voices/<user>/ folder through a one-time URL
  POST /v1/speech          one or many lines in one job → one WAV per line,
                           each written through its own one-time URL
  POST /v1/similarity      speaker-embedding similarity of recordings to a
                           reference (the voice benchmark)
  POST /v1/voices/evict    drop a deleted voice from the warm cache
  GET  /v1/jobs/{taskId}   async result (`x-cineforge-async: 1` on a POST)
  GET  /health, /capabilities, POST /warm, GET /livez (public, says nothing)

Every route except /livez sits behind the Media Runtime Gateway shared with
apps/gpu-worker (app/gateway): a short-lived Ed25519 execution token bound to
this deployment (DEPLOYMENT_ID), the action (scope), the job, the exact
request body and the voice authorization digest (engine, checkpoint revision,
weights digest, operation, and every input object by content hash).
GATEWAY_MODE=report logs violations without blocking; enforce rejects them,
refuses to start half-configured or with storage credentials present, and
refuses unpinned models. This service holds no storage credentials at all: it
reads and writes only through the URLs CineForge presigns per job.
"""

from __future__ import annotations

import logging
import os
import re
import tempfile
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field, ValidationError

from .code_digest import code_digest
from .engines import EngineError, GpuUnavailableError, Style, VoiceBackend, build_backend, cosine
from .gateway import Enforcer, GatewayConfig, GatewayConfigError, ModelSpec, RequestBinding, resolve_weights_digest
from .gateway.manifest import PLACEHOLDER
from .media_io import MediaUrlError, fetch_to_temp, put_file, sha256_file, storage_credentials_present, suffix_of
from .tasks import Tasks
from .voice_authz import VOICE_AUTHZ_VERSION, voice_authz_digest
from .wavio import AudioError, to_wav, wav_info

# Digest of the code this process actually loaded (shared modules included in the image).
CODE_SHA256 = code_digest(Path(__file__).resolve().parent)

log = logging.getLogger("cineforge.gateway")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
MAX_ITEMS = int(os.environ.get("VOICE_MAX_BATCH_ITEMS", "500"))
VOICE_CACHE_SIZE = int(os.environ.get("VOICE_CACHE_SIZE", "32"))


# ── request bodies ──────────────────────────────────────────────────────
class InputRef(BaseModel):
    key: str
    sha256: str = ""


class Target(BaseModel):
    key: str
    uploadUrl: str


class EnrollInput(BaseModel):
    jobId: str | None = None
    voiceId: str
    language: str
    reference: InputRef
    referenceText: str | None = None
    inputUrls: dict[str, str] | None = None
    output: Target | None = None

    def inputs(self) -> list[InputRef]:
        return [self.reference]


class VoiceRef(InputRef):
    artifactType: str
    metadata: dict | None = None


class StyleIn(BaseModel):
    speed: float | None = Field(default=None, ge=0.5, le=2.0)
    emotion: str | None = None
    energy: float | None = None
    pitch: float | None = None


class SpeechItem(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,64}$")
    text: str


class SpeechInput(BaseModel):
    jobId: str | None = None
    language: str
    voice: VoiceRef | None = None
    style: StyleIn | None = None
    items: list[SpeechItem] = Field(min_length=1)
    inputUrls: dict[str, str] | None = None
    outputs: dict[str, Target] | None = None

    def inputs(self) -> list[InputRef]:
        return [self.voice] if self.voice else []


class SimilarityInput(BaseModel):
    jobId: str | None = None
    reference: InputRef
    candidates: list[InputRef] = Field(min_length=1, max_length=200)
    inputUrls: dict[str, str] | None = None

    def inputs(self) -> list[InputRef]:
        return [self.reference, *self.candidates]


class EvictInput(BaseModel):
    keys: list[str] = Field(min_length=1, max_length=100)


# ── runtime identity ────────────────────────────────────────────────────
class RuntimeIdentity:
    """What this service would actually run: engine, runtime and resolved checkpoint."""

    def __init__(self, backend: VoiceBackend, resolve: Callable[[ModelSpec], str | None]) -> None:
        self.backend = backend
        self._resolve = resolve
        self._weights: dict[str, str | None] = {}

    def specs(self) -> dict[str, ModelSpec]:
        return {role: ModelSpec(role, repo, rev) for role, (repo, rev) in self.backend.model_specs().items()}

    def resolve_all(self) -> None:
        # Once, at startup: an unauthenticated caller can never trigger Hub lookups.
        for spec in self.specs().values():
            self._weights[spec.role] = self._resolve(spec) if spec.pinned else None

    def weights(self, spec: ModelSpec) -> str | None:
        if not self.backend.is_real:
            return PLACEHOLDER
        return self._weights.get(spec.role)

    def expected_authz(self, operation: str, inputs: list[InputRef]) -> tuple[str | None, str | None]:
        specs = list(self.specs().values())
        if self.backend.is_real and any(not s.pinned or not self.weights(s) for s in specs):
            return None, "MODEL_UNRESOLVED"
        digest = voice_authz_digest(
            engine=self.backend.engine_id,
            operation=operation,
            runtime=self.backend.runtime(),
            models=[{"role": s.role, "id": s.repo_id, "revision": s.revision or "", "weights": self.weights(s) or ""} for s in specs],
            inputs=[{"key": i.key, "sha256": i.sha256} for i in inputs],
        )
        return digest, None

    def manifest(self) -> dict:
        return {
            "authzVersion": VOICE_AUTHZ_VERSION,
            "authzKind": "voice",
            "runtime": self.backend.runtime(),
            "models": [
                {"role": s.role, "id": s.repo_id, "revision": s.revision, "pinned": s.pinned, "weights": self.weights(s)}
                for s in self.specs().values()
            ],
        }


class VoiceCache:
    """Prepared voices kept warm, keyed by artifact content hash (LRU)."""

    def __init__(self, backend: VoiceBackend, size: int) -> None:
        self.backend, self.size = backend, max(1, size)
        self._items: OrderedDict[str, tuple[str, object, str]] = OrderedDict()

    def __len__(self) -> int:
        return len(self._items)

    def get(self, sha: str):
        hit = self._items.get(sha)
        if hit is not None:
            self._items.move_to_end(sha)
            return hit[1]
        return None

    def put(self, sha: str, key: str, prepared, path: str) -> None:
        """Keep a prepared voice (and its downloaded file, which some engines read per call)."""
        self._items[sha] = (key, prepared, path)
        self._items.move_to_end(sha)
        while len(self._items) > self.size:
            self._drop(next(iter(self._items)))

    def evict_keys(self, keys: set[str]) -> int:
        gone = [sha for sha, (k, _, _) in self._items.items() if k in keys]
        for sha in gone:
            self._drop(sha)
        return len(gone)

    def _drop(self, sha: str) -> None:
        _, prepared, path = self._items.pop(sha)
        self.backend.release_voice(prepared)
        if os.path.exists(path):
            os.unlink(path)


def create_app(
    *,
    config: GatewayConfig | None = None,
    backend: VoiceBackend | None = None,
    fetch: Callable[[str, str], str] = fetch_to_temp,
    put: Callable[[str, str, str], int] = put_file,
    resolve_weights: Callable[[ModelSpec], str | None] = resolve_weights_digest,
) -> FastAPI:
    config = config or GatewayConfig.from_env()
    backend = backend or build_backend()
    enforcer = Enforcer(config)
    identity = RuntimeIdentity(backend, resolve_weights)
    voices = VoiceCache(backend, VOICE_CACHE_SIZE)
    tasks = Tasks()
    info = backend.info

    app = FastAPI(title=f"cineforge-gpu-voice:{info.id}")
    app.state.enforcer = enforcer
    app.state.identity = identity
    app.state.backend = backend
    app.state.voices = voices
    app.state.tasks = tasks

    # One GPU, one model: inference runs one job at a time.
    infer_lock = threading.Lock()

    async def guard(request: Request, binding: RequestBinding) -> None:
        body = await request.body()
        d = enforcer.check(authorization=request.headers.get("authorization"), body=body, binding=binding,
                           path=request.url.path)
        if not d.allowed:
            status = d.status if d.status != 200 else 422  # request checks not in the shared table
            raise HTTPException(status_code=status, detail={"error": d.code})

    @app.on_event("startup")
    def _startup() -> None:
        problems = config.problems()
        if config.enforcing and problems:
            raise GatewayConfigError("; ".join(problems))
        creds = storage_credentials_present()
        if config.enforcing and creds:
            raise GatewayConfigError(f"storage credentials present in enforce mode: {', '.join(creds)}")
        for p in problems:
            log.warning('{"event":"gateway.config","problem":%r}', p)
        backend.load()
        if backend.is_real:
            identity.resolve_all()
        unpinned = [f"{s.role}:{s.repo_id}" for s in identity.specs().values() if not s.pinned]
        if backend.is_real and unpinned:
            if config.enforcing:
                raise GatewayConfigError(f"unpinned model revision(s): {', '.join(unpinned)}")
            log.warning('{"event":"gateway.config","problem":"unpinned models %s"}', unpinned)
        if backend.is_real and config.enforcing and any(not identity.weights(s) for s in identity.specs().values()):
            raise GatewayConfigError("model weights digest could not be resolved")

    # ── status ──────────────────────────────────────────────────────────
    @app.get("/livez", response_class=PlainTextResponse)
    def livez() -> str:
        return "ok"

    @app.get("/health")
    async def health(request: Request) -> dict:
        await guard(request, RequestBinding(scope="status"))
        return {"status": "ok", "model": info.id, "modelLoaded": backend.is_loaded, "execution": backend.execution_mode,
                "unavailableReason": backend.unavailable_reason, "vramFreeMb": backend.vram_free_mb(),
                "warmVoices": len(voices)}

    @app.get("/capabilities")
    async def capabilities(request: Request) -> dict:
        await guard(request, RequestBinding(scope="status"))
        return {
            **backend.capabilities(),
            "deploymentId": config.deployment_id or None,
            "gatewayMode": config.mode,
            "asyncJobs": True,
            "maxBatchItems": MAX_ITEMS,
            "manifest": identity.manifest(),
            # Status only; the authoritative image digest comes from the provider's control plane.
            "image": {"sourceCommit": os.environ.get("CINEFORGE_SOURCE_COMMIT") or None, "codeSha256": CODE_SHA256},
        }

    @app.post("/warm")
    async def warm(request: Request) -> dict:
        await guard(request, RequestBinding(scope="warm"))
        await run_in_threadpool(backend.load)
        return {"modelLoaded": backend.is_loaded, "execution": backend.execution_mode}

    # ── helpers ─────────────────────────────────────────────────────────
    def binding_checks(inputs: list[InputRef], urls: dict[str, str] | None, outputs_ok: bool) -> list[tuple[str, bool]]:
        return [
            ("OUTPUT_TARGET_MISSING", outputs_ok),
            ("INPUT_URL_MISSING", {i.key for i in inputs} <= set((urls or {}).keys())),
            # Every input bound by content hash under enforcement.
            ("INPUT_UNHASHED", not config.enforcing or all(_SHA256.match(i.sha256) for i in inputs)),
        ]

    async def parse_and_guard(request: Request, model, scope: str, operation: str | None, outputs_ok):
        raw = await request.body()
        try:
            inp = model.model_validate_json(raw)
        except ValidationError:
            # Authenticate before describing the schema.
            await guard(request, RequestBinding(scope=scope))
            raise HTTPException(status_code=422, detail={"error": "INVALID_REQUEST"}) from None
        authz, authz_error = identity.expected_authz(operation, inp.inputs()) if operation else (None, None)
        await guard(request, RequestBinding(scope=scope, job_id=inp.jobId or "", authz=authz, authz_error=authz_error,
                                            checks=binding_checks(inp.inputs(), inp.inputUrls, outputs_ok(inp))))
        # Report mode lets a violation through for the record, but there is no
        # legacy storage path here: work needs its one-time URLs.
        if not outputs_ok(inp):
            raise HTTPException(status_code=422, detail={"error": "OUTPUT_TARGET_MISSING"})
        if not {i.key for i in inp.inputs()} <= set((inp.inputUrls or {}).keys()):
            raise HTTPException(status_code=422, detail={"error": "INPUT_URL_MISSING"})
        return inp

    def download(ref: InputRef, urls: dict[str, str]) -> str:
        path = fetch(urls[ref.key], suffix_of(ref.key))
        if ref.sha256:
            actual = sha256_file(path)
            if actual != ref.sha256:
                os.unlink(path)
                log.warning('{"event":"gateway.input_integrity","decision":"reject","key":%r}', ref.key)
                raise HTTPException(status_code=409, detail={"error": "INPUT_INTEGRITY", "key": ref.key})
        return path

    def execution(extra: dict | None = None) -> dict:
        return {"mode": backend.execution_mode, "engine": info.id, "engineVersion": backend.engine_version(),
                "runtime": backend.runtime(), "vramPeakMb": backend.vram_peak_mb(), **(extra or {})}

    def checked(fn):
        """Run an operation with its known failures as the HTTP errors CineForge reads."""
        def run(*a, **kw):
            try:
                return fn(*a, **kw)
            except GpuUnavailableError as e:
                log.warning('{"event":"gpu.unavailable","code":%r,"detail":%r}', e.code, e.detail)
                raise HTTPException(status_code=503, detail={"error": e.code, "reason": e.detail}) from None
            except EngineError as e:
                raise HTTPException(status_code=e.status, detail={"error": e.code, "reason": e.detail}) from None
            except AudioError as e:
                raise HTTPException(status_code=422, detail={"error": e.code}) from None
            except MediaUrlError as e:
                raise HTTPException(status_code=502, detail={"error": "STORAGE_IO", "reason": str(e)}) from None
        return run

    async def respond(request: Request, run, label: str, sub: str | None):
        if request.headers.get("x-cineforge-async") == "1":
            return JSONResponse(status_code=202, content={"taskId": tasks.submit(run, label=label, sub=sub)})
        return JSONResponse(status_code=200, content=await run_in_threadpool(run, lambda: None))

    # ── enrollment ──────────────────────────────────────────────────────
    @checked
    def _enroll(inp: EnrollInput, on_start: Callable[[], None]) -> dict:
        ref = download(inp.reference, inp.inputUrls or {})
        fd, out = tempfile.mkstemp(suffix="." + info.artifact_ext)
        os.close(fd)
        try:
            with infer_lock:
                on_start()
                started = time.monotonic()
                meta = backend.enroll(ref, (inp.referenceText or "").strip() or None, inp.language, out)
                gpu_ms = int((time.monotonic() - started) * 1000)
            sha = sha256_file(out)
            size = put(inp.output.uploadUrl, out, info.artifact_content_type)
            return {
                "artifactType": info.artifact_type,
                "artifactKey": inp.output.key,
                "artifactBytes": size,
                "artifactSha256": sha,
                "metadata": {**meta, "engine": info.id, "engineVersion": backend.engine_version(),
                             "contentType": info.artifact_content_type, "sha256": sha},
                "gpuMs": gpu_ms,
                "execution": execution(),
                "realExecution": backend.is_real,
            }
        finally:
            for p in (ref, out):
                if os.path.exists(p):
                    os.unlink(p)

    @app.post("/v1/voices/enroll")
    async def enroll(request: Request):
        inp = await parse_and_guard(request, EnrollInput, "voice:enroll", "enroll", lambda i: i.output is not None)
        return await respond(request, lambda on_start: _enroll(inp, on_start), "enroll", inp.jobId)

    # ── speech ──────────────────────────────────────────────────────────
    def voice_for(ref: VoiceRef | None, urls: dict[str, str]):
        if ref is None:
            return None
        if ref.artifactType != info.artifact_type:
            raise EngineError("ARTIFACT_TYPE", f"{info.id} cannot use a {ref.artifactType}")
        if ref.sha256:
            hit = voices.get(ref.sha256)
            if hit is not None:
                return hit
        path = download(ref, urls)
        sha = ref.sha256 or sha256_file(path)
        try:
            prepared = backend.prepare_voice(path, sha, ref.metadata or {})
        except Exception:
            os.unlink(path)
            raise
        voices.put(sha, ref.key, prepared, path)
        return prepared

    @checked
    def _speak(inp: SpeechInput, on_start: Callable[[], None]) -> dict:
        if len(inp.items) > MAX_ITEMS:
            raise EngineError("TOO_MANY_ITEMS", f"{len(inp.items)} > {MAX_ITEMS}")
        style = Style(**(inp.style.model_dump() if inp.style else {}))
        tmp = tempfile.mkdtemp(prefix="cf-speech-")
        paths = [os.path.join(tmp, f"{i}.wav") for i in range(len(inp.items))]
        try:
            with infer_lock:
                on_start()
                started = time.monotonic()
                voice = voice_for(inp.voice, inp.inputUrls or {})
                notes = backend.synthesize(voice, [it.text for it in inp.items], inp.language, style, paths)
                gpu_ms = int((time.monotonic() - started) * 1000)
            delivered = []
            for it, p in zip(inp.items, paths):
                dur, rate = wav_info(p)
                target = inp.outputs[it.id]
                size = put(target.uploadUrl, p, "audio/wav")
                delivered.append({"id": it.id, "key": target.key, "bytes": size, "durationSec": round(dur, 3), "sampleRate": rate})
            return {"items": delivered, "gpuMs": gpu_ms, "execution": execution(notes), "realExecution": backend.is_real}
        finally:
            for p in paths:
                if os.path.exists(p):
                    os.unlink(p)
            os.rmdir(tmp)

    @app.post("/v1/speech")
    async def speech(request: Request):
        inp = await parse_and_guard(request, SpeechInput, "voice:run", "speak",
                                    lambda i: i.outputs is not None and {it.id for it in i.items} <= set(i.outputs))
        if len({it.id for it in inp.items}) != len(inp.items):
            raise HTTPException(status_code=422, detail={"error": "DUPLICATE_ITEM_ID"})
        return await respond(request, lambda on_start: _speak(inp, on_start), "speak", inp.jobId)

    # ── similarity (voice benchmark) ────────────────────────────────────
    @checked
    def _similarity(inp: SimilarityInput, on_start: Callable[[], None]) -> dict:
        files: list[str] = []
        try:
            def wav(ref: InputRef) -> str:
                raw = download(ref, inp.inputUrls or {})
                files.append(raw)
                if not backend.is_real:
                    return raw
                w = to_wav(raw, rate=16000)
                files.append(w)
                return w

            ref = wav(inp.reference)
            cands = [(c.key, wav(c)) for c in inp.candidates]
            with infer_lock:
                on_start()
                started = time.monotonic()
                base = backend.embed(ref)
                scores = {k: round(cosine(base, backend.embed(p)), 4) for k, p in cands}
                gpu_ms = int((time.monotonic() - started) * 1000)
            return {"scores": scores, "scorer": {"engine": info.id, "engineVersion": backend.engine_version(),
                                                 "method": "cosine similarity of speaker embeddings"},
                    "gpuMs": gpu_ms, "execution": execution(), "realExecution": backend.is_real}
        finally:
            for p in files:
                if os.path.exists(p):
                    os.unlink(p)

    @app.post("/v1/similarity")
    async def similarity(request: Request):
        inp = await parse_and_guard(request, SimilarityInput, "voice:score", "score", lambda i: True)
        return await respond(request, lambda on_start: _similarity(inp, on_start), "score", inp.jobId)

    # ── erasure ─────────────────────────────────────────────────────────
    @app.post("/v1/voices/evict")
    async def evict(request: Request) -> dict:
        raw = await request.body()
        await guard(request, RequestBinding(scope="voice:evict"))
        try:
            inp = EvictInput.model_validate_json(raw)
        except ValidationError:
            raise HTTPException(status_code=422, detail={"error": "INVALID_REQUEST"}) from None
        with infer_lock:
            n = voices.evict_keys(set(inp.keys))
        return {"evicted": n}

    @app.get("/v1/jobs/{task_id}")
    async def job(task_id: str, request: Request) -> JSONResponse:
        await guard(request, RequestBinding(scope="status"))
        state = tasks.get(task_id)
        if state is None:
            raise HTTPException(status_code=404, detail={"error": "UNKNOWN_TASK"})
        return JSONResponse(status_code=200, content=state)

    return app


_APP: FastAPI | None = None


def __getattr__(name: str):
    """Uvicorn entry point (Dockerfile CMD: app.server:app), built on first access.

    Building reads VOICE_ENGINE and the gateway configuration; a missing or
    unknown engine fails here, loudly. Tests build their own with create_app().
    """
    global _APP
    if name == "app":
        if _APP is None:
            _APP = create_app()
        return _APP
    raise AttributeError(name)
