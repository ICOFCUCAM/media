/**
 * The previs animatic against real FFmpeg (W19): a still in motion and a dark
 * card join into one H.264 clip of the planned length, with the voice under it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ffmpeg } from "../ffmpeg/ffmpeg";
import { probeFormat, probeStreams } from "../ffmpeg/analysis";
import { planAnimatic, renderAnimatic } from "./animatic";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

describe.skipIf(!HAVE_FFMPEG)("previs animatic (real FFmpeg)", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-animatic-test-"));
    ff(["-f", "lavfi", "-i", "gradients=s=800x450:d=1", "-frames:v", "1", join(dir, "still.png")]);
    ff(["-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=3", join(dir, "voice.wav")]);
  }, 60_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("joins a moving still and a card under the voice, at the planned length", async () => {
    const plan = planAnimatic([
      { id: "a", durationSec: 2, stillKey: "still.png", cameraMovement: "dolly" },
      { id: "b", durationSec: 1.5, stillKey: null, cameraMovement: null },
    ], 3);
    const store = join(dir, "store");
    await renderAnimatic({
      download: (k, d) => copyFile(join(dir, k), d),
      upload: (p) => copyFile(p, join(dir, "out.mp4")),
      ffmpeg: (a) => ffmpeg(a),
    }, plan, { voiceKey: "voice.wav", key: store, aspectRatio: "16:9" });
    const facts = await probeStreams(join(dir, "out.mp4"));
    expect(facts).toMatchObject({ hasVideo: true, hasAudio: true, frameCount: 84 });
    expect(Number(facts.durationUs) / 1e6).toBeCloseTo(3.5, 1);
    expect(await probeFormat(join(dir, "out.mp4"))).toMatchObject({ videoCodec: "h264", audioCodec: "aac", sampleRate: 48000 });
  }, 60_000);
});
