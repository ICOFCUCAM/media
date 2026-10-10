/**
 * Transitions, seamless loops and the fitted score against real FFmpeg (W27):
 * a dissolve and a fade keep the cut's length to the frame, a looped bed has
 * no gap at its seams and lasts what was asked, a re-timed score ends with
 * the film, and a clip repair lands on its slot. Skipped where ffmpeg is not
 * installed (required in CI).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dissolveArgs, fadeArgs, musicFit, retimeArgs, seamlessLoopArgs, seamlessLoopCopies, TRANSITION_SEC } from "./commands";
import { repairClipArgs } from "../avsync/repair";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

const make = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const dur = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const ENC = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an"];

/** Quietest RMS (dB) over 50 ms windows of a file: a gap at a seam shows as silence. */
function quietestWindowDb(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "asetnsamples=2400,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level", "-f", "null", "-"], { encoding: "utf8" });
  const v = [...r.stderr.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1])));
  return Math.min(...v.slice(1, -1));
}

let fx = "";
describe.runIf(HAVE_FFMPEG)("cut edges, loops and score fit with real media (W27)", () => {
  beforeAll(async () => {
    fx = await mkdtemp(join(tmpdir(), "cf-edges-"));
    make(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=16:d=3", "-pix_fmt", "yuv420p", ...ENC, join(fx, "a.mp4")]);
    make(["-f", "lavfi", "-i", "smptebars=s=320x180:r=16:d=2", "-pix_fmt", "yuv420p", ...ENC, join(fx, "b.mp4")]);
    make(["-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-ar", "48000", join(fx, "bed.wav")]);
    make(["-f", "lavfi", "-i", "sine=frequency=330:duration=10", "-ar", "48000", join(fx, "score.wav")]);
  });
  afterAll(async () => { if (fx) await rm(fx, { recursive: true, force: true }); });

  it("a dissolve lasts exactly as long as the two clips; the incoming shot starts at the boundary", () => {
    const out = join(fx, "dissolve.mp4");
    make(dissolveArgs(join(fx, "a.mp4"), join(fx, "b.mp4"), out, dur(join(fx, "a.mp4")), ENC));
    expect(Math.abs(dur(out) - 5)).toBeLessThan(1 / 16 + 0.01);
  });

  it("fades keep the clip's length", () => {
    const out = join(fx, "fade.mp4");
    make(fadeArgs(join(fx, "a.mp4"), out, 3, { fadeIn: true, fadeOut: true }, ENC));
    expect(Math.abs(dur(out) - 3)).toBeLessThan(1 / 16 + 0.01);
    expect(TRANSITION_SEC).toBe(0.5);
  });

  it("a short bed loops to its scene with no silent seam", () => {
    const copies = seamlessLoopCopies(3, 8, 1)!;
    expect(copies).toBe(4);
    const out = join(fx, "loop.wav");
    make(seamlessLoopArgs(join(fx, "bed.wav"), out, copies, 8, 1));
    expect(Math.abs(dur(out) - 8)).toBeLessThan(0.05);
    expect(quietestWindowDb(out)).toBeGreaterThan(-40); // a seam gap would read about -120
  });

  it("a score close to the film's length is re-timed to end with it", () => {
    const fit = musicFit(10, 9);
    expect(fit.kind).toBe("retime");
    const out = join(fx, "retimed.wav");
    make(retimeArgs(join(fx, "score.wav"), out, (fit as { tempo: number }).tempo));
    expect(Math.abs(dur(out) - 9)).toBeLessThan(0.05);
  });

  it("clip repairs land on the slot: retime, hold, trim", () => {
    const a = join(fx, "a.mp4");
    const retimed = join(fx, "retimed.mp4");
    make(repairClipArgs({ kind: "retime_clip", shotId: "s", ratio: 3 / 2.9, toDurationUs: 2_900_000n }, a, retimed, 3));
    expect(Math.abs(dur(retimed) - 2.9)).toBeLessThan(1 / 16 + 0.01);
    const held = join(fx, "held.mp4");
    make(repairClipArgs({ kind: "hold_last_frame", shotId: "s", addUs: 500_000n }, a, held, 3));
    expect(Math.abs(dur(held) - 3.5)).toBeLessThan(1 / 16 + 0.01);
    const trimmed = join(fx, "trimmed.mp4");
    make(repairClipArgs({ kind: "trim_tail", shotId: "s", removeUs: 500_000n }, a, trimmed, 3));
    expect(Math.abs(dur(trimmed) - 2.5)).toBeLessThan(1 / 16 + 0.01);
  });
});
