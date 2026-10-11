"""The image verifier's gpu-image profile describes exactly what the Dockerfile builds."""
import importlib.util
import re
import sys
from pathlib import Path

import app as pkg

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "apps" / "gpu-worker" / "scripts" / "verify_image.py"
spec = importlib.util.spec_from_file_location("verify_image_gpu_image", SCRIPT)
vi = importlib.util.module_from_spec(spec)
sys.modules["verify_image_gpu_image"] = vi
spec.loader.exec_module(vi)

PROFILE = vi.PROFILES["gpu-image"]


def _copies(dockerfile: Path) -> set[tuple[str, str]]:
    """(git source, path inside /app/app) for every COPY into ./app."""
    out = set()
    for line in dockerfile.read_text().splitlines():
        m = re.match(r"COPY (.+) \./app(/[^ ]*)?$", line)
        if not m:
            continue
        *srcs, = m.group(1).split()
        dest = (m.group(2) or "").strip("/")
        for src in srcs:
            out.add((src, dest if dest or src == "apps/gpu-image/app" else Path(src).name))
    return out


def test_profile_matches_both_dockerfiles():
    want = {(src, dst) for src, dst in PROFILE.sources}
    for df in (REPO / "apps/gpu-image/Dockerfile", REPO / "apps/gpu-image/tests/fixtures/verify/Dockerfile"):
        assert _copies(df) == want, df
        assert "COPY apps/gpu-image/workflows ./workflows" in df.read_text()
    assert PROFILE.trees == (("apps/gpu-image/workflows", "/app/workflows"),)
    assert {dst for _, dst in PROFILE.sources if dst} == set(pkg.SHARED_FROM_GPU_WORKER)


def test_profile_probes_the_image_routes_and_keeps_comfyui_closed():
    assert ("POST", "/images") in PROFILE.protected and ("GET", "/health") in PROFILE.protected
    assert ("POST", "/prompt") in PROFILE.closed
    # The video worker's profile is unchanged.
    assert vi.PROFILES["gpu-worker"].sources == (("apps/gpu-worker/app", ""),)
    assert vi.DEFAULT_PROFILE.protected == (("GET", "/health"), ("POST", "/generate"))


def test_tree_listing_parse():
    assert vi.tree_files("h1  manifest.json\nh2  a@1.json\n") == {"manifest.json": "h1", "a@1.json": "h2"}
