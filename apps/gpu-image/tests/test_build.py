"""The image build agrees with the registry and shares the video worker's
security code; custom nodes can only be added pinned; the authorization digest
of a still matches the TypeScript authority (golden vector)."""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

import app as pkg
from app.gateway import authz_digest
from app.gateway.authz import TimingRequest
from app.registry import load_registry

ROOT = Path(__file__).resolve().parents[1]
DOCKERFILE = (ROOT / "Dockerfile").read_text()

spec = importlib.util.spec_from_file_location("install_custom_nodes", ROOT / "scripts" / "install_custom_nodes.py")
icn = importlib.util.module_from_spec(spec)
sys.modules["install_custom_nodes"] = icn
spec.loader.exec_module(icn)


def test_dockerfile_pins_comfyui_to_the_registry_commit():
    commit = re.search(r"ARG COMFYUI_COMMIT=([0-9a-f]{40})", DOCKERFILE).group(1)
    assert commit == load_registry().runtime["commit"]


def test_dockerfile_copies_exactly_the_shared_gateway_files():
    assert "COPY apps/gpu-worker/app/gateway ./app/gateway" in DOCKERFILE
    assert "COPY apps/gpu-worker/app/media_io.py apps/gpu-worker/app/code_digest.py ./app/" in DOCKERFILE
    assert pkg.SHARED_FROM_GPU_WORKER == ("gateway", "media_io.py", "code_digest.py")
    # In a checkout they resolve to the video worker's own files (no fork).
    import app.gateway.enforcer as enf
    import app.media_io as mio

    assert "apps/gpu-worker/app" in Path(enf.__file__).as_posix() and "apps/gpu-worker/app" in Path(mio.__file__).as_posix()


def test_no_mutable_references_anywhere_in_the_build():
    for f in [ROOT / "requirements.txt", ROOT / "constraints.txt"]:
        for line in f.read_text().splitlines():
            line = line.split("#", 1)[0].strip()
            assert not line or "==" in line, f"unpinned requirement {line!r} in {f.name}"
    assert ":latest" not in DOCKERFILE
    assert re.search(r"^FROM [^\s:]+:[0-9][^\s]*$", DOCKERFILE, re.M)
    # Every pip install in the image is under the pinned constraints.
    installs = re.findall(r"pip3 install [^\n]*", DOCKERFILE)
    assert installs and all("-c constraints.txt" in i for i in installs)


def test_custom_node_plan_requires_pins_and_approved_licences():
    assert icn.plan({"customNodes": []}) == []
    ok = {"repo": "https://github.com/example/comfy-nodes", "commit": "a" * 40, "licence": "GPL-3.0-only"}
    assert icn.plan({"customNodes": [ok]}) == [{**ok, "name": "comfy-nodes"}]
    for bad in [{**ok, "commit": "main"}, {**ok, "repo": "http://example.com/x"}, {**ok, "licence": "CC-BY-NC-4.0"}]:
        with pytest.raises(ValueError):
            icn.plan({"customNodes": [bad]})
    assert icn.plan(json.loads((ROOT / "workflows" / "manifest.json").read_text())) == []


GOLDEN = json.loads((Path(__file__).parent / "fixtures" / "image_authz.json").read_text())


def test_image_authz_golden_vector_matches_typescript():
    d = GOLDEN["input"]
    got = authz_digest(workflow=d["workflow"], runtime=d["runtime"], models=d["models"], loras=d["loras"],
                       timing=TimingRequest(duration_us=0, fps=0, width=d["width"], height=d["height"]))
    assert got == GOLDEN["digest"]
