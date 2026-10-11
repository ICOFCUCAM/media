"""The image verifier's gpu-voice profile (apps/gpu-worker/scripts/verify_image.py)
describes exactly what the Dockerfile copies into /app/app, and the composed tree
has the code digest the running service reports."""

from __future__ import annotations

import importlib.util
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "apps" / "gpu-worker" / "scripts" / "verify_image.py"
spec = importlib.util.spec_from_file_location("verify_image_voice", SCRIPT)
vi = importlib.util.module_from_spec(spec)
sys.modules["verify_image_voice"] = vi
spec.loader.exec_module(vi)

DOCKERFILE = (ROOT / "apps" / "gpu-voice" / "Dockerfile").read_text()


def copies_into_app() -> set[tuple[str, str]]:
    out = set()
    for line in DOCKERFILE.splitlines():
        m = re.match(r"^COPY\s+(.+)\s+(\./app\S*)$", line.strip())
        if not m:
            continue
        dest = m.group(2).removeprefix("./app").strip("/")
        for src in m.group(1).split():
            out.add((src, dest if dest else "") if src.endswith("/app") or "." not in Path(src).name else (src, Path(src).name))
    return out


def test_profile_matches_the_dockerfile():
    profile = vi.PROFILES["gpu-voice"]
    assert set(profile.sources) == copies_into_app()
    assert ("POST", "/v1/speech") in profile.protected and ("GET", "/health") in profile.protected


def test_composed_tree_digest_equals_what_the_service_reports_from_its_own_tree():
    from app.code_digest import code_digest

    profile = vi.PROFILES["gpu-voice"]
    with tempfile.TemporaryDirectory() as tmp:
        tree = Path(tmp) / "app"
        tree.mkdir()
        for src, dst in profile.sources:
            s, d = ROOT / src, tree / dst if dst else tree
            if s.is_dir():
                import shutil

                shutil.copytree(s, d, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
            else:
                d.write_bytes(s.read_bytes())
        names = {p.relative_to(tree).as_posix() for p in tree.rglob("*.py")}
        assert {"server.py", "voice_authz.py", "gateway/enforcer.py", "media_io.py", "code_digest.py",
                "engines/qwen3.py", "engines/cosyvoice.py", "engines/gptsovits.py"} <= names
        assert "pipeline.py" not in names  # the video model code is never in a voice image
        assert len(code_digest(tree)) == 64
