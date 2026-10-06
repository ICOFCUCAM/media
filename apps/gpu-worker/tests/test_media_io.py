"""One-time media I/O against a real local HTTP server."""

from __future__ import annotations

import http.server
import os
import threading

import pytest

from app import media_io


class _Handler(http.server.BaseHTTPRequestHandler):
    store: dict[str, tuple[bytes, str]] = {}

    def do_GET(self):  # noqa: N802
        data = self.store.get(self.path, (None, ""))[0]
        if data is None:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_PUT(self):  # noqa: N802
        n = int(self.headers["Content-Length"])
        self.store[self.path] = (self.rfile.read(n), self.headers["Content-Type"])
        self.send_response(200)
        self.end_headers()

    def log_message(self, *a):
        pass


@pytest.fixture()
def server(monkeypatch):
    monkeypatch.setenv("GATEWAY_ALLOW_HTTP_STORAGE", "1")
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def test_put_then_fetch_roundtrip(server, tmp_path):
    src = tmp_path / "clip.mp4"
    src.write_bytes(b"\x00mp4" * 100)
    assert media_io.put_file(f"{server}/put/clip.mp4?sig=1", str(src), "video/mp4") == 400
    assert _Handler.store["/put/clip.mp4?sig=1"][1] == "video/mp4"
    _Handler.store["/get/frame.png"] = (b"png", "")
    path = media_io.fetch_to_temp(f"{server}/get/frame.png", suffix=".png")
    try:
        assert open(path, "rb").read() == b"png" and path.endswith(".png")
    finally:
        os.unlink(path)


def test_plain_http_rejected_without_test_flag(monkeypatch, tmp_path):
    monkeypatch.delenv("GATEWAY_ALLOW_HTTP_STORAGE", raising=False)
    with pytest.raises(media_io.MediaUrlError):
        media_io.fetch_to_temp("http://store.example/x")
    with pytest.raises(media_io.MediaUrlError):
        media_io.fetch_to_temp("file:///etc/passwd")


def test_storage_credentials_detection():
    assert media_io.storage_credentials_present({"S3_SECRET_KEY": "x", "OTHER": "y"}) == ["S3_SECRET_KEY"]
    assert media_io.storage_credentials_present({}) == []


# ── authz v2: the worker verifies LoRA bytes against the authorized hash ──────

def _pipeline(strict, expected):
    from app.pipeline import VideoPipeline

    p = VideoPipeline("wan-2.1")
    p._input_urls = {"projects/p1/identities/c1/v1/lora.safetensors": None}
    p._legacy_fallback = False
    p._lora_sha256 = expected
    p._strict_integrity = strict
    return p


def test_lora_bytes_must_match_the_authorized_hash(server):
    import hashlib

    from app.media_io import LoraIntegrityError

    key = "projects/p1/identities/c1/v1/lora.safetensors"
    _Handler.store["/lora"] = (b"real-adapter-weights", "")
    good = hashlib.sha256(b"real-adapter-weights").hexdigest()

    p = _pipeline(strict=True, expected={key: good})
    p._input_urls = {key: f"{server}/lora"}
    path = p._fetch_lora(key)
    assert open(path, "rb").read() == b"real-adapter-weights"
    os.unlink(path)

    # Same key, different bytes in storage (tampered / swapped artifact).
    _Handler.store["/lora"] = (b"swapped-weights", "")
    with pytest.raises(LoraIntegrityError) as e:
        p._fetch_lora(key)
    assert e.value.code == "LORA_HASH_MISMATCH"


def test_unhashed_lora_is_refused_when_strict_and_skipped_in_report(server):
    from app.media_io import LoraIntegrityError

    key = "projects/p1/identities/c1/v1/lora.safetensors"
    _Handler.store["/lora"] = (b"weights", "")
    strict = _pipeline(strict=True, expected={})
    strict._input_urls = {key: f"{server}/lora"}
    with pytest.raises(LoraIntegrityError) as e:
        strict._lora_or_skip(key)
    assert e.value.code == "LORA_UNHASHED"

    report = _pipeline(strict=False, expected={key: "0" * 64})
    report._input_urls = {key: f"{server}/lora"}
    assert report._lora_or_skip(key) is None  # logged and skipped, never loaded
