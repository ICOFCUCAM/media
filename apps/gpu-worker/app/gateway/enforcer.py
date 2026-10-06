"""The gateway's check sequence (docs/38 §AV.2), independent of any web framework.

Order: token present → header/key → signature → expiry/lifetime → replay →
deployment (`aud`) → action (`scope`) → job (`sub`) → body hash (`bh`) →
workflow + model authorization (`authz`) → request checks (timing, limits).
The first failing check decides the outcome.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field

import jwt

from .config import GatewayConfig
from .replay import ReplayCache

log = logging.getLogger("cineforge.gateway")

# Reason codes → HTTP status. Codes are part of the contract with Cineforge.
STATUS = {
    "BODY_TOO_LARGE": 413,
    "MISSING_TOKEN": 401,
    "BAD_TOKEN": 401,
    "UNKNOWN_KEY": 401,
    "BAD_SIGNATURE": 401,
    "TOKEN_EXPIRED": 401,
    "TOKEN_NOT_YET_VALID": 401,
    "TOKEN_LIFETIME": 401,
    "BAD_ISSUER": 401,
    "REPLAYED": 401,
    "WRONG_DEPLOYMENT": 403,
    "WRONG_SCOPE": 403,
    "JOB_MISMATCH": 403,
    "BODY_MISMATCH": 403,
    "AUTHZ_MISMATCH": 403,
    "MODEL_UNRESOLVED": 403,
    "TIMING_MISSING": 422,
}

_REQUIRED_CLAIMS = ("iss", "aud", "sub", "scope", "jti", "iat", "exp", "bh")


@dataclass
class RequestBinding:
    """What the token must be bound to for this particular request."""

    scope: str
    job_id: str | None = None  # required → token `sub` must equal it
    authz: str | None = None  # required → token `authz` must equal it
    authz_error: str | None = None  # set when the expected digest cannot be computed
    checks: list[tuple[str, bool]] = field(default_factory=list)  # (code, ok) evaluated last


@dataclass
class Decision:
    allowed: bool  # False only in enforce mode
    code: str | None  # None when every check passed
    claims: dict | None = None

    @property
    def status(self) -> int:
        return STATUS.get(self.code or "", 200)


def body_sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


class Enforcer:
    def __init__(self, config: GatewayConfig, *, clock=time.time) -> None:
        self.config = config
        self.replay = ReplayCache()
        self._clock = clock

    # ── public ──────────────────────────────────────────────────────────
    def check(self, *, authorization: str | None, body: bytes, binding: RequestBinding, path: str) -> Decision:
        code, claims = self._evaluate(authorization, body, binding)
        allowed = code is None or not self.config.enforcing
        self._log(path, binding, code, claims, allowed)
        return Decision(allowed=allowed, code=code, claims=claims)

    # ── checks ──────────────────────────────────────────────────────────
    def _evaluate(self, authorization: str | None, body: bytes, b: RequestBinding) -> tuple[str | None, dict | None]:
        cfg = self.config
        if len(body) > cfg.max_body_bytes:
            return "BODY_TOO_LARGE", None
        token = _bearer(authorization)
        if not token:
            return "MISSING_TOKEN", None

        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            return "BAD_TOKEN", None
        # Only EdDSA: rejects alg=none and HS256 key-confusion tokens outright.
        if header.get("alg") != "EdDSA":
            return "BAD_TOKEN", None
        key = cfg.public_keys.get(str(header.get("kid", "")))
        if key is None:
            return "UNKNOWN_KEY", None

        try:
            claims = jwt.decode(
                token,
                key=key,
                algorithms=["EdDSA"],
                options={"verify_aud": False, "verify_iss": False, "verify_exp": False,
                         "verify_iat": False, "verify_nbf": False},
            )
        except jwt.InvalidSignatureError:
            return "BAD_SIGNATURE", None
        except jwt.PyJWTError:
            return "BAD_TOKEN", None

        if any(c not in claims for c in _REQUIRED_CLAIMS):
            return "BAD_TOKEN", claims
        try:
            iat, exp = int(claims["iat"]), int(claims["exp"])
        except (TypeError, ValueError):
            return "BAD_TOKEN", claims
        now = self._clock()
        if exp <= iat or exp - iat > cfg.max_token_lifetime_sec:
            return "TOKEN_LIFETIME", claims
        if now >= exp + cfg.clock_skew_sec:
            return "TOKEN_EXPIRED", claims
        if iat > now + cfg.clock_skew_sec or ("nbf" in claims and int(claims["nbf"]) > now + cfg.clock_skew_sec):
            return "TOKEN_NOT_YET_VALID", claims
        if claims["iss"] != cfg.issuer:
            return "BAD_ISSUER", claims
        if not self.replay.check_and_add(str(claims["jti"]), exp + cfg.clock_skew_sec):
            return "REPLAYED", claims

        if not cfg.deployment_id or claims["aud"] != cfg.deployment_id:
            return "WRONG_DEPLOYMENT", claims
        if b.scope not in str(claims["scope"]).split():
            return "WRONG_SCOPE", claims
        if b.job_id is not None and claims["sub"] != b.job_id:
            return "JOB_MISMATCH", claims
        if claims["bh"] != body_sha256(body):
            return "BODY_MISMATCH", claims
        if b.authz_error:
            return b.authz_error, claims
        if b.authz is not None and claims.get("authz") != b.authz:
            return "AUTHZ_MISMATCH", claims
        for check_code, ok in b.checks:
            if not ok:
                return check_code, claims
        return None, claims

    # ── audit log ───────────────────────────────────────────────────────
    def _log(self, path: str, b: RequestBinding, code: str | None, claims: dict | None, allowed: bool) -> None:
        if code is None:
            decision = "allow"
        else:
            decision = "reject" if not allowed else "would_reject"
        rec = {
            "event": "gateway.decision",
            "mode": self.config.mode,
            "deployment": self.config.deployment_id or None,
            "path": path,
            "scope": b.scope,
            "decision": decision,
            "code": code,
            "sub": (claims or {}).get("sub"),
            "jti": (claims or {}).get("jti"),
            "authz": (str((claims or {}).get("authz") or "")[:12] or None),
        }
        # Never log tokens, bodies, prompts or URLs (signed URLs are secrets).
        log.log(logging.WARNING if code else logging.INFO, json.dumps(rec, sort_keys=True))


def _bearer(value: str | None) -> str | None:
    if not value:
        return None
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()
