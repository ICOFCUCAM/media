/**
 * Regression test 1 against real FFmpeg and real media (docs/38 §AW.11):
 * narration longer than the picture must never be silently cut, and a short
 * narration must never cut the picture. Skipped where ffmpeg is not installed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { NarrationOverrunError } from "./commands";
import { RenderEngine, type SceneAssets } from "./render-engine";
import type { Storage } from "../storage/storage";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
// CI job `media-regression` sets REQUIRE_FFMPEG=1 so this can never pass by being skipped.
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let fixtures = "";
let out = "";

/** Storage stand-in: keys are fixture file names; uploads land in `out`. */
const storage: Storage = {
  download: (key, dest) => copyFile(join(fixtures, key), dest),
  upload: (src, key) => copyFile(src, join(out, key.replaceAll("/", "_"))),
  uploadDir: async () => {},
};

function make(args: string[]) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
}

function streamDuration(file: string, stream: "v:0" | "a:0"): number {
  const o = execFileSync("ffprobe", ["-v", "error", "-select_streams", stream, "-show_entries", "stream=duration", "-of", "csv=p=0", file]).toString();
  return Number.parseFloat(o.trim());
}

const scenes = (voiceKey: string): SceneAssets[] => [
  { sceneId: "s1", index: 0, shotKeys: ["shot_a.mp4", "shot_b.mp4"], voiceKey },
];

describe.runIf(HAVE_FFMPEG)("render engine — narration fit with real media", () => {
  beforeAll(async () => {
    fixtures = await mkdtemp(join(tmpdir(), "cf-fixtures-"));
    // Picture: two 1.5 s shots = 3.0 s. Narration: 5.0 s (overrun) and 1.0 s (short).
    for (const name of ["shot_a.mp4", "shot_b.mp4"]) {
      make(["-f", "lavfi", "-i", "testsrc=s=160x120:d=1.5:r=16", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(fixtures, name)]);
    }
    make(["-f", "lavfi", "-i", "sine=frequency=440:duration=5", "-c:a", "libmp3lame", join(fixtures, "voice_long.mp3")]);
    make(["-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libmp3lame", join(fixtures, "voice_short.mp3")]);
  }, 60_000);

  afterAll(async () => {
    if (fixtures) await rm(fixtures, { recursive: true, force: true });
  });

  afterEach(async () => {
    delete process.env.RENDER_NARRATION_OVERRUN;
    if (out) await rm(out, { recursive: true, force: true });
  });

  const render = async (voiceKey: string) => {
    out = await mkdtemp(join(tmpdir(), "cf-out-"));
    await new RenderEngine(storage).renderFinal("p1", scenes(voiceKey));
    return join(out, "projects_p1_film_final.mp4");
  };

  it("regression test 1: narration longer than the picture fails the render instead of being cut", async () => {
    await expect(render("voice_long.mp3")).rejects.toBeInstanceOf(NarrationOverrunError);
  }, 60_000);

  it("explicit extend policy: the film runs until the narration ends; nothing is cut", async () => {
    process.env.RENDER_NARRATION_OVERRUN = "extend";
    const film = await render("voice_long.mp3");
    expect(streamDuration(film, "a:0")).toBeGreaterThanOrEqual(4.9);
    expect(streamDuration(film, "v:0")).toBeGreaterThanOrEqual(4.9);
  }, 60_000);

  it("short narration keeps the full picture (the old -shortest cut the video)", async () => {
    const film = await render("voice_short.mp3");
    expect(streamDuration(film, "v:0")).toBeGreaterThanOrEqual(2.9);
  }, 60_000);
});
