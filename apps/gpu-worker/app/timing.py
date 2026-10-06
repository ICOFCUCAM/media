"""Video timing report (docs/38 §AV.5 — no runtime may silently alter timing).

Every generation returns what it ACTUALLY produced, measured from the output
file with ffprobe — never echoed from the request. Cineforge, not this worker,
compares it with what it asked for and decides the outcome (ACCEPTED /
REQUIRES_REPAIR / REQUIRES_REGENERATION / FAILED).

All times are integer microseconds; rates are exact rationals.
"""
from __future__ import annotations

import json
import subprocess
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

US = 1_000_000


class TimingProbeError(RuntimeError):
    pass


def seconds_to_us(sec: float) -> int:
    """Requested seconds → µs, through the decimal string (6.84 → 6840000 exactly)."""
    return int((Decimal(str(sec)) * US).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _rational(s: str) -> Fraction:
    num, _, den = (s or "").partition("/")
    try:
        f = Fraction(int(num), int(den or 1))
    except (ValueError, ZeroDivisionError):
        raise TimingProbeError(f"unusable rate {s!r}") from None
    if f <= 0:
        raise TimingProbeError(f"unusable rate {s!r}")
    return f


def probe(path: str) -> dict:
    """Raw ffprobe facts about the first video stream (frame count by packet count)."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
             "-show_entries", "stream=r_frame_rate,avg_frame_rate,time_base,nb_read_packets,duration_ts",
             "-of", "json", path],
            check=True, capture_output=True, timeout=60,
        ).stdout
        stream = (json.loads(out).get("streams") or [None])[0]
    except (OSError, subprocess.SubprocessError, ValueError) as e:
        raise TimingProbeError(f"ffprobe failed: {type(e).__name__}") from e
    if not stream:
        raise TimingProbeError("no video stream")
    return stream


def video_timing_report(path: str, *, requested_duration_sec: float, requested_fps: int,
                        conform_applied: str = "none", facts: dict | None = None) -> dict:
    s = facts if facts is not None else probe(path)
    rate = _rational(s.get("avg_frame_rate") if s.get("avg_frame_rate") not in (None, "0/0") else s.get("r_frame_rate"))
    tb = _rational(s.get("time_base") or "1/1")
    frames = int(s.get("nb_read_packets") or 0)
    if frames <= 0:
        raise TimingProbeError("no frames")
    # Constant-frame-rate output: duration = frames / rate, exact, floored to µs.
    actual = (Fraction(frames) / rate * US).__floor__()
    container = int(Fraction(int(s["duration_ts"])) * tb * US) if s.get("duration_ts") not in (None, "N/A") else None
    requested = seconds_to_us(requested_duration_sec)
    return {
        "kind": "video",
        "requestedDurationUs": requested,
        "actualDurationUs": actual,
        "containerDurationUs": container,
        "timingAccuracy": {"deltaUs": actual - requested, "ratio": round(actual / requested, 6) if requested else None},
        "frameRate": {"num": rate.numerator, "den": rate.denominator},
        "timebase": {"num": tb.numerator, "den": tb.denominator},
        "frameCount": frames,
        "requestedFrameRate": {"num": int(requested_fps), "den": 1},
        "conformApplied": conform_applied,
        "measuredBy": "ffprobe",
    }
