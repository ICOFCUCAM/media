import { describe, expect, it } from "vitest";
import { CHECK_IDS, filmVerdict, formatFilmChecks, runFilmChecks, type CheckId, type FilmEvidence, type ShotFacts } from "./film-checks";

const shot = (i: number, o: Partial<ShotFacts> = {}): ShotFacts => ({
  id: `shot-${i}`, sceneId: `scene-${Math.floor(i / 3)}`, index: i % 3, status: "READY", videoKey: `projects/p/video/${i}.mp4`, framesCharacters: i % 3 !== 0,
  generation: { modelId: "wan-2.1", outcome: "ACCEPTED", grantId: `g${i}`, mediaVersionId: `mv${i}` }, unrecoveredFailures: 0, latestGateFailed: false,
  clipVersioned: true, visual: { outcome: "pass", mismatches: [] }, ...o,
});

/** A film that deserves PASS: 180 s, 1280×720 @ 16 fps, −16 LUFS, every shot reviewed and versioned. */
export function passingEvidence(): FilmEvidence {
  return {
    projectId: "p", projectStatus: "READY", targetSec: 180,
    expected: { width: 1280, height: 720, fps: 16, integratedLufs: -16, loudnessLu: 1, truePeakMaxDbtp: -1, lipSyncLeadUs: 45_000, lipSyncLagUs: 125_000, driftUs: 40_000, durationTolerance: 0.1 },
    master: {
      key: "projects/p/film/v1/final.mp4", exists: true, bytes: 48_000_000, sha256: "a".repeat(64), readable: true, container: "mov,mp4,m4a,3gp,3g2,mj2",
      hasVideo: true, hasAudio: true, durationSec: 181.2, width: 1280, height: 720, fps: 16, videoStartSec: 0, audioStartSec: 0,
      videoDurationSec: 181.2, audioDurationSec: 181.21, loudness: { integratedLufs: -16.3, truePeakDbtp: -1.6 }, decodeErrors: [], black: [[0, 0.4]], frozen: [],
    },
    masterVersion: { storageKey: "projects/p/film/v1/final.mp4", sha256: "a".repeat(64) },
    planScenes: 12, planShots: 36,
    scenes: Array.from({ length: 12 }, (_, i) => ({
      id: `scene-${i}`, index: i, status: "READY", plannedShots: 3, spoken: i % 2 === 0, ambiencePlanned: true,
      voiceTrack: i % 2 === 0 ? { key: `scenes/${i}/voice.wav`, durationMs: 9000 } : null, pictureSec: 15,
    })),
    shots: Array.from({ length: 36 }, (_, i) => shot(i)),
    musicTrack: true, sfxTracks: 12, planViolations: [], planDecision: true, degradations: [], syncReport: { passed: true, policy: "cinematic@1" },
  };
}

function failing(mutate: (e: FilmEvidence) => void): CheckId[] {
  const e = passingEvidence();
  mutate(e);
  return runFilmChecks(e).filter((c) => !c.passed).map((c) => c.id);
}

describe("the sixteen checks of Part 2 §81.2", () => {
  it("a complete, verified film passes all sixteen", () => {
    const checks = runFilmChecks(passingEvidence());
    expect(checks.map((c) => c.id)).toEqual([...CHECK_IDS]);
    expect(checks.filter((c) => !c.passed)).toEqual([]);
    expect(filmVerdict(checks)).toBe("PASS");
    expect(formatFilmChecks(checks)).toMatch(/END_TO_END_MOVIE_PIPELINE: PASS$/);
  });

  it.each<[CheckId, (e: FilmEvidence) => void]>([
    ["file_exists", (e) => { e.master.exists = false; e.master.bytes = 0; }],
    ["mp4_readable", (e) => { e.master.container = "matroska,webm"; }],
    ["expected_duration", (e) => { e.master.durationSec = 95; }],
    ["expected_resolution", (e) => { e.master.width = 832; e.master.height = 480; }],
    ["expected_fps", (e) => { e.master.fps = 24; }],
    ["audio_present", (e) => { e.sfxTracks = 0; }],
    ["av_synchronized", (e) => { e.master.audioStartSec = 0.2; }],
    ["loudness_valid", (e) => { e.master.loudness = { integratedLufs: -23, truePeakDbtp: -3 }; }],
    ["no_corrupt_frames", (e) => { e.master.decodeErrors = ["[h264 @ 0x1] error while decoding MB 12 30"]; }],
    ["scenes_present", (e) => { e.scenes = e.scenes.slice(0, 11); }],
    ["shots_present", (e) => { e.shots[7]!.videoKey = null; }],
    ["character_continuity", (e) => { e.shots[4]!.visual = { outcome: "warn", mismatches: ["wardrobe"] }; }],
    ["location_continuity", (e) => { e.shots[3]!.visual = { outcome: "warn", mismatches: ["location"] }; }],
    ["generated_assets_registered", (e) => { e.shots[2]!.clipVersioned = false; }],
    ["provenance_recorded", (e) => { e.shots[5]!.generation = null; }],
    ["no_failed_jobs_hidden", (e) => { e.shots[9]!.latestGateFailed = true; }],
  ])("%s fails on its own defect", (id, mutate) => {
    expect(failing(mutate)).toContain(id);
    expect(failing(mutate).length).toBeLessThanOrEqual(2);
  });

  it("nothing unmeasured passes: no loudness, no stream times, no review", () => {
    expect(failing((e) => { e.master.loudness = null; })).toEqual(expect.arrayContaining(["audio_present", "loudness_valid"]));
    expect(failing((e) => { e.master.audioStartSec = null; })).toContain("av_synchronized");
    expect(failing((e) => { e.shots.forEach((s) => { s.visual = { outcome: "skipped", mismatches: [] }; }); })).toEqual(["character_continuity", "location_continuity"]);
    expect(failing((e) => { e.master.loudness = { integratedLufs: -16, truePeakDbtp: null }; })).toContain("loudness_valid");
  });

  it("missing sound design is a failure, named — SFX has no generator yet", () => {
    const c = runFilmChecks({ ...passingEvidence(), sfxTracks: 0 }).find((x) => x.id === "audio_present")!;
    expect(c.detail).toMatch(/ambience\/SFX but none was generated/);
  });

  it("a voice track longer than its scene breaks sync; a failed timeline report too", () => {
    expect(failing((e) => { e.scenes[0]!.voiceTrack = { key: "v", durationMs: 19_000 }; })).toContain("av_synchronized");
    expect(failing((e) => { e.syncReport = { passed: false, policy: "cinematic@1" }; })).toContain("av_synchronized");
  });

  it("recorded degradations are not hidden failures, but a failed shot in a delivered film is", () => {
    expect(failing((e) => { e.degradations = [{ code: "QUALITY_FLAGGED", message: "x" }]; })).toEqual([]);
    expect(failing((e) => { e.shots[1]!.status = "FAILED"; })).toEqual(expect.arrayContaining(["shots_present", "no_failed_jobs_hidden"]));
    expect(failing((e) => { e.projectStatus = "FAILED"; })).toContain("no_failed_jobs_hidden");
  });

  it("the master version must be the delivered file", () => {
    expect(failing((e) => { e.masterVersion = { storageKey: "projects/p/film/v0/final.mp4", sha256: "a".repeat(64) }; })).toEqual(["generated_assets_registered"]);
    expect(failing((e) => { e.masterVersion = { storageKey: e.master.key!, sha256: "b".repeat(64) }; })).toEqual(["generated_assets_registered"]);
  });

  it("fifteen of sixteen is FAIL", () => {
    const checks = runFilmChecks(passingEvidence());
    expect(filmVerdict(checks.slice(0, 15))).toBe("FAIL");
  });
});
