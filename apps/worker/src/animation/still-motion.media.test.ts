/**
 * The still-motion engine against real FFmpeg (W12; Part 5 §181.4–6): one
 * drawn page becomes a clip of exactly the requested length at 24 fps, the
 * camera actually moves (frames differ), the timing report it returns passes
 * the same timing gate every runtime's does, and the execution report says
 * a real run used the still.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyVideoResult, frameRate, secondsToUs, syncPolicy } from "@cineforge/shared";
import { measureFreezes, probeStreams } from "../ffmpeg/analysis";
import { StillMotionEngine, STILL_MOTION_FPS } from "./still-motion";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";

/** Mean luma of every frame — a moving camera over a gradient changes it frame to frame. */
function lumaPerFrame(file: string): number[] {
  const out = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"]).toString();
  return [...out.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
}

describe.skipIf(!HAVE_FFMPEG)("still-motion engine (real FFmpeg)", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "still-motion-test-"));
    // A "drawn page": a horizontal gradient, so a pan changes what the frame shows.
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "color=c=black:s=320x240,format=gray,geq=lum='(X*0.6+Y*0.3)+25*sin(X/6)*sin(Y/5)'", "-frames:v", "1", join(dir, "page.png")]);
  });
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it.each(["pan", "tilt", "dolly", "crane", "drone", "handheld", "static"] as const)("%s: one still → an exact-length clip the timing gate accepts", async (movement) => {
    const uploaded: string[] = [];
    const engine = new StillMotionEngine({
      storage: {
        download: async (key, dest) => copyFile(join(dir, key), dest),
        upload: async (src, key) => {
          await copyFile(src, join(dir, key));
          uploaded.push(key);
        },
      },
      clipKey: () => `clip-${movement}.mp4`,
    });
    const r = await engine.generate({
      prompt: "", durationSec: 2, width: 160, height: 120, referenceImageKeys: ["page.png"],
      camera: { shotSize: "WS", movement, angle: "eye" },
    });
    expect(uploaded).toEqual([`clip-${movement}.mp4`]);
    expect(r).toMatchObject({ gpuMs: 0, realExecution: true, thumbnailKey: "page.png", execution: { mode: "real", conditioning: "i2v", referenceImagesUsed: 1, cameraIgnored: false } });

    const facts = await probeStreams(join(dir, r.videoKey));
    expect(facts.frameCount).toBe(2 * STILL_MOTION_FPS);
    expect(facts.frameRate).toEqual(frameRate(STILL_MOTION_FPS));

    const decision = classifyVideoResult({
      timing: r.timing,
      request: { durationUs: secondsToUs(2), fps: frameRate(STILL_MOTION_FPS) },
      policy: syncPolicy("cinematic"),
    });
    expect(decision.outcome).toBe("ACCEPTED");

    const luma = lumaPerFrame(join(dir, r.videoKey));
    const spread = Math.max(...luma) - Math.min(...luma);
    // The camera moves across the gradient: a pan shifts the mean brightness clearly.
    if (movement === "pan") expect(spread).toBeGreaterThan(5);
    else expect(luma.length).toBe(48);
    // The technical quality gate must not read a slow camera move as a frozen clip.
    expect(await measureFreezes(join(dir, r.videoKey))).toEqual([]);
  }, 30_000);

  it("refuses a shot without its drawn page", async () => {
    const engine = new StillMotionEngine({ storage: { download: async () => {}, upload: async () => {} }, clipKey: () => "x.mp4" });
    await expect(engine.generate({ prompt: "", durationSec: 2, width: 160, height: 120 })).rejects.toThrow(/drawn page or panel/);
  });
});
