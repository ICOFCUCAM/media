/** W10 artifact verification on real media (CI job media-regression). */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ArtifactError, imageFormat, verifyAudio, verifyClip, verifyImage } from "./verify";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

describe.runIf(HAVE_FFMPEG)("artifact verification on real media", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-verify-"));
    ff(["-f", "lavfi", "-i", "testsrc2=size=1280x720", "-frames:v", "1", join(dir, "still.png")]);
    ff(["-f", "lavfi", "-i", "color=c=gray:size=1280x720", "-frames:v", "1", join(dir, "flat.png")]);
    ff(["-f", "lavfi", "-i", "testsrc2=size=320x200", "-frames:v", "1", join(dir, "tiny.jpg")]);
    ff(["-f", "lavfi", "-i", "testsrc2=size=832x480:rate=16", "-t", "2", "-pix_fmt", "yuv420p", join(dir, "clip.mp4")]);
    ff(["-f", "lavfi", "-i", "color=c=black:size=832x480:rate=16", "-t", "2", "-pix_fmt", "yuv420p", join(dir, "black.mp4")]);
    ff(["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=24000:duration=3", "-af", "volume=0.3", join(dir, "line.mp3")]);
    ff(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "3", join(dir, "silence.wav")]);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("knows images by their bytes", async () => {
    expect(imageFormat(new Uint8Array(await readFile(join(dir, "still.png"))))).toBe("png");
    expect(imageFormat(new Uint8Array(await readFile(join(dir, "tiny.jpg"))))).toBe("jpeg");
    expect(imageFormat(new TextEncoder().encode("https://cdn.example/fake.png"))).toBeNull();
  });

  it("accepts a real still and refuses a URL, a flat colour and a thumbnail", async () => {
    const ok = await verifyImage(new Uint8Array(await readFile(join(dir, "still.png"))), dir);
    expect(ok).toMatchObject({ format: "png", width: 1280, height: 720 });
    await expect(verifyImage(new TextEncoder().encode("https://cdn.example/fake.png"), dir)).rejects.toThrow(/not an image/);
    await expect(verifyImage(new Uint8Array(await readFile(join(dir, "flat.png"))), dir)).rejects.toThrow(/flat colour/);
    await expect(verifyImage(new Uint8Array(await readFile(join(dir, "tiny.jpg"))), dir)).rejects.toThrow(/smaller than 256px/);
  });

  it("accepts a real clip only when the runtime says a model ran", async () => {
    const want = { durationSec: 2, width: 832, height: 480 };
    expect(await verifyClip(join(dir, "clip.mp4"), want, true)).toMatchObject({ width: 832, height: 480, realExecution: true });
    await expect(verifyClip(join(dir, "clip.mp4"), want, false)).rejects.toThrow(/placeholder/);
    await expect(verifyClip(join(dir, "clip.mp4"), want, undefined)).rejects.toThrow(/placeholder or unknown/);
    const black = await verifyClip(join(dir, "black.mp4"), want, true).catch((e: ArtifactError) => e);
    expect(black).toBeInstanceOf(ArtifactError);
    expect((black as ArtifactError).message).toMatch(/CLIP_BLACK/);
  });

  it("accepts speech that masters to −16 LUFS and refuses silence and short audio", async () => {
    const ok = await verifyAudio(join(dir, "line.mp3"), dir, 2);
    expect(Math.abs((ok.masteredLufs as number) + 16)).toBeLessThanOrEqual(1);
    await expect(verifyAudio(join(dir, "silence.wav"), dir, 2)).rejects.toThrow(/silent/);
    await expect(verifyAudio(join(dir, "line.mp3"), dir, 5)).rejects.toThrow(/expected at least 5s/);
    await expect(verifyAudio(join(dir, "still.png"), dir, 1)).rejects.toThrow(/no audio stream/);
  });
});
