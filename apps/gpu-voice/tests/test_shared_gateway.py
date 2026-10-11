"""The gateway, media I/O and code digest are apps/gpu-worker's, not a fork."""

from __future__ import annotations

from pathlib import Path

import app
import app.code_digest
import app.gateway
import app.media_io
import app.server

VOICE = Path(__file__).resolve().parents[1] / "app"
WORKER = Path(__file__).resolve().parents[2] / "gpu-worker" / "app"


def test_shared_modules_come_from_the_video_worker():
    assert Path(app.gateway.__file__).resolve().parent == WORKER / "gateway"
    assert Path(app.media_io.__file__).resolve() == WORKER / "media_io.py"
    assert Path(app.code_digest.__file__).resolve() == WORKER / "code_digest.py"
    assert set(app.SHARED_MODULES) == {"gateway", "media_io", "code_digest"}


def test_voice_modules_win_and_nothing_else_is_shared():
    assert Path(app.server.__file__).resolve() == VOICE / "server.py"
    # No copy of a shared module lives here (that would be a fork).
    for m in app.SHARED_MODULES:
        assert not (VOICE / m).exists() and not (VOICE / f"{m}.py").exists()
    assert not (VOICE / "pipeline.py").exists()
