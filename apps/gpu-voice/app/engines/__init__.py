"""One engine per container, chosen by VOICE_ENGINE (Part 4 §152, §171).

    VOICE_ENGINE=qwen3-tts | cosyvoice-3 | gpt-sovits

An unknown or missing value is a startup error — never a silent default.
"""

from __future__ import annotations

import os

from .base import EngineError, EngineInfo, GpuUnavailableError, Style, VoiceBackend, cosine


def _qwen3():
    from .qwen3 import Qwen3Backend

    return Qwen3Backend


def _cosyvoice():
    from .cosyvoice import CosyVoiceBackend

    return CosyVoiceBackend


def _gptsovits():
    from .gptsovits import GptSovitsBackend

    return GptSovitsBackend


ENGINES = {"qwen3-tts": _qwen3, "cosyvoice-3": _cosyvoice, "gpt-sovits": _gptsovits}


class UnknownEngineError(RuntimeError):
    pass


def build_backend(env: dict[str, str] | None = None) -> VoiceBackend:
    env = dict(os.environ if env is None else env)
    name = env.get("VOICE_ENGINE", "").strip()
    if name not in ENGINES:
        raise UnknownEngineError(f"VOICE_ENGINE must be one of {sorted(ENGINES)}, got {name!r}")
    return ENGINES[name]()(env)


__all__ = ["ENGINES", "EngineError", "EngineInfo", "GpuUnavailableError", "Style", "UnknownEngineError",
           "VoiceBackend", "build_backend", "cosine"]
