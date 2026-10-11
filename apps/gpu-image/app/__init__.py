"""CineForge image runtime: ComfyUI behind the Media Runtime Gateway (docs/73).

Shared code. The gateway (`app/gateway/`), the one-time media I/O
(`app/media_io.py`) and the code digest (`app/code_digest.py`) are the files
of apps/gpu-worker/app, not copies kept in this directory. The Dockerfile
copies them into /app/app at build time (build context = repo root). In a repo
checkout (tests, local runs) this package also looks in apps/gpu-worker/app
for them. Only those three are taken from there: this package never imports
anything else of the video worker.
"""
from __future__ import annotations

import os

_HERE = os.path.dirname(os.path.abspath(__file__))
SHARED_FROM_GPU_WORKER = ("gateway", "media_io.py", "code_digest.py")

if not os.path.isdir(os.path.join(_HERE, "gateway")):  # repo checkout, not the image
    _shared = os.path.normpath(os.path.join(_HERE, "..", "..", "gpu-worker", "app"))
    if os.path.isdir(os.path.join(_shared, "gateway")):
        __path__.append(_shared)  # type: ignore[name-defined]  # noqa: F821
