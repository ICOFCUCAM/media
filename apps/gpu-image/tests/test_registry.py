"""Workflow Registry: loading, licence and node checks, hashing, slot filling."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from app.registry import DEFAULT_DIR, BindRequest, RegistryError, SlotError, bind, fit_size, load_registry

T2I, REF = ("cineforge.still.t2i", 1), ("cineforge.still.ref", 1)


def req(**over) -> BindRequest:
    base = dict(prompt="a lighthouse at dusk", negative=None, seed=42, width=1344, height=768)
    return BindRequest(**{**base, **over})


@pytest.fixture()
def wfdir(tmp_path) -> Path:
    d = tmp_path / "workflows"
    shutil.copytree(DEFAULT_DIR, d)
    return d


def edit_manifest(d: Path, fn) -> None:
    m = json.loads((d / "manifest.json").read_text())
    fn(m)
    (d / "manifest.json").write_text(json.dumps(m))


def test_registry_loads_both_workflows_with_hashes():
    reg = load_registry()
    assert set(reg.workflows) == {T2I, REF}
    for w in reg.workflows.values():
        assert len(w.sha256) == 64
    assert len(reg.sha256) == 64
    assert reg.runtime["commit"] == "8ff6dc384ba5c410266b40e137799e049459d4f2"
    # Every shipped model is licence-safe for commercial use, with its source recorded.
    for m in reg.models.values():
        assert m.licence == "Apache-2.0" and m.licence_source
    summary = {(s["id"], s["version"]): s for s in reg.summary()}
    assert summary[REF]["modelLabel"] == "qwen-image-edit-2511" and summary[REF]["licences"] == ["Apache-2.0"]


def test_hash_is_stable_and_changes_with_the_graph(wfdir):
    a, b = load_registry(wfdir), load_registry(wfdir)
    assert a.get(*T2I).sha256 == b.get(*T2I).sha256 and a.sha256 == b.sha256
    g = json.loads((wfdir / "cineforge.still.t2i@1.json").read_text())
    g["9"]["inputs"]["cfg"] = 7.0
    (wfdir / "cineforge.still.t2i@1.json").write_text(json.dumps(g))
    c = load_registry(wfdir)
    assert c.get(*T2I).sha256 != a.get(*T2I).sha256 and c.sha256 != a.sha256
    assert c.get(*REF).sha256 == a.get(*REF).sha256


def test_non_commercial_model_is_refused(wfdir):
    edit_manifest(wfdir, lambda m: m["models"]["qwen-image.diffusion"].update(licence="FLUX-1-dev-Non-Commercial"))
    with pytest.raises(RegistryError, match="not approved for commercial use"):
        load_registry(wfdir)


def test_node_outside_the_allow_list_is_refused(wfdir):
    g = json.loads((wfdir / "cineforge.still.t2i@1.json").read_text())
    g["99"] = {"class_type": "ExecutePython", "inputs": {"code": "import os"}}
    (wfdir / "cineforge.still.t2i@1.json").write_text(json.dumps(g))
    with pytest.raises(RegistryError, match="not allow-listed"):
        load_registry(wfdir)


def test_a_loader_may_only_load_a_declared_model(wfdir):
    g = json.loads((wfdir / "cineforge.still.t2i@1.json").read_text())
    g["1"]["inputs"]["unet_name"] = "flux1-dev.safetensors"
    (wfdir / "cineforge.still.t2i@1.json").write_text(json.dumps(g))
    with pytest.raises(RegistryError, match="undeclared model"):
        load_registry(wfdir)


def test_runtime_and_custom_nodes_must_be_pinned(wfdir):
    edit_manifest(wfdir, lambda m: m["runtime"].update(commit="master"))
    with pytest.raises(RegistryError, match="40-hex"):
        load_registry(wfdir)
    edit_manifest(wfdir, lambda m: (m["runtime"].update(commit="a" * 40), m.update(customNodes=[{"repo": "https://github.com/x/y", "commit": "main", "licence": "MIT"}])))
    with pytest.raises(RegistryError, match="pinned"):
        load_registry(wfdir)


def test_t2i_binding_fills_slots_and_bypasses_the_absent_lora():
    reg = load_registry()
    g, sha = bind(reg, reg.get(*T2I), req(negative="blurry", steps=30, output_prefix="cf_j1_out"))
    assert g["6"]["inputs"]["text"] == "a lighthouse at dusk" and g["7"]["inputs"]["text"] == "blurry"
    assert g["9"]["inputs"]["seed"] == 42 and g["9"]["inputs"]["steps"] == 30
    assert (g["8"]["inputs"]["width"], g["8"]["inputs"]["height"]) == (1344, 768)
    assert "4" not in g and g["5"]["inputs"]["model"] == ["1", 0]  # LoRA node bypassed
    assert g["11"]["inputs"]["filename_prefix"] == "cf_j1_out"
    assert len(sha) == 64
    # Defaults apply when a slot is not given; the template itself is never mutated.
    g2, sha2 = bind(reg, reg.get(*T2I), req())
    assert g2["7"]["inputs"]["text"] == "" and g2["9"]["inputs"]["steps"] == 20 and sha2 != sha
    assert reg.get(*T2I).graph["4"]["class_type"] == "LoraLoaderModelOnly"


def test_lora_slot_binds_name_and_scale():
    reg = load_registry()
    g, _ = bind(reg, reg.get(*T2I), req(lora_names=["cf_j1_lora0.safetensors"], lora_scale=0.8))
    assert g["4"]["inputs"] == {"model": ["1", 0], "lora_name": "cf_j1_lora0.safetensors", "strength_model": 0.8}
    assert g["5"]["inputs"]["model"] == ["4", 0]


@pytest.mark.parametrize("n", [1, 2, 3])
def test_reference_binding_keeps_exactly_the_given_images(n):
    reg = load_registry()
    names = [f"cf_j1_ref{i}.png" for i in range(n)]
    g, _ = bind(reg, reg.get(*REF), req(image_names=names))
    loads = sorted(k for k, v in g.items() if v["class_type"] == "LoadImage")
    assert [g[k]["inputs"]["image"] for k in loads] == names
    for enc in ("12", "13"):
        assert sorted(k for k in g[enc]["inputs"] if k.startswith("image")) == [f"image{i + 1}" for i in range(n)]
    assert g["12"]["inputs"]["prompt"] == "a lighthouse at dusk"


def test_slot_values_are_validated():
    reg = load_registry()
    t2i, ref = reg.get(*T2I), reg.get(*REF)
    bad = [
        (t2i, req(width=1000)),  # not a multiple of 16
        (t2i, req(width=4096, height=4096)),
        (t2i, req(width=2048, height=2048)),  # over 2.1 MP
        (t2i, req(prompt=" ")),
        (t2i, req(seed=-1)),
        (t2i, req(steps=500)),
        (t2i, req(image_names=["a.png"])),  # t2i takes no references
        (ref, req()),  # the reference workflow needs one
        (ref, req(image_names=[f"r{i}.png" for i in range(4)])),
        (t2i, req(lora_names=["a.safetensors", "b.safetensors"])),
        (t2i, req(lora_names=["../../etc/passwd"])),
    ]
    for wf, r in bad:
        with pytest.raises(SlotError):
            bind(reg, wf, r)


def test_fit_size_keeps_aspect_within_limits():
    assert fit_size(1920, 1080) == (1920, 1072)
    assert fit_size(1280, 720) == (1280, 720)
    w, h = fit_size(3840, 2160)
    assert w * h <= 2_100_000 and w % 16 == 0 and h % 16 == 0 and abs(w / h - 16 / 9) < 0.03
