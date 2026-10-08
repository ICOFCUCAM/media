/** Frame extraction for the Visual Reviewer against real media (CI job media-regression). */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ffmpeg, probeDuration } from "../ffmpeg/ffmpeg";
import { frameGrabber } from "./visual-gate";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";

describe.runIf(HAVE_FFMPEG)("Visual Reviewer frame grab with real media", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-frame-"));
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=1280x720:r=24:d=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "clip.mp4")]);
  }, 60_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("returns one mid-clip JPEG, scaled to 768 px wide", async () => {
    const grab = frameGrabber((_key, dest) => copyFile(join(dir, "clip.mp4"), dest), (args) => ffmpeg(args), probeDuration);
    const img = await grab("projects/p/shots/s.mp4");
    expect(img.mediaType).toBe("image/jpeg");
    const bytes = Buffer.from(img.data, "base64");
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]); // JPEG SOI
    const out = join(dir, "check.jpg");
    await import("node:fs/promises").then((fs) => fs.writeFile(out, bytes));
    const w = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out]).toString().trim();
    expect(w).toBe("768,432");
  });
});
