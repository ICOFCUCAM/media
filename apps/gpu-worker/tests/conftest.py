"""Shared fixtures: Ed25519 keys, a token minter that mirrors Cineforge's, and a
fake pipeline so tests never touch a GPU, model weights or storage."""

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
from app.server import create_app

DEPLOYMENT = "dep-wan-test-1"


def raw_pub_b64(priv: Ed25519PrivateKey) -> str:
    raw = priv.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@pytest.fixture(autouse=True)
def _no_storage_credentials(monkeypatch):
    # Enforce mode refuses to start with storage credentials in the env.
    from app.media_io import STORAGE_CREDENTIAL_ENV

    for k in STORAGE_CREDENTIAL_ENV:
        monkeypatch.delenv(k, raising=False)


@pytest.fixture(scope="session")
def signing_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.generate()


@pytest.fixture(scope="session")
def other_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.generate()


def make_config(signing_key, *, mode="enforce", deployment=DEPLOYMENT, extra_keys="") -> GatewayConfig:
    spec = f"k1:{raw_pub_b64(signing_key)}" + (f",{extra_keys}" if extra_keys else "")
    return GatewayConfig(mode=mode, deployment_id=deployment, public_keys=parse_public_keys(spec))


class Minter:
    """Mints execution tokens the way Cineforge's Gateway Authority will."""

    def __init__(self, key: Ed25519PrivateKey, kid: str = "k1") -> None:
        self.key, self.kid = key, kid

    def token(self, body: bytes = b"", *, scope="video:run", sub="grant-1", aud=DEPLOYMENT,
              authz=None, iat=None, ttl=120, jti=None, iss="cineforge-worker", drop=(), **extra) -> str:
        iat = int(time.time()) if iat is None else iat
        claims = {
            "iss": iss, "aud": aud, "sub": sub, "scope": scope, "jti": jti or uuid.uuid4().hex,
            "iat": iat, "exp": iat + ttl, "bh": hashlib.sha256(body).hexdigest(), **extra,
        }
        if authz is not None:
            claims["authz"] = authz
        for k in drop:
            claims.pop(k, None)
        return jwt.encode(claims, self.key, algorithm="EdDSA", headers={"kid": self.kid})


@pytest.fixture()
def mint(signing_key) -> Minter:
    return Minter(signing_key)


class FakePipeline:
    def __init__(self, *, real=False, i2v=False, model_name="wan-2.1", revision="a" * 40) -> None:
        self.model_name = model_name
        self._real, self._i2v, self._rev = real, i2v, revision
        self.is_loaded = False
        self.calls: list[dict] = []

    @property
    def is_real(self) -> bool:
        return self._real

    def load(self) -> None:
        self.is_loaded = True

    def has_i2v(self) -> bool:
        return self._i2v

    def model_specs(self):
        specs = {"t2v": ("Wan-AI/Wan2.1-T2V-1.3B-Diffusers", self._rev)}
        if self._i2v:
            specs["i2v"] = ("Wan-AI/Wan2.1-I2V-14B-480P-Diffusers", "b" * 40)
        return specs

    def vram_free_mb(self) -> int:
        return 0

    def capabilities(self) -> dict:
        return {"model": self.model_name}

    def generate(self, **kw):
        self.calls.append(kw)
        return "/tmp/fake.mp4", None


def fake_weights(spec) -> str:
    return hashlib.sha256(f"{spec.repo_id}@{spec.revision}".encode()).hexdigest()


class FakeStore:
    """Records uploads made through one-time URLs (and legacy direct writes)."""

    def __init__(self) -> None:
        self.puts: list[tuple[str, str]] = []
        self.legacy: list[str] = []

    def put(self, url: str, local: str, content_type: str) -> int:
        self.puts.append((url, content_type))
        return 4321

    def legacy_upload(self, local, key, thumb):
        self.legacy.append(key)
        return None


def no_timing(path, **kw):
    from app.timing import TimingProbeError

    raise TimingProbeError("fake clip")


def build_client(signing_key, *, mode="enforce", pipeline=None, deployment=DEPLOYMENT, store=None, measure=no_timing):
    pipeline = pipeline or FakePipeline()
    store = store or FakeStore()
    app = create_app(
        config=make_config(signing_key, mode=mode, deployment=deployment),
        pipeline=pipeline,
        uploader=store.legacy_upload,
        put=store.put,
        resolve_weights=fake_weights,
        measure=measure,
    )
    app.state.fake_store = store
    return TestClient(app), pipeline, app
