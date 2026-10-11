"""Shared fixtures: Ed25519 keys, a token minter that mirrors Cineforge's, fake
media I/O and runtimes, so tests never touch a GPU, ComfyUI, weights or storage."""
from __future__ import annotations

import base64
import hashlib
import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from app.gateway import GatewayConfig
from app.gateway.config import parse_public_keys
from app.registry import load_registry
from app.runtime import PlaceholderRuntime
from app.server import create_app

DEPLOYMENT = "dep-comfy-test-1"
REV = "c" * 40
PINS = {"QWEN_IMAGE_COMFY_REVISION": REV, "QWEN_IMAGE_EDIT_COMFY_REVISION": "d" * 40}


def raw_pub_b64(priv: Ed25519PrivateKey) -> str:
    raw = priv.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@pytest.fixture(autouse=True)
def _no_storage_credentials(monkeypatch):
    from app.media_io import STORAGE_CREDENTIAL_ENV

    for k in STORAGE_CREDENTIAL_ENV:
        monkeypatch.delenv(k, raising=False)


@pytest.fixture(scope="session")
def signing_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.generate()


def make_config(signing_key, *, mode="enforce", deployment=DEPLOYMENT) -> GatewayConfig:
    return GatewayConfig(mode=mode, deployment_id=deployment, public_keys=parse_public_keys(f"k1:{raw_pub_b64(signing_key)}"))


class Minter:
    def __init__(self, key: Ed25519PrivateKey, kid: str = "k1") -> None:
        self.key, self.kid = key, kid

    def token(self, body: bytes = b"", *, scope="image:run", sub="grant-1", aud=DEPLOYMENT, authz=None,
              iat=None, ttl=120, jti=None, iss="cineforge-worker") -> str:
        iat = int(time.time()) if iat is None else iat
        claims = {"iss": iss, "aud": aud, "sub": sub, "scope": scope, "jti": jti or uuid.uuid4().hex,
                  "iat": iat, "exp": iat + ttl, "bh": hashlib.sha256(body).hexdigest()}
        if authz is not None:
            claims["authz"] = authz
        return jwt.encode(claims, self.key, algorithm="EdDSA", headers={"kid": self.kid})


@pytest.fixture()
def mint(signing_key) -> Minter:
    return Minter(signing_key)


class FakeRealRuntime(PlaceholderRuntime):
    """Behaves like a loaded real ComfyUI runtime (weights resolved), without ComfyUI."""

    def __init__(self, registry, env=None, *, weights=True) -> None:
        super().__init__(registry, {**PINS, **(env or {})})
        self._with_weights = weights
        self.graphs: list[dict] = []
        self.staged: list[tuple[list[str], list[str]]] = []
        self.cleaned: list[str] = []

    def load(self) -> None:
        self._loaded = True
        self._real = True
        self._weights = {k: (hashlib.sha256(k.encode()).hexdigest() if self._with_weights else None) for k in self.pins}

    def stage(self, job_id, refs, loras):
        self.staged.append((refs, loras))
        return super().stage(job_id, refs, loras)

    def execute(self, graph, job_id, **kw):
        self.graphs.append(graph)
        return super().execute(graph, job_id, **kw)

    def cleanup(self, job_id):
        self.cleaned.append(job_id)


class FakeStore:
    def __init__(self) -> None:
        self.puts: list[tuple[str, str, bytes]] = []
        self.inputs: dict[str, bytes] = {}

    def put(self, url: str, local: str, content_type: str) -> int:
        with open(local, "rb") as f:
            data = f.read()
        self.puts.append((url, content_type, data))
        return len(data)

    def fetch(self, url: str, suffix: str = "") -> str:
        import tempfile

        fd, path = tempfile.mkstemp(suffix=suffix)
        with open(fd, "wb") as f:
            f.write(self.inputs.get(url, b"\x89PNG\r\n\x1a\nref"))
        return path


def build_client(signing_key, *, mode="enforce", runtime=None, registry=None, store=None):
    registry = registry or load_registry()
    runtime = runtime or PlaceholderRuntime(registry, PINS)
    store = store or FakeStore()
    app = create_app(config=make_config(signing_key, mode=mode), registry=registry, runtime=runtime,
                     fetch=store.fetch, put=store.put, load_in_background=False)
    app.state.fake_store = store
    return TestClient(app), runtime, app
