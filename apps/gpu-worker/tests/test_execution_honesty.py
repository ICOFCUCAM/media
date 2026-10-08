"""DirectorOS W1 — the GPU worker reports what actually ran (DOS-70, DOS-75, DOS-77).

No placeholder clip is ever returned as a generation unless placeholder mode
was asked for explicitly; capabilities never claim more than the worker does;
the response carries the real dimensions and an execution report.
"""

from __future__ import annotations

import pytest

from app import pipeline as pl
from app.pipeline import GpuUnavailableError, StorageUnconfiguredError, VideoPipeline, upload_clip

from .conftest import FakePipeline, build_client
from .test_server import cineforge_authz, gen_body, post


def _no_cuda(monkeypatch, placeholder: bool):
    monkeypatch.setattr(pl, "PLACEHOLDER", placeholder)
    monkeypatch.setattr(pl, "_cuda_available", lambda: False)


def test_no_cuda_without_flag_is_unavailable_not_placeholder(monkeypatch):
    _no_cuda(monkeypatch, placeholder=False)
    p = VideoPipeline("wan-2.1")
    p.load()
    assert p.execution_mode == "unavailable" and p.unavailable_reason == "CUDA_UNAVAILABLE"
    caps = p.capabilities()
    assert caps["realExecution"] is False and caps["execution"] == "unavailable"
    assert caps["supportsLora"] is False and caps["supportsRefImage"] is False
    with pytest.raises(GpuUnavailableError):
        p.generate(prompt="x", negative_prompt=None, seed=1, duration_sec=1, width=64, height=64, fps=8,
                   reference_image_keys=[], camera={}, extra={})


def test_explicit_placeholder_reports_itself(monkeypatch):
    _no_cuda(monkeypatch, placeholder=True)
    p = VideoPipeline("wan-2.1")
    monkeypatch.setattr(p, "_placeholder", lambda *a, **k: ("/tmp/x.mp4", None))
    p.generate(prompt="x", negative_prompt=None, seed=1, duration_sec=2, width=64, height=48, fps=8,
               reference_image_keys=["ref.png"], camera={"move": "dolly"}, extra={},
               reference_video_keys=["motion.mp4"], lora_keys=["l.safetensors"])
    ex = p.last_execution
    assert ex["mode"] == "placeholder" and ex["frames"] == 16
    assert ex["referenceImagesIgnored"] == 1 and ex["referenceVideoIgnored"] and ex["cameraIgnored"]
    assert ex["lorasApplied"] == [] and ex["lorasSkipped"] == [{"key": "l.safetensors", "reason": "PLACEHOLDER"}]
    assert p.capabilities()["execution"] == "placeholder" and p.capabilities()["realExecution"] is False


def test_capabilities_never_claim_reference_video_or_camera(monkeypatch):
    _no_cuda(monkeypatch, placeholder=True)
    p = VideoPipeline("hunyuan")
    p.load()
    caps = p.capabilities()
    assert caps["supportsRefVideo"] is False and caps["supportsCamera"] is False
    # Hunyuan has no image-to-video path here.
    assert caps["supportsRefImage"] is False


def test_upload_without_credentials_is_an_error_not_a_phantom_key(monkeypatch):
    for k in ("S3_ACCESS_KEY", "AWS_ACCESS_KEY_ID"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(StorageUnconfiguredError):
        upload_clip("/tmp/none.mp4", "_generated/x.mp4", None)


class ReportingPipeline(FakePipeline):
    def __init__(self, execution: dict | None, **kw) -> None:
        super().__init__(**kw)
        self._execution = execution

    def generate(self, **kw):
        self.last_execution = self._execution
        return super().generate(**kw)


class UnavailablePipeline(FakePipeline):
    def generate(self, **kw):
        raise GpuUnavailableError("CUDA_UNAVAILABLE")


def test_response_carries_real_dimensions_and_execution(signing_key, mint):
    ex = {"mode": "real", "conditioning": "t2v", "width": 832, "height": 480, "frames": 25, "fps": 16, "steps": 20,
          "lorasApplied": [], "lorasSkipped": []}
    client, _, _ = build_client(signing_key, pipeline=ReportingPipeline(ex))
    body = gen_body(width=1280, height=720)
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz(width=1280, height=720)))
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["width"], out["height"]) == (832, 480)
    assert out["realExecution"] is True and out["execution"]["frames"] == 25


def test_placeholder_result_is_marked_not_real(signing_key, mint):
    client, _, _ = build_client(signing_key, pipeline=ReportingPipeline({"mode": "placeholder", "width": 832, "height": 480}))
    body = gen_body()
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz()))
    assert r.status_code == 200 and r.json()["realExecution"] is False


def test_unavailable_gpu_returns_503(signing_key, mint):
    client, _, _ = build_client(signing_key, pipeline=UnavailablePipeline())
    body = gen_body()
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz()))
    assert r.status_code == 503 and r.json()["detail"]["error"] == "CUDA_UNAVAILABLE"
