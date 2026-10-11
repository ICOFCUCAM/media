"""The voice authz digest and a token minted by CineForge's TypeScript authority
(packages/model-adapters/src/gateway/voice.test.ts) must agree here, byte for byte."""

from __future__ import annotations

import json
import pathlib

from app.gateway import Enforcer, GatewayConfig, RequestBinding
from app.gateway.config import parse_public_keys
from app.voice_authz import voice_authz_digest, voice_authz_document

FX = json.loads((pathlib.Path(__file__).parent / "fixtures" / "voice_crosslang.json").read_text())


def test_voice_authz_digest_matches_typescript():
    assert voice_authz_digest(engine="qwen3-tts", operation="enroll", runtime=FX["runtime"], models=FX["models"],
                              inputs=FX["inputs"]) == FX["authz"]


def test_document_shape_is_sorted_and_deduplicated():
    doc = voice_authz_document(engine="e", operation="speak", runtime="r",
                               models=[{"role": "b", "id": "x", "revision": "1", "weights": "w"},
                                       {"role": "a", "id": "y", "revision": "2", "weights": "v"}],
                               inputs=[{"key": "z", "sha256": "1"}, {"key": "a", "sha256": "2"}, {"key": "z", "sha256": "3"}])
    assert doc["workflow"] == "voice.e.speak@1" and doc["kind"] == "voice"
    assert [m["role"] for m in doc["models"]] == ["a", "b"]
    assert doc["inputs"] == [{"key": "a", "sha256": "2"}, {"key": "z", "sha256": "3"}]


def _check(body=None, clock_offset=0, **binding):
    cfg = GatewayConfig(mode="enforce", deployment_id=FX["deploymentId"], public_keys=parse_public_keys(FX["publicKey"]))
    e = Enforcer(cfg, clock=lambda: FX["now"] + clock_offset)
    b = RequestBinding(scope="voice:enroll", job_id="g_voice_fixture", authz=FX["authz"])
    for k, v in binding.items():
        setattr(b, k, v)
    return e.check(authorization=f"Bearer {FX['token']}", body=(body or FX["body"]).encode(), binding=b, path="/v1/voices/enroll")


def test_typescript_voice_token_verifies_with_every_binding():
    d = _check()
    assert d.allowed and d.code is None and d.claims["scope"] == "voice:enroll"
    assert _check(body=FX["body"].replace("v1", "v2")).code == "BODY_MISMATCH"
    assert _check(scope="voice:run").code == "WRONG_SCOPE"
    assert _check(authz="0" * 64).code == "AUTHZ_MISMATCH"
    assert _check(clock_offset=10_000).code == "TOKEN_EXPIRED"
