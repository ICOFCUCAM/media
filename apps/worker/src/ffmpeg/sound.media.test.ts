/**
 * Sound design against real FFmpeg (W16; Part 1 §18, §20): an effect lands
 * where it was placed, an ambience bed fills its scene and stops at its edge,
 * and a film with dialogue, ambience and effects is mixed to the sync policy's
 * delivery target. Skipped where ffmpeg is not installed (required in CI).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIX_SPECS } from "@cineforge/shared";
import { audioMixArgs, planVoicePlacement, soundStemArgs } from "./commands";
import { RenderEngine, type SceneAssets } from "./render-engine";
import type { Storage } from "../storage/storage";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let fx = "";
let out = "";
const make = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const run = async (args: string[]) => { make(args); };

/** Peak level (dB) of a window of a file. */
function peakDb(file: string, fromSec: number, durSec: number): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-ss", String(fromSec), "-t", String(durSec), "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  return !m || m[1] === "-inf" ? -120 : Number(m[1]);
}

function loudness(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const all = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  return Number(all[all.length - 1]![1]);
}

describe.runIf(HAVE_FFMPEG)("sound design with real media (W16)", () => {
  beforeAll(async () => {
    fx = await mkdtemp(join(tmpdir(), "cf-sound-"));
    for (const name of ["shot_a.mp4", "shot_b.mp4"]) make(["-f", "lavfi", "-i", "testsrc=s=160x120:d=5:r=16", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(fx, name)]);
    make(["-f", "lavfi", "-i", "anoisesrc=d=1:c=pink:a=0.3", join(fx, "bed.wav")]);
    make(["-f", "lavfi", "-i", "sine=frequency=1000:duration=0.2", "-af", "volume=0.9", join(fx, "click.wav")]);
    make(["-f", "lavfi", "-i", "sine=frequency=300:duration=4", "-c:a", "libmp3lame", join(fx, "voice.mp3")]);
  }, 60_000);
  afterAll(async () => { if (fx) await rm(fx, { recursive: true, force: true }); if (out) await rm(out, { recursive: true, force: true }); });

  it("an effect lands at its moment and nowhere else; a bed loops to its span and stops", async () => {
    const stem = join(fx, "stem.wav");
    await run(soundStemArgs([{ path: join(fx, "click.wav"), startSec: 2 }], 0, 3, stem));
    expect(peakDb(stem, 0, 1.9)).toBeLessThan(-60);
    expect(peakDb(stem, 1.95, 0.3)).toBeGreaterThan(-30); // lavfi sine runs at 1/8 amplitude
    const beds = join(fx, "beds.wav");
    await run(soundStemArgs([{ path: join(fx, "bed.wav"), startSec: 0, loopSec: 1.5, fadeSec: 0.1 }], -6, 3, beds));
    expect(peakDb(beds, 0.3, 1)).toBeGreaterThan(-30); // looped past the 1 s source
    expect(peakDb(beds, 1.7, 1.2)).toBeLessThan(-60); // silent after its scene
  }, 60_000);

  it("a film with dialogue, ambience and an effect is mixed to the delivery target", async () => {
    out = await mkdtemp(join(tmpdir(), "cf-sound-out-"));
    const storage: Storage = {
      download: (key: string, dest: string) => copyFile(join(fx, key), dest),
      upload: (src: string, key: string) => copyFile(src, join(out, key.replaceAll("/", "_"))),
      uploadDir: async () => {},
    } as unknown as Storage;
    const scenes: SceneAssets[] = [
      { sceneId: "s1", index: 0, shotKeys: ["shot_a.mp4"], voiceKey: "voice.mp3", sounds: [{ kind: "AMBIENCE", key: "bed.wav", startMs: 0, durationMs: 5000, plannedSceneMs: 5000 }] },
      { sceneId: "s2", index: 1, shotKeys: ["shot_b.mp4"], sounds: [
        { kind: "AMBIENCE", key: "bed.wav", startMs: 0, durationMs: 5000, plannedSceneMs: 5000 },
        { kind: "SFX", key: "click.wav", startMs: 2500, durationMs: 200, plannedSceneMs: 5000 },
      ] },
    ];
    await new RenderEngine(storage).renderFinal("p1", scenes, undefined, undefined, { filmSec: 10, mix: MIX_SPECS.cinematic, delivery: { integratedLufs: -16, truePeakDbtp: -1 } });
    const film = join(out, "projects_p1_film_final.mp4");
    expect(Math.abs(loudness(film) - -16)).toBeLessThan(2);
    // The effect sits where its shot lands: scene 2 starts at 5 s, the cue half-way in.
    expect(peakDb(film, 7.45, 0.3)).toBeGreaterThan(peakDb(film, 6.5, 0.3));
  }, 120_000);

  it("speech is placed at its scene's start, and music dips exactly under it (W25; §40)", async () => {
    // Scene one (0–4 s) has no narration; scene two (4–8 s) does.
    const plan = planVoicePlacement([{ startSec: 0, durSec: 4 }, { startSec: 4, durSec: 4 }], [null, 2]);
    expect(plan.voices).toEqual([{ sceneIndex: 1, startSec: 4, endSec: 6, delayedBySec: 0 }]);
    make(["-f", "lavfi", "-i", "sine=frequency=300:duration=2", join(fx, "line.wav")]);
    make(["-f", "lavfi", "-i", "anoisesrc=d=8:c=pink:a=0.3", join(fx, "score.wav")]);
    const voice = join(fx, "voice_placed.wav");
    await run(soundStemArgs([{ path: join(fx, "line.wav"), startSec: 4 }], 0, plan.endSec, voice));
    expect(peakDb(voice, 0, 3.8)).toBeLessThan(-60); // nothing before its scene
    expect(peakDb(voice, 4.1, 1.5)).toBeGreaterThan(-40);
    const mixed = join(fx, "mixed.m4a");
    await run(audioMixArgs({ music: join(fx, "score.wav"), voice }, mixed, { musicLoopSec: 8, mix: MIX_SPECS.cinematic, duckRegions: plan.duckRegions }));
    // Music alone (around 2 s) vs the music under speech (around 5 s): measured without the voice by its own copy.
    const musicOnly = join(fx, "music_only.m4a");
    const silent = join(fx, "silent.wav");
    make(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "8", silent]);
    await run(audioMixArgs({ music: join(fx, "score.wav"), voice: silent }, musicOnly, { musicLoopSec: 8, mix: MIX_SPECS.cinematic, duckRegions: plan.duckRegions, delivery: { integratedLufs: -16, truePeakDbtp: -1 } }));
    expect(peakDb(musicOnly, 1.5, 1.5) - peakDb(musicOnly, 4.5, 1.2)).toBeGreaterThan(8); // a −12 dB dip, before loudnorm's gain
  }, 60_000);
});
