"""Model identity for authorization (docs/38 §AV.3; docs/39 F6).

A model is identified by (role, repository id, pinned commit revision, weights
digest). The weights digest is sha256 over the snapshot's sorted
`path<TAB>blob-id` lines, where the blob id is what the Hugging Face cache and
Hub both already use as content address: the LFS sha256 for large files, the
git blob id otherwise. It can therefore be computed from the local cache
(no rehashing of multi-GB weights) or, when a model is not downloaded yet,
from Hub metadata — and both give the same value.
"""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from typing import Callable, Iterable

_COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
PLACEHOLDER = "placeholder"


@dataclass(frozen=True)
class ModelSpec:
    role: str  # "t2v" | "i2v"
    repo_id: str
    revision: str | None  # must be a 40-hex commit in enforce mode

    @property
    def pinned(self) -> bool:
        return bool(self.revision and _COMMIT_RE.match(self.revision))


def hub_cache_dir(env: dict[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    if env.get("HF_HUB_CACHE"):
        return env["HF_HUB_CACHE"]
    home = env.get("HF_HOME") or os.path.join(os.path.expanduser("~"), ".cache", "huggingface")
    return os.path.join(home, "hub")


def digest_entries(entries: Iterable[tuple[str, str]]) -> str:
    h = hashlib.sha256()
    for path, blob in sorted(entries):
        h.update(f"{path}\t{blob}\n".encode("utf-8"))
    return h.hexdigest()


def local_snapshot_entries(spec: ModelSpec, cache_dir: str) -> list[tuple[str, str]] | None:
    """(relative path, blob id) for every file of a cached snapshot, or None."""
    if not spec.revision:
        return None
    root = os.path.join(cache_dir, "models--" + spec.repo_id.replace("/", "--"), "snapshots", spec.revision)
    if not os.path.isdir(root):
        return None
    out: list[tuple[str, str]] = []
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            if os.path.islink(full):
                blob = os.path.basename(os.readlink(full))
            else:
                # Cache without symlinks (e.g. copied volume): hash the content.
                # The prefix keeps this distinct from Hub blob ids, so such a
                # cache never matches an approved digest by accident (fails closed).
                h = hashlib.sha256()
                with open(full, "rb") as f:
                    for chunk in iter(lambda: f.read(1 << 20), b""):
                        h.update(chunk)
                blob = "sha256:" + h.hexdigest()
            out.append((rel, blob))
    return out or None


def hub_snapshot_entries(spec: ModelSpec) -> list[tuple[str, str]] | None:
    """Same entries from Hub metadata (no weight download)."""
    try:
        from huggingface_hub import HfApi  # noqa: PLC0415

        info = HfApi().model_info(spec.repo_id, revision=spec.revision, files_metadata=True)
    except Exception:  # noqa: BLE001
        return None
    out = []
    for s in info.siblings or []:
        lfs = getattr(s, "lfs", None)
        sha = getattr(lfs, "sha256", None) if lfs is not None else None
        blob = sha or getattr(s, "blob_id", None)
        if not blob:
            return None
        out.append((s.rfilename, blob))
    return out or None


def resolve_weights_digest(
    spec: ModelSpec,
    *,
    cache_dir: str | None = None,
    hub_lookup: Callable[[ModelSpec], list[tuple[str, str]] | None] = hub_snapshot_entries,
) -> str | None:
    """Weights digest for a pinned model, or None when it cannot be resolved."""
    if not spec.pinned:
        return None
    entries = local_snapshot_entries(spec, cache_dir or hub_cache_dir())
    if entries is None:
        entries = hub_lookup(spec)
    return digest_entries(entries) if entries else None
