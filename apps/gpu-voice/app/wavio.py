"""Small audio helpers that need only the standard library and ffmpeg.

The model code works on WAV files. References arrive in whatever format the
owner uploaded (wav, m4a, mp3, webm …); ffmpeg turns them into mono PCM WAV at
the engine's rate. Durations are read from the WAV header, never guessed.
"""

from __future__ import annotations

import math
import os
import shutil
import struct
import subprocess
import tempfile
import wave


class AudioError(RuntimeError):
    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


def wav_info(path: str) -> tuple[float, int]:
    """(duration seconds, sample rate) of a PCM WAV file."""
    with wave.open(path, "rb") as w:
        frames, rate = w.getnframes(), w.getframerate()
    return (frames / float(rate) if rate else 0.0), rate


def to_wav(src: str, *, rate: int, max_sec: float | None = None, start_sec: float = 0.0) -> str:
    """Decode any audio file to mono 16-bit PCM WAV at `rate` (ffmpeg)."""
    if shutil.which("ffmpeg") is None:
        raise AudioError("FFMPEG_MISSING")
    fd, out = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    cmd = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y"]
    if start_sec > 0:
        cmd += ["-ss", f"{start_sec:.3f}"]
    cmd += ["-i", src, "-ac", "1", "-ar", str(rate), "-sample_fmt", "s16"]
    if max_sec is not None:
        cmd += ["-t", f"{max_sec:.3f}"]
    cmd.append(out)
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        os.unlink(out)
        raise AudioError("AUDIO_UNREADABLE", r.stderr.decode(errors="replace")[-300:])
    return out


def write_tone(path: str, seconds: float, rate: int = 24000, freq: float = 220.0) -> None:
    """A quiet sine tone — ONLY for CINEFORGE_PLACEHOLDER=1 (tests, local wiring)."""
    n = max(1, int(seconds * rate))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(3000 * math.sin(2 * math.pi * freq * i / rate))) for i in range(n)))


def write_pcm16(path: str, samples, rate: int) -> None:
    """Write float samples in [-1, 1] (any iterable / numpy array) as 16-bit mono WAV."""
    try:
        import numpy as np  # noqa: PLC0415

        arr = np.asarray(samples, dtype="float32").reshape(-1)
        pcm = (np.clip(arr, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    except ImportError:  # pragma: no cover - the real engines always have numpy
        pcm = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, float(s))) * 32767)) for s in samples)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
