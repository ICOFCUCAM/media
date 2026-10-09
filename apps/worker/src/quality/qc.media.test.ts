/** W5 proof with real FFmpeg and real media (CI job media-regression): seeded bad clips are caught. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { judgeClip, judgeMaster } from "./gates";
import { inspectClip, measureMedia } from "./measure";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const want = { durationSec: 4, width: 320, height: 240 };

describe.runIf(HAVE_FFMPEG)("quality gates on real media", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-qc-media-"));
    const enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p"];
    ff(["-f", "lavfi", "-i", "testsrc=s=320x240:r=24:d=4", ...enc, join(dir, "good.mp4")]);
    ff(["-f", "lavfi", "-i", "color=c=black:s=320x240:r=24:d=4", ...enc, join(dir, "black.mp4")]);
    // One still frame held for 4 s: no motion.
    ff(["-f", "lavfi", "-i", "testsrc=s=320x240:r=24:d=4", "-vf", "trim=end_frame=1,tpad=stop_mode=clone:stop=95", ...enc, join(dir, "frozen.mp4")]);
    ff(["-f", "lavfi", "-i", "testsrc=s=320x240:r=24:d=1", ...enc, join(dir, "truncated.mp4")]);
    await writeFile(join(dir, "not-a-video.mp4"), "<html>error page from a provider</html>");
    // A master with tone, and the same picture with no sound.
    ff(["-f", "lavfi", "-i", "testsrc=s=320x240:r=24:d=6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", ...enc, "-c:a", "aac", "-shortest", join(dir, "master.mp4")]);
    ff(["-f", "lavfi", "-i", "testsrc=s=320x240:r=24:d=6", ...enc, join(dir, "silent.mp4")]);
  }, 120_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const judge = async (name: string) => judgeClip(await measureMedia(join(dir, name)), want, "enforce");

  it("a good clip passes", async () => {
    expect((await judge("good.mp4")).outcome).toBe("pass");
  });

  it("catches a black clip, a frozen clip, a truncated clip and a file that is not a video", async () => {
    expect((await judge("black.mp4")).findings.map((f) => f.code)).toContain("CLIP_BLACK");
    expect((await judge("frozen.mp4")).findings.map((f) => f.code)).toContain("CLIP_FROZEN");
    expect((await judge("truncated.mp4")).findings.map((f) => f.code)).toContain("CLIP_TRUNCATED");
    const bad = await judge("not-a-video.mp4");
    expect(bad).toMatchObject({ outcome: "fail", findings: [{ code: "CLIP_UNREADABLE", severity: "fatal" }] });
  }, 60_000);

  it("inspectClip downloads once and returns facts plus a frame for the reviewer", async () => {
    const { copyFile } = await import("node:fs/promises");
    const i = await inspectClip((_k, dest) => copyFile(join(dir, "good.mp4"), dest), "projects/p/shots/s.mp4", { frame: true });
    expect(i.facts).toMatchObject({ readable: true, hasVideo: true, width: 320, height: 240 });
    expect(i.facts.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(i.frame?.mediaType).toBe("image/jpeg");
  }, 60_000);

  it("the Final Quality Gate measures loudness and catches a silent master", async () => {
    const spec = { durationSec: 6, hasSound: true, integratedLufs: -16, truePeakMaxDbtp: -1 };
    const m = await measureMedia(join(dir, "master.mp4"), { loudness: true });
    expect(m.loudness?.integratedLufs).toBeGreaterThan(-19);
    expect(m.loudness?.integratedLufs).toBeLessThan(-13);
    expect(judgeMaster(m, spec, "enforce").map((r) => r.outcome)).toEqual(["pass", "pass"]);
    const silent = judgeMaster(await measureMedia(join(dir, "silent.mp4"), { loudness: true }), spec, "enforce");
    expect(silent[1]).toMatchObject({ gate: "audio", outcome: "fail", findings: [{ code: "MASTER_SILENT" }] });
  }, 60_000);
});
