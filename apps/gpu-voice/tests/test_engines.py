"""Engine selection, placeholder honesty and the common checks (no GPU, no weights)."""

from __future__ import annotations

import os
import subprocess
import tempfile

import pytest

from app.engines import ENGINES, EngineError, GpuUnavailableError, Style, UnknownEngineError, build_backend
from app.engines.base import cosine
from app.wavio import wav_info, write_tone

from .conftest import REV, needs_ffmpeg, placeholder_backend


def test_one_engine_per_container_selected_by_env_never_a_default():
    assert sorted(ENGINES) == ["cosyvoice-3", "gpt-sovits", "qwen3-tts"]
    with pytest.raises(UnknownEngineError):
        build_backend({})
    with pytest.raises(UnknownEngineError):
        build_backend({"VOICE_ENGINE": "fish-speech"})


@pytest.mark.parametrize("engine,repo,artifact", [
    ("qwen3-tts", "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "speaker_embedding"),
    ("cosyvoice-3", "FunAudioLLM/Fun-CosyVoice3-0.5B-2512", "speaker_embedding"),
    ("gpt-sovits", "lj1995/GPT-SoVITS", "prompt_audio"),
])
def test_each_engine_names_its_pinned_checkpoint(engine, repo, artifact):
    b = build_backend({"VOICE_ENGINE": engine, "VOICE_MODEL_REVISION": REV})
    assert b.model_specs() == {"tts": (repo, REV)}
    assert b.info.artifact_type == artifact
    custom = build_backend({"VOICE_ENGINE": engine, "VOICE_MODEL_REPO": "me/fork", "VOICE_MODEL_REVISION": "b" * 40})
    assert custom.model_specs() == {"tts": ("me/fork", "b" * 40)} and custom.engine_version() == f"me/fork@{'b' * 12}"


def test_without_the_placeholder_flag_and_without_cuda_an_engine_is_unavailable_not_faked():
    b = build_backend({"VOICE_ENGINE": "qwen3-tts", "VOICE_MODEL_REVISION": REV})
    b.load()
    assert b.execution_mode == "unavailable" and b.unavailable_reason == "CUDA_UNAVAILABLE"
    with tempfile.TemporaryDirectory() as d:
        with pytest.raises(GpuUnavailableError):
            b.synthesize({"x": 1}, ["Hello"], "en", Style(), [os.path.join(d, "a.wav")])
    assert b.capabilities()["realExecution"] is False


@pytest.mark.parametrize("engine", sorted(ENGINES))
def test_placeholder_mode_is_explicit_and_says_so(engine):
    b = placeholder_backend(engine)
    b.load()
    assert b.execution_mode == "placeholder" and b.runtime() == "placeholder" and not b.is_real
    with tempfile.TemporaryDirectory() as d:
        ref = os.path.join(d, "ref.wav")
        write_tone(ref, 4.0)
        art = os.path.join(d, "artifact")
        meta = b.enroll(ref, "hello", "en", art)
        assert meta["mode"] == "placeholder"
        voice = b.prepare_voice(art, "0" * 64, {})
        outs = [os.path.join(d, f"{i}.wav") for i in range(2)]
        notes = b.synthesize(voice, ["One line.", "Another, longer line of speech."], "en", Style(speed=1.2, emotion="sad"), outs)
        assert "emotion" in notes["styleIgnored"]
        assert ("speed" in notes["styleIgnored"]) == (not b.info.speed_control)
        durs = [wav_info(p)[0] for p in outs]
        assert durs[1] > durs[0] > 0


def test_language_text_and_voice_checks():
    b = placeholder_backend("gpt-sovits")
    assert b.language("en-GB") == "en" and b.language("ja") == "all_ja"
    with pytest.raises(EngineError, match="LANGUAGE_UNSUPPORTED"):
        b.language("zh")  # needs the G2PW model, not downloaded in this image
    b.load()
    with tempfile.TemporaryDirectory() as d:
        with pytest.raises(EngineError, match="TEXT_TOO_LONG"):
            b.synthesize({}, ["x" * 401], "en", Style(), [os.path.join(d, "a.wav")])
        with pytest.raises(EngineError, match="VOICE_REQUIRED"):
            b.synthesize(None, ["Hi"], "en", Style(), [os.path.join(d, "a.wav")])
        with pytest.raises(EngineError, match="EMPTY_TEXT"):
            b.synthesize({}, ["  "], "en", Style(), [os.path.join(d, "a.wav")])


def test_a_placeholder_artifact_is_never_read_as_a_real_one():
    b = placeholder_backend()
    b.load()
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        f.write('{"format": "real"}')
    try:
        with pytest.raises(EngineError, match="ARTIFACT_MODE_MISMATCH"):
            b.prepare_voice(f.name, "0" * 64)
    finally:
        os.unlink(f.name)


def test_similarity_support_is_declared_per_engine():
    assert placeholder_backend("qwen3-tts").info.similarity and placeholder_backend("cosyvoice-3").info.similarity
    b = placeholder_backend("gpt-sovits")
    b.load()
    with pytest.raises(EngineError, match="SIMILARITY_UNSUPPORTED"):
        b.embed("/nonexistent")
    assert cosine([1.0, 0.0], [1.0, 0.0]) == 1.0 and cosine([1.0, 0.0], [0.0, 1.0]) == 0.0


@needs_ffmpeg
def test_reference_longer_than_the_model_limit_is_cut_and_its_transcript_dropped():
    b = placeholder_backend("gpt-sovits")  # 3–9.5 s references
    with tempfile.TemporaryDirectory() as d:
        long_ref, short_ref, mp3 = (os.path.join(d, n) for n in ("long.wav", "short.wav", "ref.mp3"))
        write_tone(long_ref, 14.0, rate=16000)
        write_tone(short_ref, 2.0, rate=16000)
        wav, text, dur = b.reference(long_ref, "a transcript of fourteen seconds")
        assert text is None and dur == 9.5 and abs(wav_info(wav)[0] - 9.5) < 0.05 and wav_info(wav)[1] == 32000
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", long_ref, "-t", "6", mp3], check=True)
        wav, text, dur = b.reference(mp3, "six seconds")
        assert text == "six seconds" and 5.9 < dur < 6.2
        with pytest.raises(EngineError, match="REFERENCE_TOO_SHORT"):
            b.reference(short_ref, None)
