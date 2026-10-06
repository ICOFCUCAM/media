import shutil
import subprocess

import pytest

from app.timing import TimingProbeError, seconds_to_us, video_timing_report

FACTS = {"r_frame_rate": "16/1", "avg_frame_rate": "16/1", "time_base": "1/16384",
         "nb_read_packets": "25", "duration_ts": "25600"}


def test_seconds_to_us_is_exact():
    assert seconds_to_us(6.84) == 6_840_000
    assert seconds_to_us(5.0) == 5_000_000
    assert seconds_to_us(0.0000005) == 1


def test_report_measures_frames_not_the_request():
    # The Wan frame cap: 5 s requested at 16 fps, 25 frames produced.
    r = video_timing_report("x.mp4", requested_duration_sec=5.0, requested_fps=16, facts=FACTS)
    assert r["requestedDurationUs"] == 5_000_000
    assert r["actualDurationUs"] == 1_562_500
    assert r["timingAccuracy"] == {"deltaUs": -3_437_500, "ratio": 0.3125}
    assert r["frameCount"] == 25 and r["frameRate"] == {"num": 16, "den": 1}
    assert r["containerDurationUs"] == 1_562_500
    assert r["conformApplied"] == "none" and r["measuredBy"] == "ffprobe"


def test_ntsc_rates_stay_rational():
    r = video_timing_report("x.mp4", requested_duration_sec=1.001, requested_fps=24,
                            facts={**FACTS, "avg_frame_rate": "24000/1001", "nb_read_packets": "24", "duration_ts": "N/A"})
    assert r["frameRate"] == {"num": 24000, "den": 1001}
    assert r["actualDurationUs"] == 1_001_000 and r["timingAccuracy"]["deltaUs"] == 0
    assert r["containerDurationUs"] is None


def test_unusable_facts_raise():
    with pytest.raises(TimingProbeError):
        video_timing_report("x.mp4", requested_duration_sec=1, requested_fps=16, facts={**FACTS, "nb_read_packets": "0"})
    with pytest.raises(TimingProbeError):
        video_timing_report("x.mp4", requested_duration_sec=1, requested_fps=16,
                            facts={**FACTS, "avg_frame_rate": "0/0", "r_frame_rate": "0/0"})
    with pytest.raises(TimingProbeError):
        video_timing_report("/nonexistent.mp4", requested_duration_sec=1, requested_fps=16)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_real_file_is_measured(tmp_path):
    out = tmp_path / "c.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=2:r=16",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)], check=True)
    r = video_timing_report(str(out), requested_duration_sec=6.84, requested_fps=16)
    assert r["frameCount"] == 32 and r["actualDurationUs"] == 2_000_000
    assert r["timingAccuracy"]["deltaUs"] == 2_000_000 - 6_840_000


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_regression_7_real_clip(tmp_path):
    """docs/38 §AW.11 test 7 input: 6.840 s requested, a real 5.800 s file produced."""
    out = tmp_path / "short.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=s=64x64:d=5.8:r=25",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)], check=True)
    r = video_timing_report(str(out), requested_duration_sec=6.84, requested_fps=25)
    assert r["requestedDurationUs"] == 6_840_000
    assert r["actualDurationUs"] == 5_800_000 and r["frameCount"] == 145
    assert r["timingAccuracy"] == {"deltaUs": -1_040_000, "ratio": 0.847953}
    assert r["frameRate"] == {"num": 25, "den": 1}


def test_runtime_limits_are_published():
    from app.pipeline import runtime_limits

    assert runtime_limits({}) == {"maxWidth": 832, "maxHeight": 480, "maxFrames": 25, "maxSteps": 20}
    assert runtime_limits({"WAN_MAX_FRAMES": "81"})["maxFrames"] == 81
