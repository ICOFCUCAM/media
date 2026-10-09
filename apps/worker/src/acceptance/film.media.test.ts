/**
 * W10 film acceptance on real media (CI job media-regression): a master built
 * with FFmpeg, measured by the same gatherer the live test uses, judged by the
 * sixteen checks. The database is a fake holding what a finished film records.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixturePackage } from "@cineforge/movie";
import { sha256File } from "../ffmpeg/analysis";
import { filmVerdict, runFilmChecks, type CheckId } from "./film-checks";
import { gatherFilmEvidence, measureMaster, type FilmEvidenceDb } from "./film-evidence";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const SEC = 36; // the fixture film: 2 scenes × 18 s

/** A delivered master: 832×480 @ 16 fps, picture and sound from t=0, sound mastered to −16 LUFS. */
function master(out: string, o: { fps?: number; audio?: boolean; blackFrom?: number; seconds?: number } = {}) {
  const fps = o.fps ?? 16;
  const seconds = o.seconds ?? SEC;
  const video = o.blackFrom !== undefined
    ? `[0]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,${o.blackFrom},${o.blackFrom + 4})'[v]`
    : "[0]null[v]";
  const audio = o.audio === false ? [] : ["-f", "lavfi", "-i", `anoisesrc=color=pink:amplitude=0.2:sample_rate=48000:duration=${seconds}:seed=11`];
  ff([
    "-f", "lavfi", "-i", `testsrc2=size=832x480:rate=${fps}:duration=${seconds}`, ...audio,
    "-filter_complex", o.audio === false ? video : `${video};[1]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`,
    "-map", "[v]", ...(o.audio === false ? [] : ["-map", "[a]", "-c:a", "aac", "-b:a", "160k"]),
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-t", String(seconds), out,
  ]);
}

const MASTER_KEY = "projects/p/film/v1/final.mp4";

function fakeDb(masterSha: string, o: { sfx?: boolean } = {}): FilmEvidenceDb {
  const pkg = fixturePackage();
  const scenes = pkg.scenes.map((s, si) => ({
    id: `scene-${si}`, index: si, status: "READY",
    shots: s.shots.map((sh) => ({ id: `shot-${si}-${sh.index}`, index: sh.index, status: "READY", videoKey: `projects/p/video/${si}-${sh.index}.mp4`, durationSec: sh.durationSec })),
    audioTracks: [
      { kind: "VOICE", key: `scenes/${si}/voice.wav`, durationMs: 3000 },
      ...(si === 0 ? [{ kind: "MUSIC", key: "scenes/0/score.wav", durationMs: null }] : []),
      ...(o.sfx === false ? [] : [{ kind: "SFX", key: `scenes/${si}/sfx.wav`, durationMs: 18_000 }]),
    ],
  }));
  const shots = scenes.flatMap((s) => s.shots);
  return {
    project: { findUnique: async () => ({ id: "p", status: "READY", targetSeconds: SEC, resolution: "480p", aspectRatio: "16:9" }) },
    film: { findUnique: async () => ({ mp4Key: MASTER_KEY }) },
    screenplay: { findUnique: async () => ({ raw: { package: pkg } }) },
    scene: { findMany: async () => scenes },
    videoGeneration: { findMany: async () => shots.map((sh, i) => ({ shotId: sh.id, modelId: "wan-2.1", outcome: "ACCEPTED", grantId: `g${i}`, mediaVersionId: `mv${i}`, createdAt: new Date(i) })) },
    mediaVersion: { findMany: async () => [
      ...shots.map((sh) => ({ assetType: "video", assetId: sh.id, storageKey: sh.videoKey, sha256: null, version: 1 })),
      { assetType: "master", assetId: "p", storageKey: MASTER_KEY, sha256: masterSha, version: 1 },
    ] },
    qualityGateResult: { findMany: async () => shots.flatMap((sh) => [
      { refId: sh.id, gate: "technical", outcome: "pass", findings: [], attempt: 1, createdAt: new Date(0) },
      { refId: sh.id, gate: "visual", outcome: "pass", findings: [], attempt: 1, createdAt: new Date(0) },
    ]) },
    aiDecision: { count: async () => 1 },
    productionDegradation: { findMany: async () => [] },
    productionTimeline: { findFirst: async () => null },
    avSyncReport: { findFirst: async () => null },
  };
}

const failed = (checks: ReturnType<typeof runFilmChecks>): CheckId[] => checks.filter((c) => !c.passed).map((c) => c.id);

describe.runIf(HAVE_FFMPEG)("film acceptance on a real master", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-accept-media-"));
    master(join(dir, "good.mp4"));
    master(join(dir, "fps24.mp4"), { fps: 24 });
    master(join(dir, "silent.mp4"), { audio: false });
    master(join(dir, "blackout.mp4"), { blackFrom: 12 });
    // A truncated upload: the file stops halfway.
    const full = await readFile(join(dir, "good.mp4"));
    await writeFile(join(dir, "truncated.mp4"), full.subarray(0, Math.floor(full.length / 2)));
    // Bit rot in the middle of the media data; the index (at the end) survives.
    const damaged = Buffer.from(full);
    for (let i = Math.floor(damaged.length * 0.3); i < Math.floor(damaged.length * 0.3) + 200_000; i += 7) damaged[i] = (damaged[i]! * 31 + 17) & 0xff;
    await writeFile(join(dir, "damaged.mp4"), damaged);
  }, 120_000);
  afterAll(() => rm(dir, { recursive: true, force: true }));

  const gather = async (file: string, db?: FilmEvidenceDb) => {
    const sha = await sha256File(join(dir, "good.mp4"));
    const work = await mkdtemp(join(dir, "w-"));
    return gatherFilmEvidence(db ?? fakeDb(sha), "p", (_k, to) => copyFile(join(dir, file), to), work, {});
  };

  it("a complete film on real media passes all sixteen checks", async () => {
    const e = await gather("good.mp4");
    expect(e.master).toMatchObject({ readable: true, width: 832, height: 480, fps: 16, hasAudio: true, decodeErrors: [] });
    expect(Math.abs(e.master.loudness!.integratedLufs + 16)).toBeLessThanOrEqual(1);
    const checks = runFilmChecks(e);
    expect(failed(checks)).toEqual([]);
    expect(filmVerdict(checks)).toBe("PASS");
  }, 60_000);

  it("the wrong frame rate fails expected_fps (and the version hash no longer matches)", async () => {
    expect(failed(runFilmChecks(await gather("fps24.mp4")))).toEqual(["expected_fps", "generated_assets_registered"]);
  }, 60_000);

  it("a silent master fails sound, loudness and sync", async () => {
    expect(failed(runFilmChecks(await gather("silent.mp4")))).toEqual(expect.arrayContaining(["audio_present", "av_synchronized", "loudness_valid"]));
  }, 60_000);

  it("a four-second blackout inside the film is a corrupt picture", async () => {
    expect(failed(runFilmChecks(await gather("blackout.mp4")))).toContain("no_corrupt_frames");
  }, 60_000);

  it("a truncated upload is unreadable: the MP4 index is gone", async () => {
    const checks = runFilmChecks(await gather("truncated.mp4"));
    expect(checks.find((c) => c.id === "file_exists")?.passed).toBe(true);
    expect(failed(checks)).toEqual(expect.arrayContaining(["mp4_readable", "expected_duration", "no_corrupt_frames"]));
  }, 60_000);

  it("damage inside the picture data is caught by decoding every frame, not by trusting the header", async () => {
    const m = await measureMaster(join(dir, "damaged.mp4"), "k");
    expect(m.readable).toBe(true);
    expect(m.decodeErrors.length).toBeGreaterThan(0);
    expect(failed(runFilmChecks(await gather("damaged.mp4")))).toContain("no_corrupt_frames");
  }, 60_000);

  it("a missing file fails file_exists and everything measured from it", async () => {
    const sha = await sha256File(join(dir, "good.mp4"));
    const e = await gatherFilmEvidence(fakeDb(sha), "p", async () => { throw new Error("NoSuchKey"); }, await mkdtemp(join(dir, "w-")), {});
    expect(failed(runFilmChecks(e))).toEqual(expect.arrayContaining(["file_exists", "mp4_readable", "expected_duration", "loudness_valid"]));
  }, 60_000);

  it("no SFX for a plan that asks for ambience fails audio_present", async () => {
    const sha = await sha256File(join(dir, "good.mp4"));
    expect(failed(runFilmChecks(await gather("good.mp4", fakeDb(sha, { sfx: false }))))).toEqual(["audio_present"]);
  }, 60_000);
});
