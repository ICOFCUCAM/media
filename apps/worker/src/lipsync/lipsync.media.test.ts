/**
 * Lip-sync stems and frame interpolation against real FFmpeg (W21).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ffmpeg } from "../ffmpeg/ffmpeg";
import { probeFormat, probeStreams } from "../ffmpeg/analysis";
import { normalizeArgs } from "../ffmpeg/commands";
import { dialogueStemArgs } from "./plan";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

describe.skipIf(!HAVE_FFMPEG)("lip sync and interpolation (real FFmpeg)", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-lipsync-test-"));
    ff(["-f", "lavfi", "-i", "sine=frequency=300:sample_rate=24000:duration=2", join(dir, "a.wav")]);
    ff(["-f", "lavfi", "-i", "sine=frequency=500:sample_rate=44100:duration=1", "-ac", "2", join(dir, "b.wav")]);
    ff(["-f", "lavfi", "-i", "testsrc=s=160x96:r=16:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "c16.mp4")]);
  }, 60_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("the dialogue stem is exactly the shot's length, 48 kHz mono, whatever the lines' formats", async () => {
    const out = join(dir, "stem.wav");
    await ffmpeg(["-y", ...dialogueStemArgs([join(dir, "a.wav"), join(dir, "b.wav")], [
      { lineId: "a", audioKey: "a", atSec: 0.25, fromSec: 0.5, durSec: 1.25 },
      { lineId: "b", audioKey: "b", atSec: 2, fromSec: 0, durSec: 0.75 },
    ], 3, out)]);
    expect(await probeFormat(out)).toMatchObject({ audioCodec: "pcm_s16le", channels: 1, sampleRate: 48000 });
    expect(Number((await probeStreams(out)).durationUs) / 1e6).toBeCloseTo(3, 1);
  }, 60_000);

  it("RENDER_INTERPOLATE=1 makes new in-between frames: a 16 fps clip becomes 24 fps at the same length", async () => {
    const out = join(dir, "c24.mp4");
    await ffmpeg(["-y", ...normalizeArgs(join(dir, "c16.mp4"), out, { width: 160, height: 96, fps: 24 }, { RENDER_INTERPOLATE: "1" })]);
    const f = await probeStreams(out);
    expect(f.frameRate).toEqual({ num: 24, den: 1 });
    expect(f.frameCount).toBeGreaterThanOrEqual(46);
    expect(Number(f.durationUs) / 1e6).toBeCloseTo(2, 0);
  }, 120_000);
});
