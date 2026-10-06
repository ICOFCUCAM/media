"""Gateway configuration, read once from the environment."""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass, field

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

MODES = ("report", "enforce")


class GatewayConfigError(RuntimeError):
    """Raised at startup when enforce mode is misconfigured (fail closed)."""


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def parse_public_keys(spec: str) -> dict[str, Ed25519PublicKey]:
    """Parse `kid:base64url(raw 32-byte Ed25519 public key)[,kid:key…]`.

    Two entries allow rotation by overlap (docs/38 §O). GPU workers hold only
    public keys: nothing on the GPU host can mint a token.
    """
    keys: dict[str, Ed25519PublicKey] = {}
    for part in (p.strip() for p in spec.split(",")):
        if not part:
            continue
        kid, sep, raw = part.partition(":")
        if not sep or not kid or not raw:
            raise GatewayConfigError(f"GPU_JWT_PUBLIC_KEYS entry is not kid:key ({kid or '?'})")
        try:
            pub = _b64url_decode(raw.strip())
            keys[kid.strip()] = Ed25519PublicKey.from_public_bytes(pub)
        except Exception as e:  # noqa: BLE001
            raise GatewayConfigError(f"GPU_JWT_PUBLIC_KEYS key {kid!r} is not a raw Ed25519 public key") from e
    return keys


@dataclass(frozen=True)
class GatewayConfig:
    mode: str = "report"
    deployment_id: str = ""
    public_keys: dict[str, Ed25519PublicKey] = field(default_factory=dict)
    issuer: str = "cineforge-worker"
    max_token_lifetime_sec: int = 300
    clock_skew_sec: int = 30
    max_body_bytes: int = 64 * 1024

    @property
    def enforcing(self) -> bool:
        return self.mode == "enforce"

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "GatewayConfig":
        env = dict(os.environ if env is None else env)
        mode = env.get("GATEWAY_MODE", "report").strip().lower()
        if mode not in MODES:
            # An unknown mode must never silently mean "no checks".
            raise GatewayConfigError(f"GATEWAY_MODE must be one of {MODES}, got {mode!r}")
        try:
            keys = parse_public_keys(env.get("GPU_JWT_PUBLIC_KEYS", ""))
        except GatewayConfigError:
            if mode == "enforce":
                raise
            keys = {}
        return cls(
            mode=mode,
            deployment_id=env.get("DEPLOYMENT_ID", "").strip(),
            public_keys=keys,
            issuer=env.get("GATEWAY_ISSUER", "cineforge-worker"),
            max_body_bytes=int(env.get("GATEWAY_MAX_BODY_BYTES", str(64 * 1024))),
        )

    def problems(self) -> list[str]:
        """Configuration gaps. Fatal in enforce mode, logged in report mode."""
        out = []
        if not self.deployment_id:
            out.append("DEPLOYMENT_ID is not set")
        if not self.public_keys:
            out.append("GPU_JWT_PUBLIC_KEYS has no valid key")
        return out
