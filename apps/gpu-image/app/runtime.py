"""The image runtime the service drives: real ComfyUI, or the explicit placeholder.

Rule (same as apps/gpu-worker/app/pipeline.py): the placeholder runs ONLY when
CINEFORGE_PLACEHOLDER=1 is set explicitly (tests, CI, image verification).
Without it, a worker that cannot run for real — no CUDA, an unpinned model
revision, a failed download, ComfyUI not starting — is *unavailable*:
`/images` refuses with 503 and the reason. It never returns a placeholder
still in place of a real one, and every result says what actually ran.
"""
from __future__ import annotations

import os
import shutil
import threading
from pathlib import Path

from .comfy import ComfyError, ComfyProcess
from .png import placeholder_png
from .registry import Registry
from .weights import PinnedModel, fetch_all, file_digest, pinned_models

PLACEHOLDER = "placeholder"


class RuntimeUnavailable(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _cuda_available() -> bool:
    try:
        import torch  # noqa: PLC0415

        return bool(torch.cuda.is_available())
    except Exception:  # noqa: BLE001
        return False


class ImageRuntime:
    """Base: state, pins and identity. Subclasses implement load/stage/execute."""

    model_name = "comfyui-image"

    def __init__(self, registry: Registry, env: dict[str, str] | None = None) -> None:
        self.registry = registry
        self.pins: dict[str, PinnedModel] = pinned_models(registry.models, env)
        self._loaded = False
        self._loading = False
        self._real = False
        self._unavailable: str | None = None
        self._weights: dict[str, str | None] = {}

    # ── state ──────────────────────────────────────────────────────────
    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def is_real(self) -> bool:
        return self._real

    @property
    def execution_mode(self) -> str:
        """"real" | "placeholder" | "unavailable" | "loading" | "unloaded"."""
        if self._loading:
            return "loading"
        if not self._loaded:
            return "unloaded"
        if self._real:
            return "real"
        return "unavailable" if self._unavailable else PLACEHOLDER

    @property
    def unavailable_reason(self) -> str | None:
        return self._unavailable

    def unpinned(self) -> list[str]:
        return sorted(f"{pm.decl.key}:{pm.decl.revision_env}" for pm in self.pins.values() if not pm.pinned)

    # ── identity ───────────────────────────────────────────────────────
    def runtime_id(self) -> str:
        rt = self.registry.runtime
        return f"comfyui@{rt['commit']}" if self._real else PLACEHOLDER

    def weights(self, key: str) -> str | None:
        if not self._real:
            return PLACEHOLDER
        return self._weights.get(key)

    def vram_free_mb(self) -> int:
        return 0

    # ── work (subclasses) ──────────────────────────────────────────────
    def load(self) -> None:
        raise NotImplementedError

    def stage(self, job_id: str, refs: list[str], loras: list[str]) -> tuple[list[str], list[str]]:
        """Make inputs visible to the runtime; return the names the graph uses."""
        raise NotImplementedError

    def execute(self, graph: dict, job_id: str, *, seed: int, width: int, height: int, prompt: str, timeout_sec: float) -> bytes:
        raise NotImplementedError

    def cleanup(self, job_id: str) -> None:
        pass


class PlaceholderRuntime(ImageRuntime):
    """CINEFORGE_PLACEHOLDER=1 only. Runs no model; says so in every result."""

    def load(self) -> None:
        self._loaded = True

    def stage(self, job_id, refs, loras):
        return [f"cf_{job_id}_ref{i}.png" for i in range(len(refs))], [f"cf_{job_id}_lora{i}.safetensors" for i in range(len(loras))]

    def execute(self, graph, job_id, *, seed, width, height, prompt, timeout_sec):
        return placeholder_png(width, height, seed, prompt)


class UnavailableRuntime(ImageRuntime):
    """No placeholder flag and no way to run for real (e.g. no ComfyUI install)."""

    def __init__(self, registry: Registry, code: str, env=None) -> None:
        super().__init__(registry, env)
        self._code = code

    def load(self) -> None:
        self._unavailable = self._code
        self._loaded = True

    def stage(self, job_id, refs, loras):
        raise RuntimeUnavailable(self._code)

    def execute(self, *a, **kw):
        raise RuntimeUnavailable(self._code)


class ComfyRuntime(ImageRuntime):
    """Real execution: pinned models downloaded, ComfyUI started on 127.0.0.1."""

    def __init__(self, registry: Registry, *, comfy_dir: str, base: str, env: dict[str, str] | None = None,
                 cuda=_cuda_available, download=None, process: ComfyProcess | None = None) -> None:
        super().__init__(registry, env)
        self.comfy_dir, self.base = comfy_dir, base
        self.models_dir = os.path.join(comfy_dir, "models")
        self._cuda = cuda
        self._download = download
        whitelist = [Path(n["repo"]).name.removesuffix(".git") for n in registry.custom_nodes]
        self.proc = process or ComfyProcess(comfy_dir, base, port=int(os.environ.get("COMFYUI_PORT", "8188")), whitelist=whitelist)
        self._lock = threading.Lock()

    def load(self) -> None:
        if self._loaded:
            return
        self._loading = True
        try:
            self._load()
        finally:
            self._loading = False
            self._loaded = True

    def _load(self) -> None:
        if self.unpinned():
            # Never download a moving branch: every model is pinned or nothing runs.
            self._unavailable = "MODEL_UNPINNED"
            return
        if not self._cuda():
            self._unavailable = "CUDA_UNAVAILABLE"
            return
        try:
            fetch_all(self.pins, self.models_dir, **({"download": self._download} if self._download else {}))
        except Exception as e:  # noqa: BLE001
            print(f'{{"event":"image.models","error":{type(e).__name__!r}}}', flush=True)
            self._unavailable = "MODEL_DOWNLOAD_FAILED"
            return
        self._weights = {k: file_digest(pm) for k, pm in self.pins.items()}
        if not all(self._weights.values()):
            self._unavailable = "WEIGHTS_UNRESOLVED"
            return
        try:
            self.proc.start()
        except ComfyError as e:
            self._unavailable = e.code
            return
        self._real = True

    def vram_free_mb(self) -> int:
        return self.proc.vram_free_mb() if self._real else 0

    def _check(self) -> None:
        if not self._real:
            raise RuntimeUnavailable(self._unavailable or "MODEL_LOADING")
        if not self.proc.alive():
            self._real = False
            self._unavailable = "COMFYUI_EXITED"
            raise RuntimeUnavailable("COMFYUI_EXITED")

    def stage(self, job_id, refs, loras):
        self._check()
        ref_names, lora_names = [], []
        for i, p in enumerate(refs):
            name = f"cf_{job_id}_ref{i}{Path(p).suffix or '.png'}"
            shutil.copyfile(p, os.path.join(self.proc.input_dir, name))
            ref_names.append(name)
        lora_dir = os.path.join(self.models_dir, "loras")
        os.makedirs(lora_dir, exist_ok=True)
        for i, p in enumerate(loras):
            name = f"cf_{job_id}_lora{i}.safetensors"
            shutil.copyfile(p, os.path.join(lora_dir, name))
            lora_names.append(name)
        return ref_names, lora_names

    def execute(self, graph, job_id, *, seed, width, height, prompt, timeout_sec):
        self._check()
        with self._lock:  # one graph at a time on the GPU
            images = self.proc.run(graph, timeout_sec)
        out = [i for i in images if i.get("type") == "output"]
        if len(out) != 1:
            raise ComfyError("COMFYUI_NO_OUTPUT", f"{len(out)} output images")
        rec = out[0]
        path = Path(self.proc.output_dir, rec.get("subfolder") or "", rec["filename"]).resolve()
        if Path(self.proc.output_dir).resolve() not in path.parents:
            raise ComfyError("COMFYUI_OUTPUT_OUTSIDE_JOB")
        data = path.read_bytes()
        path.unlink(missing_ok=True)
        return data

    def cleanup(self, job_id: str) -> None:
        """No cross-job leakage: this job's inputs, LoRAs and outputs are removed."""
        prefix = f"cf_{job_id}_"
        for d in (self.proc.input_dir, os.path.join(self.models_dir, "loras"), self.proc.output_dir):
            try:
                for name in os.listdir(d):
                    if name.startswith(prefix) or name.startswith(f"{job_id}_"):
                        os.unlink(os.path.join(d, name))
            except OSError:
                pass


def build_runtime(registry: Registry, env: dict[str, str] | None = None) -> ImageRuntime:
    env = dict(os.environ if env is None else env)
    if env.get("CINEFORGE_PLACEHOLDER") == "1":
        return PlaceholderRuntime(registry, env)
    comfy_dir = env.get("COMFYUI_DIR", "/opt/ComfyUI")
    if not os.path.isfile(os.path.join(comfy_dir, "main.py")):
        return UnavailableRuntime(registry, "COMFYUI_NOT_INSTALLED", env)
    return ComfyRuntime(registry, comfy_dir=comfy_dir, base=env.get("COMFYUI_WORK_DIR", "/tmp/cineforge-comfy"), env=env)
