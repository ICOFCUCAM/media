"""ComfyUI as a local child process (docs/38 §AT.10).

ComfyUI has no authentication on any route (docs/38 §AT.4). It is started
bound to 127.0.0.1 only, without custom nodes (unless pinned ones are
whitelisted by the registry), without API nodes and without opening a browser.
The CineForge service is the only listener on the container network. Nothing
of ComfyUI's API is proxied: the service submits the bound graph, waits for
its history entry, and reads the output file from the job's output folder.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


class ComfyError(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code


def comfy_args(comfy_dir: str, *, port: int, base: str, whitelist: list[str]) -> list[str]:
    args = [
        sys.executable, os.path.join(comfy_dir, "main.py"),
        "--listen", "127.0.0.1", "--port", str(port),
        "--disable-auto-launch", "--disable-api-nodes", "--disable-all-custom-nodes",
        "--input-directory", os.path.join(base, "input"),
        "--output-directory", os.path.join(base, "output"),
        "--temp-directory", os.path.join(base, "temp"),
        "--database-url", "sqlite:///:memory:",
        "--preview-method", "none",
        "--log-stdout",
    ]
    if whitelist:
        args += ["--whitelist-custom-nodes", *whitelist]
    return args


class ComfyProcess:
    """Starts ComfyUI and talks to it on 127.0.0.1 only."""

    def __init__(self, comfy_dir: str, base: str, *, port: int = 8188, whitelist: list[str] | None = None) -> None:
        self.comfy_dir, self.base, self.port = comfy_dir, base, port
        self.whitelist = whitelist or []
        self.proc: subprocess.Popen | None = None
        self.url = f"http://127.0.0.1:{port}"

    @property
    def input_dir(self) -> str:
        return os.path.join(self.base, "input")

    @property
    def output_dir(self) -> str:
        return os.path.join(self.base, "output")

    def start(self, timeout_sec: float = 600) -> None:
        for d in ("input", "output", "temp"):
            os.makedirs(os.path.join(self.base, d), exist_ok=True)
        self.proc = subprocess.Popen(comfy_args(self.comfy_dir, port=self.port, base=self.base, whitelist=self.whitelist),
                                     cwd=self.comfy_dir)
        deadline = time.monotonic() + timeout_sec
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise ComfyError("COMFYUI_EXITED", f"exit code {self.proc.returncode}")
            try:
                self._get("/system_stats", timeout=5)
                return
            except (urllib.error.URLError, OSError, ValueError):
                time.sleep(2)
        raise ComfyError("COMFYUI_START_TIMEOUT")

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    # ── HTTP on localhost ────────────────────────────────────────────────
    def _get(self, path: str, timeout: float = 30) -> dict:
        with urllib.request.urlopen(self.url + path, timeout=timeout) as r:  # noqa: S310 — 127.0.0.1 only
            return json.loads(r.read() or b"{}")

    def _post(self, path: str, doc: dict, timeout: float = 30) -> dict:
        req = urllib.request.Request(self.url + path, data=json.dumps(doc).encode(), method="POST",
                                     headers={"content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310
                body = r.read()
        except urllib.error.HTTPError as e:
            # ComfyUI answers 400 with node_errors for an invalid graph.
            detail = e.read()[:2000].decode(errors="replace")
            raise ComfyError("COMFYUI_REJECTED_GRAPH", detail) from None
        return json.loads(body or b"{}")

    def system_stats(self) -> dict:
        return self._get("/system_stats", timeout=5)

    def vram_free_mb(self) -> int:
        try:
            devs = self.system_stats().get("devices") or []
            return int(sum(d.get("vram_free", 0) for d in devs) / (1024 * 1024))
        except Exception:  # noqa: BLE001
            return 0

    def run(self, graph: dict, timeout_sec: float) -> list[dict]:
        """Submit one bound graph and wait for it; return its output image records."""
        client_id = uuid.uuid4().hex
        res = self._post("/prompt", {"prompt": graph, "client_id": client_id})
        prompt_id = res.get("prompt_id")
        if not prompt_id or res.get("node_errors"):
            raise ComfyError("COMFYUI_REJECTED_GRAPH", json.dumps(res.get("node_errors"))[:2000])
        deadline = time.monotonic() + timeout_sec
        wait = 0.5
        while time.monotonic() < deadline:
            if not self.alive():
                raise ComfyError("COMFYUI_EXITED")
            hist = self._get(f"/history/{prompt_id}").get(prompt_id)
            if hist:
                status = hist.get("status") or {}
                if status.get("status_str") == "error":
                    msgs = [m for m in status.get("messages") or [] if m and m[0] == "execution_error"]
                    raise ComfyError("COMFYUI_EXECUTION_ERROR", json.dumps(msgs)[:2000])
                if status.get("completed"):
                    images = []
                    for out in (hist.get("outputs") or {}).values():
                        images += out.get("images") or []
                    return images
            time.sleep(wait)
            wait = min(wait * 1.5, 3.0)
        try:
            self._post("/interrupt", {})
        except Exception:  # noqa: BLE001
            pass
        raise ComfyError("COMFYUI_TIMEOUT", f"over {int(timeout_sec)} s")
