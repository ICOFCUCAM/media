"""Model files: download by pinned repository + revision, link into ComfyUI,
and identify each by a weights digest (docs/38 §AV.3; docs/39 F6).

Each registry model is ONE file of a Hugging Face repository at a pinned
40-hex commit (`<revisionEnv>`). It is downloaded at startup into the Hugging
Face cache (mount a volume there so restarts do not download again), then
symlinked into ComfyUI's models folder under the name the workflow graph uses.

The weights digest uses the same rule as the video worker
(app/gateway/manifest.py: sha256 over `path<TAB>blob-id` lines), restricted to
the file actually loaded. The blob id is the LFS sha256 the cache already names
the file by. A cache without symlinks is hashed with a `sha256:` prefix, so it
never matches an approved digest by accident.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Callable

from .gateway.manifest import ModelSpec, digest_entries, hub_cache_dir
from .registry import ModelDecl


@dataclass(frozen=True)
class PinnedModel:
    decl: ModelDecl
    revision: str | None

    @property
    def spec(self) -> ModelSpec:
        return ModelSpec(self.decl.key, self.decl.repo, self.revision)

    @property
    def pinned(self) -> bool:
        return self.spec.pinned


def pinned_models(models: dict[str, ModelDecl], env: dict[str, str] | None = None) -> dict[str, PinnedModel]:
    env = dict(os.environ if env is None else env)
    return {k: PinnedModel(m, (env.get(m.revision_env) or "").strip() or None) for k, m in models.items()}


def snapshot_path(pm: PinnedModel, cache_dir: str | None = None) -> str:
    root = cache_dir or hub_cache_dir()
    return os.path.join(root, "models--" + pm.decl.repo.replace("/", "--"), "snapshots", pm.revision or "", pm.decl.file)


def file_digest(pm: PinnedModel, cache_dir: str | None = None) -> str | None:
    """Weights digest of the one cached file, or None when it is not there."""
    if not pm.pinned:
        return None
    path = snapshot_path(pm, cache_dir)
    if not os.path.exists(path):
        return None
    if os.path.islink(path):
        blob = os.path.basename(os.readlink(path))
    else:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        blob = "sha256:" + h.hexdigest()
    return digest_entries([(pm.decl.file, blob)])


def hf_download(pm: PinnedModel) -> str:
    """Download one file at the pinned revision (never a branch)."""
    if not pm.pinned:
        raise RuntimeError(f"{pm.decl.revision_env} is not a 40-hex commit")
    from huggingface_hub import hf_hub_download  # noqa: PLC0415

    return hf_hub_download(repo_id=pm.decl.repo, filename=pm.decl.file, revision=pm.revision)


def link_into(models_dir: str, pm: PinnedModel, source: str) -> str:
    folder = os.path.join(models_dir, pm.decl.folder)
    os.makedirs(folder, exist_ok=True)
    dest = os.path.join(folder, pm.decl.name)
    if os.path.lexists(dest):
        os.unlink(dest)
    os.symlink(source, dest)
    return dest


def fetch_all(pins: dict[str, PinnedModel], models_dir: str, download: Callable[[PinnedModel], str] = hf_download) -> None:
    for pm in pins.values():
        link_into(models_dir, pm, download(pm))
