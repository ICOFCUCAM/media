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
