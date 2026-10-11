"""Shared fixtures: Ed25519 keys, a token minter that mirrors CineForge's, an
in-memory object store behind the one-time URLs, and engines in explicit
placeholder mode — tests never touch a GPU, model weights or real storage."""

from __future__ import annotations

import base64
import hashlib
import os
import shutil
import tempfile
import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from app.engines import build_backend
from app.engines.base import VoiceBackend
from app.engines.qwen3 import INFO as QWEN_INFO
from app.gateway import GatewayConfig
from app.gateway.config import parse_public_keys
from app.server import create_app

DEPLOYMENT = "dep-voice-test-1"
REV = "a" * 40


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

    def token(self, body: bytes = b"", *, scope="voice:run", sub="grant-1", aud=DEPLOYMENT, authz=None, ttl=120,
              jti=None, iss="cineforge-worker") -> str:
        iat = int(time.time())
        claims = {"iss": iss, "aud": aud, "sub": sub, "scope": scope, "jti": jti or uuid.uuid4().hex,
                  "iat": iat, "exp": iat + ttl, "bh": hashlib.sha256(body).hexdigest()}
        if authz is not None:
            claims["authz"] = authz
        return jwt.encode(claims, self.key, algorithm="EdDSA", headers={"kid": self.kid})


@pytest.fixture()
def mint(signing_key) -> Minter:
    return Minter(signing_key)


class Store:
    """Objects behind presigned URLs: GET https://store/get/<key>, PUT https://store/put/<key>."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.puts: list[tuple[str, str]] = []
        self.gets: list[str] = []

    def get_url(self, key: str) -> str:
        return f"https://store/get/{key}"

    def put_url(self, key: str) -> str:
        return f"https://store/put/{key}"

    def fetch(self, url: str, suffix: str = "") -> str:
        key = url.split("/get/", 1)[1]
        self.gets.append(key)
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(self.objects[key])
        return path

    def put(self, url: str, local: str, content_type: str) -> int:
        key = url.split("/put/", 1)[1]
        with open(local, "rb") as f:
            self.objects[key] = f.read()
        self.puts.append((key, content_type))
        return len(self.objects[key])


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fake_weights(spec) -> str:
    return hashlib.sha256(f"{spec.repo_id}@{spec.revision}".encode()).hexdigest()


def placeholder_backend(engine="qwen3-tts", **env):
    return build_backend({"VOICE_ENGINE": engine, "CINEFORGE_PLACEHOLDER": "1", "VOICE_MODEL_REVISION": REV, **env})


class FakeRealBackend(VoiceBackend):
    """Behaves like a loaded real engine (no torch): for identity/authz paths only."""

    info = QWEN_INFO
    runtime_package = "qwen-tts"

    def __init__(self, env=None, revision=REV) -> None:
        super().__init__({"VOICE_MODEL_REVISION": revision or "", **(env or {})})
        self.revision = revision

    def load(self) -> None:
        self._loaded = True
        self._real = True

    def _runtime_version(self) -> str:
        return "qwen-tts@0.1.1"

    def _enroll_real(self, reference_path, reference_text, language, out_path) -> dict:
        with open(out_path, "wb") as f:
            f.write(b"real-artifact")
        return {"mode": "icl" if reference_text else "x_vector_only", "transcriptUsed": bool(reference_text)}

    def _prepare_real(self, artifact_path, artifact_sha256, metadata):
        return {"path": artifact_path}

    def _synthesize_real(self, voice, texts, language, style, out_paths) -> None:
        from app.wavio import write_tone

        for t, p in zip(texts, out_paths):
            write_tone(p, 0.5, rate=24000)

    def _embed_real(self, wav_path):
        return [1.0, 0.0]


def build_client(signing_key, *, mode="enforce", backend=None, store=None, deployment=DEPLOYMENT, resolve=fake_weights):
    backend = backend or placeholder_backend()
    store = store or Store()
    app = create_app(config=make_config(signing_key, mode=mode, deployment=deployment), backend=backend,
                     fetch=store.fetch, put=store.put, resolve_weights=resolve)
    client = TestClient(app)
    client.__enter__()  # run startup
    return client, backend, store, app


needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
