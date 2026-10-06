"""Canonical authorization digest + weights manifest."""

from __future__ import annotations

import os

from app.gateway import ModelSpec, authz_digest, resolve_weights_digest
from app.gateway.authz import TimingRequest, authz_document, canonical_json


GOLDEN = "07d602c7d909cf6fdfa2ca4c84469320aee4d651d4e81ab0b752d957e8754084"


def _digest(**over):
    kw = dict(
        workflow="diffusers.wan-2.1.t2v@1",
        runtime="diffusers@0.33.1",
        models=[{"role": "t2v", "id": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers", "revision": "a" * 40, "weights": "f" * 64}],
        loras=["projects/p1/identities/c1/v1/lora.safetensors"],
        timing=TimingRequest(duration_us=5_000_000, fps=16, width=832, height=480),
    )
    kw.update(over)
    return authz_digest(**kw)


def test_golden_vector_v1():
    # Locks the canonical form. The TypeScript minter (docs/39 PR 2/4) must
    # reproduce this exact string and digest; change only with a version bump.
    doc = authz_document(
        workflow="diffusers.wan-2.1.t2v@1",
        runtime="diffusers@0.33.1",
        models=[{"role": "t2v", "id": "Wan-AI/Wan2.1-T2V-1.3B-Diffusers", "revision": "a" * 40, "weights": "f" * 64}],
        loras=["projects/p1/identities/c1/v1/lora.safetensors"],
        timing=TimingRequest(duration_us=5_000_000, fps=16, width=832, height=480),
    )
    assert canonical_json(doc) == (
        '{"loras":["projects/p1/identities/c1/v1/lora.safetensors"],'
        '"models":[{"id":"Wan-AI/Wan2.1-T2V-1.3B-Diffusers","revision":"' + "a" * 40 + '",'
        '"role":"t2v","weights":"' + "f" * 64 + '"}],'
        '"runtime":"diffusers@0.33.1",'
        '"timing":{"durationUs":5000000,"fps":16,"height":480,"width":832},'
        '"v":1,"workflow":"diffusers.wan-2.1.t2v@1"}'
    )
    assert _digest() == GOLDEN


def test_lora_order_does_not_matter():
    a = _digest(loras=["k1", "k2"])
    b = _digest(loras=["k2", "k1"])
    assert a == b


def test_every_component_changes_the_digest():
    base = _digest()
    assert _digest(workflow="diffusers.wan-2.1.i2v@1") != base
    assert _digest(runtime="diffusers@0.34.0") != base
    assert _digest(loras=[]) != base
    assert _digest(timing=TimingRequest(duration_us=5_000_001, fps=16, width=832, height=480)) != base


def _fake_cache(tmp_path, repo, rev, files):
    root = tmp_path / ("models--" + repo.replace("/", "--"))
    snap, blobs = root / "snapshots" / rev, root / "blobs"
    blobs.mkdir(parents=True)
    for rel, blob in files.items():
        (blobs / blob).write_bytes(b"x")
        p = snap / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        os.symlink(os.path.relpath(blobs / blob, p.parent), p)
    return str(tmp_path)


def test_weights_digest_from_local_cache_matches_hub_metadata(tmp_path):
    rev = "a" * 40
    files = {"model_index.json": "1" * 40, "transformer/diffusion_pytorch_model.safetensors": "2" * 64}
    cache = _fake_cache(tmp_path, "Org/Model", rev, files)
    spec = ModelSpec("t2v", "Org/Model", rev)
    local = resolve_weights_digest(spec, cache_dir=cache, hub_lookup=lambda s: None)
    hub = resolve_weights_digest(spec, cache_dir=str(tmp_path / "empty"), hub_lookup=lambda s: list(files.items()))
    assert local and local == hub


def test_weights_digest_changes_when_a_blob_changes(tmp_path):
    rev = "a" * 40
    a = _fake_cache(tmp_path / "a", "Org/Model", rev, {"w.safetensors": "2" * 64})
    b = _fake_cache(tmp_path / "b", "Org/Model", rev, {"w.safetensors": "3" * 64})
    spec = ModelSpec("t2v", "Org/Model", rev)
    none = lambda s: None  # noqa: E731
    assert resolve_weights_digest(spec, cache_dir=a, hub_lookup=none) != resolve_weights_digest(
        spec, cache_dir=b, hub_lookup=none
    )


def test_unpinned_model_has_no_digest(tmp_path):
    assert resolve_weights_digest(ModelSpec("t2v", "Org/Model", "main"), cache_dir=str(tmp_path)) is None
    assert resolve_weights_digest(ModelSpec("t2v", "Org/Model", None), cache_dir=str(tmp_path)) is None
