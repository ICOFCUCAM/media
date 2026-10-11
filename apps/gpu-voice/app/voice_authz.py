"""Voice workflow + model authorization digest (docs/74 §Security; docs/38 §AV.3).

The voice counterpart of the video `authz` claim. CineForge computes it from
the deployment's APPROVED manifest when it authorizes a voice call and signs it
into the execution token; this service recomputes it from its own resolved
models and the request. Any difference — another engine, checkpoint, revision,
weights, operation, or a different input object (reference recording, stored
voice artifact) — is AUTHZ_MISMATCH.

Inputs are bound by storage key AND content hash, like LoRAs in video authz
v2: the bytes this service downloads are hashed and must equal the hash
CineForge authorized before they reach the model.

Canonical form (voice v1), identical in TypeScript
(packages/model-adapters/src/gateway/voice-authz.ts) and here: the same
canonical JSON as video authz (sorted keys, no whitespace, ASCII only),
sha256, lowercase hex. Locked by tests/fixtures/voice_crosslang.json.
"""

from __future__ import annotations

import hashlib

from .gateway.authz import canonical_json

VOICE_AUTHZ_VERSION = 1
OPERATIONS = ("enroll", "speak", "score")


def voice_authz_document(*, engine: str, operation: str, runtime: str, models: list[dict[str, str]],
                         inputs: list[dict[str, str]]) -> dict:
    if operation not in OPERATIONS:
        raise ValueError(f"unknown voice operation {operation!r}")
    return {
        "v": VOICE_AUTHZ_VERSION,
        "kind": "voice",
        "workflow": f"voice.{engine}.{operation}@1",
        "runtime": runtime,
        "models": sorted(
            ({"role": m["role"], "id": m["id"], "revision": m["revision"], "weights": m["weights"]} for m in models),
            key=lambda m: m["role"],
        ),
        # One entry per key (a duplicate keeps its last hash), sorted by key.
        "inputs": [{"key": k, "sha256": h} for k, h in sorted({i["key"]: i["sha256"] for i in inputs}.items())],
    }


def voice_authz_digest(**kwargs) -> str:
    return hashlib.sha256(canonical_json(voice_authz_document(**kwargs)).encode("ascii")).hexdigest()
