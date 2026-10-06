"""A token minted by Cineforge's TypeScript authority (packages/model-adapters/
src/gateway/crosslang.test.ts) must verify here, with every binding intact."""

from __future__ import annotations

import json
import pathlib

from app.gateway import Enforcer, GatewayConfig, RequestBinding
from app.gateway.config import parse_public_keys

FX = json.loads((pathlib.Path(__file__).parent / "fixtures" / "crosslang.json").read_text())


def _enforcer(clock_offset=0):
    cfg = GatewayConfig(mode="enforce", deployment_id=FX["deploymentId"], public_keys=parse_public_keys(FX["publicKey"]))
    return Enforcer(cfg, clock=lambda: FX["now"] + clock_offset)


def _check(e, body=None, **binding):
    b = RequestBinding(scope="video:run", job_id="g_fixture", authz=FX["authz"])
    for k, v in binding.items():
        setattr(b, k, v)
    return e.check(authorization=f"Bearer {FX['token']}", body=(body or FX["body"]).encode(), binding=b, path="/generate")


def test_typescript_token_verifies_in_python():
    d = _check(_enforcer())
    assert d.allowed and d.code is None
    assert d.claims["aud"] == "dep-fixture" and d.claims["sub"] == "g_fixture"


def test_typescript_token_bindings_hold():
    assert _check(_enforcer(), body=FX["body"].replace("dusk", "dawn")).code == "BODY_MISMATCH"
    assert _check(_enforcer(), job_id="g_other").code == "JOB_MISMATCH"
    assert _check(_enforcer(), authz="0" * 64).code == "AUTHZ_MISMATCH"
    assert _check(_enforcer(clock_offset=10_000)).code == "TOKEN_EXPIRED"
