"""Wan 2.2 in the GPU worker (W28): model selection, native limits, frame counts."""
import importlib

import pytest


@pytest.fixture()
def pipeline(monkeypatch):
    monkeypatch.setenv("CINEFORGE_PLACEHOLDER", "1")
    monkeypatch.delenv("WAN22_I2V_MODEL_ID", raising=False)
    from app import pipeline as p

    return importlib.reload(p)


def test_wan22_is_a_known_model_with_ti2v_default(pipeline):
    assert pipeline.MODEL_IDS["wan-2.2"] == "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
    vp = pipeline.VideoPipeline("wan-2.2")
    # TI2V-5B animates a still by itself: image conditioning without a second model.
    assert vp.has_i2v() is True
    # One model for both: animating a still reuses the text-to-video weights.
    assert vp.model_specs()["i2v"] == vp.model_specs()["t2v"]


def test_wan22_optional_a14b_image_to_video(monkeypatch):
    monkeypatch.setenv("CINEFORGE_PLACEHOLDER", "1")
    monkeypatch.setenv("WAN22_I2V_MODEL_ID", "Wan-AI/Wan2.2-I2V-A14B-Diffusers")
    monkeypatch.setenv("WAN22_I2V_MODEL_REVISION", "abc")
    from app import pipeline as p

    p = importlib.reload(p)
    assert p.VideoPipeline("wan-2.2").model_specs()["i2v"] == ("Wan-AI/Wan2.2-I2V-A14B-Diffusers", "abc")
    monkeypatch.delenv("WAN22_I2V_MODEL_ID")
    importlib.reload(p)


def test_wan22_native_720p_limits_and_overrides(pipeline):
    assert pipeline.runtime_limits({}, model="wan-2.2") == {"maxWidth": 1280, "maxHeight": 704, "maxFrames": 121, "maxSteps": 40}
    assert pipeline.runtime_limits({"WAN_MAX_STEPS": "25"}, model="wan-2.2")["maxSteps"] == 25
    # Wan 2.1 keeps its own 480p defaults.
    assert pipeline.runtime_limits({}, model="wan-2.1")["maxWidth"] == 832
    # 1080p requests snap to the model's 720p frame, keeping the shape.
    caps = pipeline.runtime_limits({}, model="wan-2.2")
    assert pipeline.clamp_dims(1920, 1080, caps) == (1280, 704)
    assert pipeline.clamp_dims(1080, 1920, caps) == (704, 1280)


def test_wan_frames_are_4k_plus_1(pipeline):
    assert [pipeline.wan_frames(n) for n in (1, 5, 24, 120, 121, 122)] == [5, 5, 21, 117, 121, 121]


def test_wan22_capabilities_report_720p_and_image_conditioning(pipeline):
    vp = pipeline.VideoPipeline("wan-2.2")
    vp.load()
    caps = vp.capabilities()
    assert caps["model"] == "wan-2.2"
    assert caps["resolutions"] == [[1280, 704], [704, 1280]]
    assert caps["supportsRefImage"] is True
