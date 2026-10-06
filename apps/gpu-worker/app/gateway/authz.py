"""Workflow + model authorization digest (docs/38 §AV.3).

Cineforge computes this digest when it chooses the route and signs it into the
execution token (`authz` claim). The gateway recomputes it from the actual
request and the worker's own resolved models; any difference — another model,
weights revision, workflow, LoRA or timing request — is `AUTHZ_MISMATCH`.

Canonical form (version 1), identical in TypeScript and Python:
  JSON with sorted keys, no whitespace, ASCII only; integers only (durations
  are whole microseconds, matching the Master Production Clock, so no float
  formatting can differ between languages); sha256, lowercase hex.

Version 2 (current) binds every LoRA by storage key AND content hash
(`{"key", "sha256"}`): model → revision → artifact → content hash → approved
manifest → execution token. The worker additionally verifies the bytes it
downloads against that hash before loading them (docs/39 §9.1). Version 1
bound LoRAs by key only; this worker no longer computes it.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

AUTHZ_VERSION = 2


@dataclass(frozen=True)
class TimingRequest:
    duration_us: int
    fps: int
    width: int
    height: int


def canonical_json(doc: object) -> str:
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def authz_document(
    *,
    workflow: str,
    runtime: str,
    models: list[dict[str, str]],
    loras: list[dict[str, str]],
    timing: TimingRequest,
) -> dict:
    return {
        "v": AUTHZ_VERSION,
        "workflow": workflow,
        "runtime": runtime,
        "models": sorted(
            ({"role": m["role"], "id": m["id"], "revision": m["revision"], "weights": m["weights"]} for m in models),
            key=lambda m: m["role"],
        ),
        # One entry per key (a duplicate key keeps its last hash), sorted by key.
        "loras": [{"key": k, "sha256": h} for k, h in sorted({lo["key"]: lo["sha256"] for lo in loras}.items())],
        "timing": {
            "durationUs": int(timing.duration_us),
            "fps": int(timing.fps),
            "width": int(timing.width),
            "height": int(timing.height),
        },
    }


def authz_digest(**kwargs) -> str:
    return hashlib.sha256(canonical_json(authz_document(**kwargs)).encode("ascii")).hexdigest()
