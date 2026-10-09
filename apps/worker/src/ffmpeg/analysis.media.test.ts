/** FFmpeg measurements against real media (CI job media-regression). */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { measureBlack, measureFreezes, measureLoudness, measureSilences, probeFormat, probeStreams, sha256File } from "./analysis";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

describe.runIf(HAVE_FFMPEG)("FFmpeg measurements with real media", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-analysis-"));
    // Speech stand-in: 0.5 s silence, 2 s tone, 0.5 s silence.
    ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.5", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.5", "-filter_complex", "[0][1][2]concat=n=3:v=0:a=1,volume=-12dB", join(dir, "line.wav")]);
    // Picture at 25 fps: 12 black frames (0.48 s), 38 moving frames, then 25 frozen frames (1 s) = 75 frames, 3 s.
    ff(["-f", "lavfi", "-i", "color=c=black:s=64x48:r=25:d=0.48", "-f", "lavfi", "-i", "testsrc=s=64x48:r=25:d=1.52",
        "-filter_complex", "[0][1]concat=n=2:v=1:a=0,tpad=stop_mode=clone:stop=25", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "clip.mp4")]);
  }, 60_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("probes exact stream facts", async () => {
    const v = await probeStreams(join(dir, "clip.mp4"));
    expect(v).toMatchObject({ hasVideo: true, hasAudio: false, frameRate: { num: 25, den: 1 }, frameCount: 75, durationUs: 3_000_000n });
    const a = await probeStreams(join(dir, "line.wav"));
    expect(a).toMatchObject({ hasAudio: true, sampleRate: 48000 });
    expect(Number(a.durationUs)).toBeCloseTo(3_000_000, -3);
  });

  it("probes the delivery format (W18)", async () => {
    expect(await probeFormat(join(dir, "clip.mp4"))).toMatchObject({ videoCodec: "h264", pixFmt: "yuv420p", avgFps: 25, rFps: 25, audioCodec: null });
    expect(await probeFormat(join(dir, "line.wav"))).toMatchObject({ videoCodec: null, audioCodec: "pcm_s16le", channels: 1, sampleRate: 48000 });
  });

  it("measures loudness, silences, black and freezes onto the clock", async () => {
    const l = (await measureLoudness(join(dir, "line.wav")))!;
    // A sine at the default amplitude, −12 dB, with silence around it.
    expect(l.integratedLufs).toBeLessThan(-20);
    expect(l.integratedLufs).toBeGreaterThan(-45);
    expect(l.truePeakDbtp).not.toBeNull();
    const s = await measureSilences(join(dir, "line.wav"), 3_000_000n);
    expect(s).toHaveLength(2);
    expect(Number(s[0]!.endUs)).toBeCloseTo(500_000, -4);
    expect(Number(s[1]!.startUs)).toBeCloseTo(2_500_000, -4);
    const b = await measureBlack(join(dir, "clip.mp4"));
    expect(b[0]!.startUs).toBe(0n);
    expect(b[0]!.endUs).toBe(480_000n);
    const f = await measureFreezes(join(dir, "clip.mp4"), 3_000_000n);
    expect(f.length).toBeGreaterThanOrEqual(1);
    expect(Number(f[f.length - 1]!.startUs)).toBeGreaterThan(1_500_000);
    expect(await sha256File(join(dir, "clip.mp4"))).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);
});
