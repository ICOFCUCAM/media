"""Unit tests for the gateway check sequence (docs/38 §AV.2)."""

from __future__ import annotations

import json
import logging
import time

import jwt
import pytest

from app.gateway import Enforcer, RequestBinding
from app.gateway.config import GatewayConfig, GatewayConfigError, parse_public_keys

from .conftest import DEPLOYMENT, Minter, make_config, raw_pub_b64

BODY = b'{"jobId":"grant-1","prompt":"x"}'


def run(enforcer, token, *, body=BODY, binding=None):
    binding = binding or RequestBinding(scope="video:run", job_id="grant-1", authz="d" * 64)
    auth = None if token is None else f"Bearer {token}"
    return enforcer.check(authorization=auth, body=body, binding=binding, path="/generate")


@pytest.fixture()
def enforcer(signing_key):
    return Enforcer(make_config(signing_key))


def test_valid_token_is_allowed(enforcer, mint):
    d = run(enforcer, mint.token(BODY, authz="d" * 64))
    assert d.allowed and d.code is None


@pytest.mark.parametrize(
    "case, expected",
    [
        ("missing", "MISSING_TOKEN"),
        ("garbage", "BAD_TOKEN"),
        ("not_bearer", "MISSING_TOKEN"),
    ],
)
def test_malformed_credentials_rejected(enforcer, case, expected):
    if case == "missing":
        d = enforcer.check(authorization=None, body=BODY, binding=RequestBinding(scope="video:run"), path="/g")
    elif case == "garbage":
        d = run(enforcer, "not.a.jwt")
    else:
        d = enforcer.check(authorization="Basic abc", body=BODY, binding=RequestBinding(scope="video:run"), path="/g")
    assert not d.allowed and d.code == expected


def test_hs256_key_confusion_rejected(enforcer, signing_key):
    # A token "signed" with HS256 using the public key bytes as secret must fail.
    tok = jwt.encode({"sub": "grant-1"}, raw_pub_b64(signing_key), algorithm="HS256", headers={"kid": "k1"})
    assert run(enforcer, tok).code == "BAD_TOKEN"


def test_alg_none_rejected(enforcer):
    tok = jwt.encode({"sub": "grant-1"}, None, algorithm="none", headers={"kid": "k1"})
    assert run(enforcer, tok).code == "BAD_TOKEN"


def test_unknown_kid_rejected(enforcer, signing_key):
    assert run(enforcer, Minter(signing_key, kid="k9").token(BODY)).code == "UNKNOWN_KEY"


def test_wrong_signing_key_rejected(enforcer, other_key):
    # Same kid, different private key → signature fails.
    assert run(enforcer, Minter(other_key, kid="k1").token(BODY, authz="d" * 64)).code == "BAD_SIGNATURE"


def test_expired_token_rejected(enforcer, mint):
    old = int(time.time()) - 1000
    assert run(enforcer, mint.token(BODY, iat=old, ttl=120, authz="d" * 64)).code == "TOKEN_EXPIRED"


def test_token_from_the_future_rejected(enforcer, mint):
    future = int(time.time()) + 600
    assert run(enforcer, mint.token(BODY, iat=future, authz="d" * 64)).code == "TOKEN_NOT_YET_VALID"


def test_lifetime_over_300s_rejected(enforcer, mint):
    assert run(enforcer, mint.token(BODY, ttl=301, authz="d" * 64)).code == "TOKEN_LIFETIME"


def test_missing_required_claim_rejected(enforcer, mint):
    assert run(enforcer, mint.token(BODY, drop=("bh",), authz="d" * 64)).code == "BAD_TOKEN"


def test_wrong_issuer_rejected(enforcer, mint):
    assert run(enforcer, mint.token(BODY, iss="someone-else", authz="d" * 64)).code == "BAD_ISSUER"


def test_replayed_token_rejected(enforcer, mint):
    tok = mint.token(BODY, authz="d" * 64)
    assert run(enforcer, tok).allowed
    assert run(enforcer, tok).code == "REPLAYED"


def test_token_for_another_deployment_rejected(enforcer, mint):
    assert run(enforcer, mint.token(BODY, aud="dep-other", authz="d" * 64)).code == "WRONG_DEPLOYMENT"


def test_wrong_scope_rejected(enforcer, mint):
    assert run(enforcer, mint.token(BODY, scope="status", authz="d" * 64)).code == "WRONG_SCOPE"


def test_job_mismatch_rejected(enforcer, mint):
    assert run(enforcer, mint.token(BODY, sub="grant-2", authz="d" * 64)).code == "JOB_MISMATCH"


def test_body_altered_after_signing_rejected(enforcer, mint):
    tok = mint.token(BODY, authz="d" * 64)
    assert run(enforcer, tok, body=BODY.replace(b"x", b"y")).code == "BODY_MISMATCH"


def test_authz_mismatch_rejected(enforcer, mint):
    assert run(enforcer, mint.token(BODY, authz="e" * 64)).code == "AUTHZ_MISMATCH"


def test_authz_missing_rejected(enforcer, mint):
    assert run(enforcer, mint.token(BODY)).code == "AUTHZ_MISMATCH"


def test_request_checks_run_last(enforcer, mint):
    b = RequestBinding(scope="video:run", job_id="grant-1", authz="d" * 64, checks=[("TIMING_MISSING", False)])
    assert run(enforcer, mint.token(BODY, authz="d" * 64), binding=b).code == "TIMING_MISSING"


def test_body_too_large_rejected(signing_key, mint):
    e = Enforcer(make_config(signing_key))
    big = b"x" * (e.config.max_body_bytes + 1)
    assert run(e, mint.token(big), body=big).code == "BODY_TOO_LARGE"


def test_key_rotation_accepts_both_keys(signing_key, other_key):
    e = Enforcer(make_config(signing_key, extra_keys=f"k2:{raw_pub_b64(other_key)}"))
    assert run(e, Minter(signing_key, "k1").token(BODY, authz="d" * 64)).allowed
    assert run(e, Minter(other_key, "k2").token(BODY, authz="d" * 64)).allowed


def test_report_mode_allows_but_logs(signing_key, caplog):
    e = Enforcer(make_config(signing_key, mode="report"))
    with caplog.at_level(logging.WARNING, logger="cineforge.gateway"):
        d = run(e, None)
    assert d.allowed and d.code == "MISSING_TOKEN"
    rec = json.loads(caplog.records[-1].getMessage())
    assert rec["decision"] == "would_reject" and rec["code"] == "MISSING_TOKEN"


def test_log_line_never_contains_token_or_body(enforcer, mint, caplog):
    tok = mint.token(BODY, authz="d" * 64)
    with caplog.at_level(logging.INFO, logger="cineforge.gateway"):
        run(enforcer, tok)
    text = " ".join(r.getMessage() for r in caplog.records)
    assert tok not in text and "prompt" not in text


def test_unknown_mode_is_a_config_error():
    with pytest.raises(GatewayConfigError):
        GatewayConfig.from_env({"GATEWAY_MODE": "off"})


def test_enforce_mode_rejects_malformed_keys():
    with pytest.raises(GatewayConfigError):
        GatewayConfig.from_env({"GATEWAY_MODE": "enforce", "GPU_JWT_PUBLIC_KEYS": "k1:notakey"})


def test_default_mode_is_report():
    assert GatewayConfig.from_env({}).mode == "report"


def test_parse_public_keys_requires_kid(signing_key):
    with pytest.raises(GatewayConfigError):
        parse_public_keys(raw_pub_b64(signing_key))
