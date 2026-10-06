"""
Media Runtime Gateway — GPU-side enforcer (docs/38 §O, §AV.2, §AV.3; docs/39).

Every GPU request except `GET /livez` must carry a short-lived Ed25519-signed
execution token minted by Cineforge. The checks here are framework-independent
so the same core can later run as the reverse-proxy sidecar in front of a
ComfyUI worker (docs/38 §AT.10) — only the deployment form changes.
"""

from .authz import AUTHZ_VERSION, authz_digest
from .config import GatewayConfig, GatewayConfigError
from .enforcer import Decision, Enforcer, RequestBinding
from .manifest import ModelSpec, resolve_weights_digest

__all__ = [
    "AUTHZ_VERSION",
    "Decision",
    "Enforcer",
    "GatewayConfig",
    "GatewayConfigError",
    "ModelSpec",
    "RequestBinding",
    "authz_digest",
    "resolve_weights_digest",
]
