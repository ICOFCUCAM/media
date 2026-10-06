/** Measured facts → engine, with real media (CI job media-regression). */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeSync, FPS, syncPolicy, type DraftEvent } from "@cineforge/shared";
import { measureFacts } from "./facts";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

describe.runIf(HAVE_FFMPEG)("measured facts drive the sync engine", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-facts-"));
    // A 3 s shot slot filled with a 2 s clip whose last second is frozen; a line padded with 0.4 s of silence.
    ff(["-f", "lavfi", "-i", "testsrc=s=64x48:r=25:d=1", "-vf", "tpad=stop_mode=clone:stop=25", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "shot.mp4")]);
    ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.4", "-f", "lavfi", "-i", "sine=frequency=300:sample_rate=48000:duration=1.2",
        "-filter_complex", "[0][1]concat=n=2:v=0:a=1", join(dir, "line.wav")]);
  }, 60_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("finds the short clip, the freeze, the padded silence and the missing provenance", async () => {
    const video = await measureFacts({ eventKey: "shot:a", kind: "video", localPath: join(dir, "shot.mp4") });
    const audio = await measureFacts({ eventKey: "dialogue:d1", kind: "audio", localPath: join(dir, "line.wav"), generationRef: "audio_generations:1" });
    expect(video).toMatchObject({ durationUs: 2_000_000n, frameRate: { num: 25, den: 1 } });
    expect(Number(audio.leadingUs)).toBeCloseTo(400_000, -4);

    const events: DraftEvent[] = [
      { key: "scene:1", kind: "scene", refId: "1", startUs: 0n, endUs: 3_000_000n },
      { key: "shot:a", kind: "shot", refId: "a", startUs: 0n, endUs: 3_000_000n, parentKey: "scene:1" },
      { key: "dialogue:d1", kind: "dialogue", startUs: 500_000n, endUs: 2_100_000n, parentKey: "scene:1", anchor: { key: "shot:a", offsetUs: 500_000n, mode: "start" } },
    ];
    const { report } = analyzeSync({ timelineVersionId: "t", durationUs: 3_000_000n, fps: FPS.PAL_25, events, audio: [], media: [video, audio], policy: syncPolicy("cinematic") });
    const found = new Set(report.issues.map((i) => `${i.check}:${i.eventId}`));
    expect(report.passed).toBe(false);
    for (const k of ["duration:shot:a", "dropped_frames:shot:a", "silence:dialogue:d1", "provenance:shot:a"]) expect(found).toContain(k);
  }, 60_000);
});
