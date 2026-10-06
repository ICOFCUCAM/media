/**
 * docs/38 §AW.11 regression test 2 against real FFmpeg: a 16 fps clip
 * normalized into a 24 (or 23.976 / 25 / 29.97) fps production is converted
 * exactly as the Master Clock's conform plan says — same frame count, same
 * duration, and frame by frame the same source frame. Each source frame
 * carries its index as its gray level, so the mapping can be read back.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conformRecord, FPS, planConform, sourceFrameFor, type FrameRate } from "@cineforge/shared";
import { normalizeArgs } from "./commands";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

const W = 64;
const H = 48;
let dir = "";

function ff(args: string[]): string {
  return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]).toString();
}

/** Mean luma of every frame of `file`, in order. */
function lumaPerFrame(file: string): number[] {
  const out = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"]).toString();
  return [...out.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
}

function frames(file: string): number {
  return Number(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file]).toString().trim());
}

describe.runIf(HAVE_FFMPEG)("regression test 2: 16 fps → production rate, real FFmpeg", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-conform-"));
    // 81 frames at 16 fps (5.0625 s, Wan's typical clip length); frame n has luma 16 + 2n.
    ff(["-f", "lavfi", "-i", `nullsrc=s=${W}x${H}:r=16:d=5.0625,format=yuv420p,geq=lum='16+N*2':cb=128:cr=128`,
        "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", join(dir, "wan16.mp4")]);
  }, 60_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  const rates: Array<[string, FrameRate, number]> = [
    ["24", FPS.FILM_24, 24],
    ["23.976", FPS.FILM_23_976, 23.976],
    ["25", FPS.PAL_25, 25],
    ["29.97", FPS.NTSC_29_97, 29.97],
  ];

  for (const [name, fps, fpsNumber] of rates) {
    it(`16 → ${name} fps follows the plan frame by frame`, () => {
      const out = join(dir, `out${name}.mp4`);
      const args = normalizeArgs(join(dir, "wan16.mp4"), out, { width: W, height: H, fps: fpsNumber });
      // Lossless output so the luma read-back is exact.
      ff(args.map((a) => (a === "18" ? "0" : a)).map((a) => (a === "-crf" ? "-qp" : a)));
      const plan = planConform({ num: 16, den: 1 }, 81, fps);
      expect(frames(join(dir, "wan16.mp4"))).toBe(81);
      expect(frames(out)).toBe(Number(plan.target.frameCount));
      const shown = lumaPerFrame(out).map((y) => Math.round((y - 16) / 2));
      const expected = Array.from({ length: Number(plan.target.frameCount) }, (_, i) => Number(sourceFrameFor(plan, i)));
      expect(shown).toEqual(expected);
      // Recorded as a derivative: method, rates, frames, durations, filter.
      expect(conformRecord(plan)).toMatchObject({ method: "duplicate", sourceFrames: "81", filter: args.join(" ").match(/fps=fps=[^ ,]+/)![0] });
    }, 60_000);
  }
});
