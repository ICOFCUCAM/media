"""Runtime selection (placeholder only on the explicit flag), pinned model
fetching and weights digests, and the ComfyUI client against a fake ComfyUI."""
from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from app.comfy import ComfyError, ComfyProcess, comfy_args
from app.gateway.manifest import digest_entries
from app.registry import load_registry
from app.runtime import ComfyRuntime, PlaceholderRuntime, UnavailableRuntime, build_runtime
from app.weights import file_digest, pinned_models

from .conftest import PINS


def test_placeholder_only_with_the_explicit_flag(tmp_path):
    reg = load_registry()
    assert isinstance(build_runtime(reg, {"CINEFORGE_PLACEHOLDER": "1"}), PlaceholderRuntime)
    # No flag and no ComfyUI install: unavailable, never a silent placeholder.
    rt = build_runtime(reg, {"COMFYUI_DIR": str(tmp_path)})
    assert isinstance(rt, UnavailableRuntime)
    rt.load()
    assert rt.execution_mode == "unavailable" and rt.unavailable_reason == "COMFYUI_NOT_INSTALLED"
    (tmp_path / "main.py").write_text("")
    assert isinstance(build_runtime(reg, {"COMFYUI_DIR": str(tmp_path)}), ComfyRuntime)


class FakeProc:
    def __init__(self, fail=None):
        self.started = False
        self.fail = fail
        self.input_dir = self.output_dir = "/nonexistent"

    def start(self):
        if self.fail:
            raise ComfyError(self.fail)
        self.started = True

    def alive(self):
        return self.started

    def vram_free_mb(self):
        return 1234


def fake_hf_cache(tmp_path, pins):
    """A Hugging Face cache layout: snapshot files are symlinks to blobs named by sha256."""
    cache = tmp_path / "hub"
    paths = {}
    for k, pm in pins.items():
        repo = cache / ("models--" + pm.decl.repo.replace("/", "--"))
        blob = repo / "blobs" / (f"{abs(hash(k)):064d}"[:64])
        blob.parent.mkdir(parents=True, exist_ok=True)
        blob.write_bytes(k.encode())
        snap = repo / "snapshots" / pm.revision / pm.decl.file
        snap.parent.mkdir(parents=True, exist_ok=True)
        if not snap.exists():
            os.symlink(blob, snap)
        paths[k] = str(snap)
    return str(cache), paths


@pytest.mark.parametrize("env,cuda,code", [({}, True, "MODEL_UNPINNED"), (PINS, False, "CUDA_UNAVAILABLE")])
def test_comfy_runtime_refuses_unpinned_models_and_missing_cuda(tmp_path, env, cuda, code):
    rt = ComfyRuntime(load_registry(), comfy_dir=str(tmp_path), base=str(tmp_path), env=env, cuda=lambda: cuda, process=FakeProc())
    rt.load()
    assert rt.execution_mode == "unavailable" and rt.unavailable_reason == code and not rt.is_real


def test_comfy_runtime_loads_pinned_models_and_resolves_weights(tmp_path, monkeypatch):
    reg = load_registry()
    pins = pinned_models(reg.models, PINS)
    cache, paths = fake_hf_cache(tmp_path, pins)
    monkeypatch.setenv("HF_HUB_CACHE", cache)
    downloaded = []
    proc = FakeProc()

    def download(pm):
        downloaded.append((pm.decl.repo, pm.revision, pm.decl.file))
        return paths[pm.decl.key]

    rt = ComfyRuntime(reg, comfy_dir=str(tmp_path / "comfy"), base=str(tmp_path / "w"), env=PINS, cuda=lambda: True,
                      download=download, process=proc)
    rt.load()
    assert rt.is_real and rt.execution_mode == "real" and proc.started
    assert all(rev in (PINS["QWEN_IMAGE_COMFY_REVISION"], PINS["QWEN_IMAGE_EDIT_COMFY_REVISION"]) for _, rev, _ in downloaded)
    # Linked into ComfyUI under the names the graphs use.
    assert os.path.islink(tmp_path / "comfy" / "models" / "diffusion_models" / "qwen_image_fp8_e4m3fn.safetensors")
    blob = os.path.basename(os.readlink(paths["qwen-image.vae"]))
    assert rt.weights("qwen-image.vae") == digest_entries([("split_files/vae/qwen_image_vae.safetensors", blob)])
    assert rt.runtime_id() == "comfyui@8ff6dc384ba5c410266b40e137799e049459d4f2" and rt.vram_free_mb() == 1234


def test_failed_download_or_start_is_unavailable(tmp_path):
    reg = load_registry()

    def boom(pm):
        raise OSError("network")

    rt = ComfyRuntime(reg, comfy_dir=str(tmp_path), base=str(tmp_path), env=PINS, cuda=lambda: True, download=boom, process=FakeProc())
    rt.load()
    assert rt.unavailable_reason == "MODEL_DOWNLOAD_FAILED"


def test_weights_digest_of_a_copied_cache_is_prefixed(tmp_path):
    reg = load_registry()
    pm = pinned_models(reg.models, PINS)["qwen-image.vae"]
    snap = tmp_path / ("models--" + pm.decl.repo.replace("/", "--")) / "snapshots" / pm.revision / pm.decl.file
    snap.parent.mkdir(parents=True)
    snap.write_bytes(b"vae")
    import hashlib

    assert file_digest(pm, str(tmp_path)) == digest_entries([(pm.decl.file, "sha256:" + hashlib.sha256(b"vae").hexdigest())])
    assert file_digest(pinned_models(reg.models, {})["qwen-image.vae"], str(tmp_path)) is None


def test_comfyui_is_bound_to_localhost_without_custom_or_api_nodes():
    args = comfy_args("/opt/ComfyUI", port=8188, base="/w", whitelist=[])
    assert args[args.index("--listen") + 1] == "127.0.0.1"
    assert {"--disable-all-custom-nodes", "--disable-api-nodes", "--disable-auto-launch"} <= set(args)
    assert "--enable-manager" not in args and "--whitelist-custom-nodes" not in args
    assert comfy_args("/c", port=1, base="/w", whitelist=["n1"])[-2:] == ["--whitelist-custom-nodes", "n1"]


class FakeComfy(BaseHTTPRequestHandler):
    """Just enough of ComfyUI's /prompt and /history for the client."""

    script: dict = {}

    def log_message(self, *a):
        pass

    def _send(self, code, doc):
        raw = json.dumps(doc).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        doc = json.loads(self.rfile.read(int(self.headers["content-length"])))
        FakeComfy.script.setdefault("posted", []).append((self.path, doc))
        if self.path == "/prompt":
            if FakeComfy.script.get("reject"):
                return self._send(400, {"error": "invalid", "node_errors": {"9": "bad"}})
            return self._send(200, {"prompt_id": "p1", "number": 1, "node_errors": {}})
        return self._send(200, {})

    def do_GET(self):
        if self.path == "/history/p1":
            return self._send(200, FakeComfy.script.get("history", {}))
        return self._send(200, {"devices": [{"vram_free": 2 * 1024 * 1024}]})


@pytest.fixture()
def fake_comfy():
    srv = HTTPServer(("127.0.0.1", 0), FakeComfy)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    FakeComfy.script = {}
    proc = ComfyProcess("/nonexistent", "/tmp", port=srv.server_address[1])

    class Alive:
        def poll(self):
            return None

    proc.proc = Alive()
    yield proc
    srv.shutdown()


def test_comfy_client_submits_and_collects_outputs(fake_comfy):
    FakeComfy.script["history"] = {"p1": {"status": {"status_str": "success", "completed": True, "messages": []},
                                          "outputs": {"11": {"images": [{"filename": "cf_j_out_00001_.png", "subfolder": "", "type": "output"}]}}}}
    images = fake_comfy.run({"1": {"class_type": "SaveImage", "inputs": {}}}, timeout_sec=5)
    assert images == [{"filename": "cf_j_out_00001_.png", "subfolder": "", "type": "output"}]
    path, doc = FakeComfy.script["posted"][0]
    assert path == "/prompt" and doc["prompt"] == {"1": {"class_type": "SaveImage", "inputs": {}}}
    assert fake_comfy.vram_free_mb() == 2


def test_comfy_client_reports_rejection_errors_and_timeouts(fake_comfy):
    FakeComfy.script["reject"] = True
    with pytest.raises(ComfyError, match="COMFYUI_REJECTED_GRAPH"):
        fake_comfy.run({}, timeout_sec=1)
    FakeComfy.script["reject"] = False
    FakeComfy.script["history"] = {"p1": {"status": {"status_str": "error", "completed": False,
                                                     "messages": [["execution_error", {"node_id": "9"}]]}}}
    with pytest.raises(ComfyError, match="COMFYUI_EXECUTION_ERROR"):
        fake_comfy.run({}, timeout_sec=5)
    FakeComfy.script["history"] = {}
    with pytest.raises(ComfyError, match="COMFYUI_TIMEOUT"):
        fake_comfy.run({}, timeout_sec=0.6)
    assert FakeComfy.script["posted"][-1][0] == "/interrupt"
