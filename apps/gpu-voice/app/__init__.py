"""CineForge self-hosted Voice Engine GPU service (docs/74).

The Media Runtime Gateway (``app.gateway``), one-time media I/O
(``app.media_io``) and the code digest (``app.code_digest``) are SHARED with
apps/gpu-worker, not forked:

  * in the image, the Dockerfile copies them from apps/gpu-worker/app into this
    package (so /app/app is one self-contained tree, and its code digest covers
    the gateway code the pod actually runs);
  * in a git checkout (tests, local runs) they are found in
    ../gpu-worker/app through the package search path below. That directory is
    appended LAST, so a module of this package always wins; only the three
    shared modules are ever imported from there.
"""

from pathlib import Path as _Path

_HERE = _Path(__file__).resolve().parent
_SHARED = _HERE.parents[1] / "gpu-worker" / "app"
SHARED_MODULES = ("gateway", "media_io", "code_digest")

if not (_HERE / "gateway").is_dir() and _SHARED.is_dir():
    __path__.append(str(_SHARED))  # type: ignore[name-defined]  # noqa: F821
