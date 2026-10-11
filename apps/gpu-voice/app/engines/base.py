"""The engine interface every self-hosted voice model implements on the GPU
(Part 4 §147, §158). CineForge never sees these classes: it talks to the one
HTTP API in app/server.py, and each container runs exactly ONE engine
(VOICE_ENGINE), so VRAM use is predictable and models are never co-installed
(§171.2).

No silent degradation (DOS-75): the placeholder path runs ONLY when
CINEFORGE_PLACEHOLDER=1 is set explicitly (tests, local wiring). Without that
flag a container with no CUDA, or whose model failed to load, is
*unavailable*: it refuses work with 503 and never returns a tone as if it were
speech. Every result says which mode produced it (`execution.mode`).
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
from dataclasses import dataclass, field
from importlib import metadata

from ..wavio import AudioError, to_wav, wav_info, write_tone

log = logging.getLogger("cineforge.voice")

PLACEHOLDER_RUNTIME = "placeholder"


class EngineError(RuntimeError):
    """A refusal CineForge reads by code (HTTP status chosen by the server)."""

    def __init__(self, code: str, detail: str = "", status: int = 422) -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail
        self.status = status


class GpuUnavailableError(EngineError):
    def __init__(self, code: str = "GPU_UNAVAILABLE", detail: str = "") -> None:
        super().__init__(code, detail, status=503)


@dataclass(frozen=True)
class EngineInfo:
    id: str
    name: str
    #: ISO 639-1 code → the language value the model takes.
    languages: dict[str, str]
    #: Longest text one item may carry (CineForge segments longer scripts first).
    max_chars: int
    #: voice_engine_artifacts.artifact_type of what enrollment stores.
    artifact_type: str
    artifact_ext: str
    artifact_content_type: str
    #: Native output rate; CineForge masters every clip to 48 kHz afterwards.
    sample_rate: int
    speed_control: bool
    #: Can this engine embed a recording for voice-similarity scoring?
    similarity: bool
    default_repo: str
    #: Reference recording limits (seconds) — the model's own.
    min_reference_sec: float = 3.0
    max_reference_sec: float = 30.0
    #: What a reference transcript does for this engine.
    transcript_note: str = ""
    extra: dict = field(default_factory=dict)


@dataclass
class Style:
    speed: float | None = None
    emotion: str | None = None
    energy: float | None = None
    pitch: float | None = None


def _cuda_available() -> bool:
    try:
        import torch  # noqa: PLC0415

        return bool(torch.cuda.is_available())
    except Exception:  # noqa: BLE001
        return False


class VoiceBackend:
    """Base class: lifecycle, placeholder behaviour and the common checks.

    Subclasses implement ``_load_real``, ``_enroll_real``, ``_prepare_real``,
    ``_synthesize_real`` and (when ``info.similarity``) ``_embed_real``.
    """

    info: EngineInfo
    #: Python distribution (or git checkout) that provides the runtime.
    runtime_package: str = ""

    def __init__(self, env: dict[str, str] | None = None) -> None:
        env = dict(os.environ if env is None else env)
        self.env = env
        self.placeholder = env.get("CINEFORGE_PLACEHOLDER") == "1"
        self.repo = (env.get("VOICE_MODEL_REPO") or self.info.default_repo).strip()
        self.revision = (env.get("VOICE_MODEL_REVISION") or "").strip() or None
        self._loaded = False
        self._real = False
        self._unavailable: str | None = None
        self.last_execution: dict | None = None

    # ── identity ────────────────────────────────────────────────────────
    @property
    def engine_id(self) -> str:
        return self.info.id

    def model_specs(self) -> dict[str, tuple[str, str | None]]:
        """role → (Hugging Face repository, pinned revision)."""
        return {"tts": (self.repo, self.revision)}

    def runtime(self) -> str:
        if not self._real:
            return PLACEHOLDER_RUNTIME
        return self._runtime_version()

    def _runtime_version(self) -> str:
        commit = self.env.get("VOICE_ENGINE_SOURCE_COMMIT", "").strip()
        if commit:
            return f"{self.runtime_package}@{commit[:12]}"
        try:
            return f"{self.runtime_package}@{metadata.version(self.runtime_package)}"
        except metadata.PackageNotFoundError:
            return f"{self.runtime_package}@unknown"

    def engine_version(self) -> str:
        """What CineForge keys artifacts and the speech cache by: checkpoint@revision."""
        return f"{self.repo}@{(self.revision or 'unpinned')[:12]}"

    # ── lifecycle ───────────────────────────────────────────────────────
    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def is_real(self) -> bool:
        return self._real

    @property
    def execution_mode(self) -> str:
        """"real" | "placeholder" | "unavailable" | "unloaded"."""
        if not self._loaded:
            return "unloaded"
        if self._real:
            return "real"
        return "unavailable" if self._unavailable else "placeholder"

    @property
    def unavailable_reason(self) -> str | None:
        return self._unavailable

    def load(self) -> None:
        """Load the weights once and keep them warm (§152.2)."""
        if self._loaded:
            return
        if self.placeholder:
            self._loaded = True
            return
        if not _cuda_available():
            self._unavailable = "CUDA_UNAVAILABLE"
            self._loaded = True
            return
        try:
            self._load_real()
            self._real = True
        except Exception as e:  # noqa: BLE001 — reported, never papered over
            log.exception('{"event":"voice.load_failed","engine":%r}', self.engine_id)
            self._unavailable = f"MODEL_LOAD_FAILED:{type(e).__name__}"
        self._loaded = True

    def _require_ready(self) -> None:
        if not self._loaded:
            self.load()
        if self._unavailable:
            raise GpuUnavailableError("GPU_UNAVAILABLE", self._unavailable)

    def snapshot(self, allow_patterns: list[str] | None = None) -> str:
        """Local directory of the pinned checkpoint (downloaded once into HF_HOME)."""
        from huggingface_hub import snapshot_download  # noqa: PLC0415

        return snapshot_download(repo_id=self.repo, revision=self.revision, allow_patterns=allow_patterns)

    def vram_free_mb(self) -> int | None:
        if not self._real:
            return None
        try:
            import torch  # noqa: PLC0415

            free, _total = torch.cuda.mem_get_info()
            return int(free / (1024 * 1024))
        except Exception:  # noqa: BLE001
            return None

    def vram_peak_mb(self) -> int | None:
        if not self._real:
            return None
        try:
            import torch  # noqa: PLC0415

            return int(torch.cuda.max_memory_allocated() / (1024 * 1024))
        except Exception:  # noqa: BLE001
            return None

    # ── common checks ───────────────────────────────────────────────────
    def language(self, iso: str) -> str:
        code = (iso or "").strip().lower().replace("_", "-").split("-")[0]
        if code not in self.info.languages:
            raise EngineError("LANGUAGE_UNSUPPORTED", f"{self.engine_id} does not speak {iso!r}")
        return self.info.languages[code]

    def reference(self, src: str, text: str | None) -> tuple[str, str | None, float]:
        """The reference as engine-ready WAV, the transcript still valid for it, and its length.

        A transcript only describes the WHOLE recording, so when the recording
        has to be shortened to the model's limit the transcript is dropped and
        the engine uses its transcript-free mode (recorded in the artifact).
        """
        full = to_wav(src, rate=self.info.sample_rate)
        dur, _ = wav_info(full)
        if dur < self.info.min_reference_sec:
            os.unlink(full)
            raise EngineError("REFERENCE_TOO_SHORT", f"{dur:.1f}s < {self.info.min_reference_sec:.0f}s")
        if dur <= self.info.max_reference_sec:
            return full, (text or None), dur
        os.unlink(full)
        clip = to_wav(src, rate=self.info.sample_rate, max_sec=self.info.max_reference_sec)
        return clip, None, self.info.max_reference_sec

    # ── operations (called under the server's inference lock) ──────────
    def enroll(self, reference_path: str, reference_text: str | None, language: str, out_path: str) -> dict:
        """Write the engine artifact for a voice to `out_path`; return its metadata."""
        self._require_ready()
        lang = self.language(language)
        if not self._real:
            facts = {"placeholder": True, "engine": self.engine_id, "language": lang,
                     "referenceSha256": _sha256(reference_path), "transcript": bool(reference_text)}
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(facts, f, sort_keys=True)
            return {"mode": "placeholder", "transcriptUsed": bool(reference_text)}
        return self._enroll_real(reference_path, reference_text, lang, out_path)

    def prepare_voice(self, artifact_path: str, artifact_sha256: str):
        """Load a stored artifact into whatever the model consumes (cached by the server)."""
        self._require_ready()
        if not self._real:
            with open(artifact_path, encoding="utf-8") as f:
                doc = json.load(f)
            if not doc.get("placeholder"):
                raise EngineError("ARTIFACT_MODE_MISMATCH", "a real artifact cannot be read in placeholder mode")
            return doc
        return self._prepare_real(artifact_path, artifact_sha256)

    def release_voice(self, prepared) -> None:  # noqa: B027 — optional hook
        """Free anything a prepared voice holds on the GPU side (evicted from the cache)."""

    def synthesize(self, voice, texts: list[str], language: str, style: Style, out_paths: list[str]) -> dict:
        """Speak every text in `voice` (a prepared artifact) to the matching WAV path."""
        self._require_ready()
        lang = self.language(language)
        for t in texts:
            if not t.strip():
                raise EngineError("EMPTY_TEXT")
            if len(t) > self.info.max_chars:
                raise EngineError("TEXT_TOO_LONG", f"{len(t)} > {self.info.max_chars} characters")
        if voice is None:
            raise EngineError("VOICE_REQUIRED", f"{self.engine_id} speaks only enrolled (cloned) voices")
        ignored = []
        if style.speed is not None and not self.info.speed_control:
            ignored.append("speed")
        for k in ("emotion", "energy", "pitch"):
            if getattr(style, k) is not None:
                ignored.append(k)
        if not self._real:
            for t, p in zip(texts, out_paths):
                write_tone(p, max(0.5, 0.06 * len(t)), rate=self.info.sample_rate)
            return {"styleIgnored": ignored}
        self._synthesize_real(voice, texts, lang, style, out_paths)
        return {"styleIgnored": ignored}

    def embed(self, wav_path: str) -> list[float]:
        """Speaker embedding of a recording (voice-similarity scoring)."""
        self._require_ready()
        if not self.info.similarity:
            raise EngineError("SIMILARITY_UNSUPPORTED", f"{self.engine_id} has no speaker encoder exposed")
        if not self._real:
            # Deterministic pseudo-embedding from the bytes: placeholder only.
            digest = hashlib.sha256(open(wav_path, "rb").read()).digest()
            return [((b / 255.0) - 0.5) for b in digest]
        return self._embed_real(wav_path)

    # ── engine-specific (real) ──────────────────────────────────────────
    def _load_real(self) -> None:
        raise NotImplementedError

    def _enroll_real(self, reference_path: str, reference_text: str | None, language: str, out_path: str) -> dict:
        raise NotImplementedError

    def _prepare_real(self, artifact_path: str, artifact_sha256: str):
        raise NotImplementedError

    def _synthesize_real(self, voice, texts: list[str], language: str, style: Style, out_paths: list[str]) -> None:
        raise NotImplementedError

    def _embed_real(self, wav_path: str) -> list[float]:
        raise NotImplementedError

    # ── reporting ───────────────────────────────────────────────────────
    def capabilities(self) -> dict:
        i = self.info
        return {
            "model": i.id,
            "engine": i.name,
            "engineVersion": self.engine_version(),
            "runtime": self.runtime(),
            "execution": self.execution_mode,
            "realExecution": self._real,
            "unavailableReason": self._unavailable,
            "languages": sorted(i.languages),
            "maxChars": i.max_chars,
            "artifactType": i.artifact_type,
            "sampleRate": i.sample_rate,
            "voiceCloning": True,
            "builtInVoices": [],
            "speedControl": i.speed_control,
            "emotionControl": False,
            "batch": True,
            "streaming": False,
            "voiceSimilarity": i.similarity,
            "referenceSeconds": [i.min_reference_sec, i.max_reference_sec],
            "transcript": i.transcript_note,
        }


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        raise EngineError("EMBEDDING_MISMATCH")
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return 0.0 if na == 0 or nb == 0 else dot / (na * nb)


__all__ = ["AudioError", "EngineError", "EngineInfo", "GpuUnavailableError", "Style", "VoiceBackend", "cosine",
           "PLACEHOLDER_RUNTIME"]
