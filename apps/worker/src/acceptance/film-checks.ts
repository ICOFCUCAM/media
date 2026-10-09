/**
 * The ultimate acceptance test (DirectorOS Part 2 §81): the sixteen checks a
 * finished film must pass before anyone may report
 *
 *   END_TO_END_MOVIE_PIPELINE: PASS
 *
 * Pure: every check reads FilmEvidence (./film-evidence.ts gathers it from
 * the master file — measured with ffprobe/ffmpeg — and from the database) and
 * returns pass/fail with its evidence. A check that cannot be verified fails;
 * "not measured" is never a pass.
 */

export const CHECK_IDS = [
  "file_exists", "mp4_readable", "expected_duration", "expected_resolution", "expected_fps", "audio_present",
  "av_synchronized", "loudness_valid", "no_corrupt_frames", "scenes_present", "shots_present", "character_continuity",
  "location_continuity", "generated_assets_registered", "provenance_recorded", "no_failed_jobs_hidden",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export interface FilmCheck {
  id: CheckId;
  passed: boolean;
  detail: string;
  evidence: Record<string, unknown>;
}

export interface MasterFacts {
  key: string | null;
  exists: boolean;
  bytes: number;
  sha256: string | null;
  readable: boolean;
  /** ffprobe format names, e.g. "mov,mp4,m4a,3gp,3g2,mj2". */
  container: string | null;
  hasVideo: boolean;
  hasAudio: boolean;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoStartSec: number | null;
  audioStartSec: number | null;
  videoDurationSec: number | null;
  audioDurationSec: number | null;
  loudness: { integratedLufs: number; truePeakDbtp: number | null } | null;
  /** Errors from a full decode (ffmpeg -v error … -f null -). */
  decodeErrors: string[];
  black: [number, number][];
  frozen: [number, number][];
}

export interface SceneFacts {
  id: string;
  index: number;
  status: string;
  /** Shots the plan gave this scene. */
  plannedShots: number;
  /** The plan has dialogue or narration here. */
  spoken: boolean;
  /** Ambience or SFX planned for the scene. */
  ambiencePlanned: boolean;
  voiceTrack: { key: string; durationMs: number | null } | null;
  /** Seconds of picture the scene's shots run. */
  pictureSec: number;
}

export interface ShotFacts {
  id: string;
  sceneId: string;
  index: number;
  status: string;
  videoKey: string | null;
  /** Characters / locations framed (from the plan). */
  framesCharacters: boolean;
  /** Latest recorded generation for the shot. */
  generation: { modelId: string; outcome: string | null; grantId: string | null; mediaVersionId: string | null } | null;
  /** Generations that failed with no later success for this shot. */
  unrecoveredFailures: number;
  /** A gate of the shot's latest attempt failed (a READY shot like that was accepted despite failing). */
  latestGateFailed: boolean;
  /** A media_versions row (asset video) carries the shot's current clip. */
  clipVersioned: boolean;
  /** Latest visual-gate result: its outcome and the checks that mismatched. */
  visual: { outcome: string; mismatches: string[] } | null;
}

export interface FilmEvidence {
  projectId: string;
  projectStatus: string;
  targetSec: number;
  expected: {
    width: number;
    height: number;
    fps: number;
    integratedLufs: number;
    loudnessLu: number;
    truePeakMaxDbtp: number;
    lipSyncLeadUs: number;
    lipSyncLagUs: number;
    driftUs: number;
    /** Allowed deviation of the film length (fraction). */
    durationTolerance: number;
  };
  master: MasterFacts;
  /** media_versions master row whose key is the delivered master. */
  masterVersion: { storageKey: string; sha256: string | null } | null;
  planScenes: number;
  planShots: number;
  scenes: SceneFacts[];
  shots: ShotFacts[];
  /** Film score delivered (audio_tracks MUSIC) and ambience/SFX tracks delivered. */
  musicTrack: boolean;
  sfxTracks: number;
  /** Canon continuity over the stored plan: blocking violations by kind. */
  planViolations: { code: string; kind: "character" | "location" | "other" }[];
  /** The plan's master decision (ai_decisions film_plan, outcome ok) exists for this project. */
  planDecision: boolean;
  /** Failures recorded as degradations (visible to the owner). */
  degradations: { code: string; message: string }[];
  /** A/V sync engine report for the film's latest timeline, when one exists. */
  syncReport: { passed: boolean; policy: string } | null;
}

const CHARACTER_VISUAL = new Set(["presence", "identity", "wardrobe", "injuries"]);
const LOCATION_VISUAL = new Set(["location", "time"]);
const longest = (iv: [number, number][]) => iv.reduce((a, [s, e]) => Math.max(a, e - s), 0);
const fmt = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? "unmeasured" : x.toFixed(d));

export function runFilmChecks(e: FilmEvidence): FilmCheck[] {
  const m = e.master;
  const x = e.expected;
  const C = (id: CheckId, passed: boolean, detail: string, evidence: Record<string, unknown> = {}): FilmCheck => ({ id, passed, detail, evidence });
  const ready = (s: string) => s === "READY";

  const durOk = m.durationSec !== null && Math.abs(m.durationSec - e.targetSec) <= Math.max(2, e.targetSec * x.durationTolerance);
  const startOffsetUs = m.videoStartSec !== null && m.audioStartSec !== null ? Math.round((m.audioStartSec - m.videoStartSec) * 1e6) : null;
  const lengthDiffUs = m.videoDurationSec !== null && m.audioDurationSec !== null ? Math.round(Math.abs(m.audioDurationSec - m.videoDurationSec) * 1e6) : null;
  const voiceOverruns = e.scenes.filter((s) => s.voiceTrack?.durationMs && s.voiceTrack.durationMs / 1000 > s.pictureSec + 0.5);
  const spokenWithoutVoice = e.scenes.filter((s) => s.spoken && !s.voiceTrack);
  const ambienceExpected = e.scenes.some((s) => s.ambiencePlanned);
  const inner = m.black.filter(([s, t]) => s > 1 && m.durationSec !== null && t < m.durationSec - 1);

  const charShots = e.shots.filter((s) => s.framesCharacters);
  const unreviewed = (shots: ShotFacts[]) => shots.filter((s) => !s.visual || s.visual.outcome === "skipped");
  const mismatched = (set: Set<string>) => e.shots.filter((s) => s.visual?.mismatches.some((c) => set.has(c)));
  const failedShots = e.shots.filter((s) => s.status === "FAILED" || (ready(e.projectStatus) && (!ready(s.status) || !s.videoKey)));
  // Hidden = delivered as if fine: a READY shot whose latest gate failed, or whose generation failed with no later success.
  const hiddenFailures = e.shots.filter((s) => ready(s.status) && (s.latestGateFailed || s.unrecoveredFailures > 0));

  return [
    C("file_exists", m.exists && m.bytes > 0, m.exists ? `${m.key} (${m.bytes} bytes)` : `no master file${m.key ? ` at ${m.key}` : " recorded"}`, { key: m.key, bytes: m.bytes }),
    C("mp4_readable", m.readable && m.hasVideo && /mp4|mov/.test(m.container ?? ""), m.readable ? `${m.container}, video ${m.hasVideo ? "yes" : "no"}` : "ffprobe cannot read it", { container: m.container }),
    C("expected_duration", durOk, `${fmt(m.durationSec, 1)}s for a ${e.targetSec}s film (±${Math.max(2, e.targetSec * x.durationTolerance).toFixed(0)}s)`, { durationSec: m.durationSec, targetSec: e.targetSec }),
    C("expected_resolution", m.width === x.width && m.height === x.height, `${m.width ?? "?"}×${m.height ?? "?"} delivered, ${x.width}×${x.height} expected`, { width: m.width, height: m.height }),
    C("expected_fps", m.fps !== null && Math.abs(m.fps - x.fps) < 0.01, `${fmt(m.fps, 3)} fps delivered, ${x.fps} expected`, { fps: m.fps }),
    C("audio_present",
      m.hasAudio && m.loudness !== null && m.loudness.integratedLufs > -50 && !spokenWithoutVoice.length && e.musicTrack && (!ambienceExpected || e.sfxTracks > 0),
      [
        !m.hasAudio ? "the master has no audio stream" : m.loudness === null || m.loudness.integratedLufs <= -50 ? "the audio is silent" : "sound in the master",
        spokenWithoutVoice.length ? `${spokenWithoutVoice.length} scene(s) with lines have no voice track` : null,
        e.musicTrack ? null : "no film score",
        ambienceExpected && !e.sfxTracks ? "the plan calls for ambience/SFX but none was generated" : null,
      ].filter(Boolean).join("; "),
      { voiceScenes: e.scenes.filter((s) => s.voiceTrack).length, spokenScenes: e.scenes.filter((s) => s.spoken).length, music: e.musicTrack, sfxTracks: e.sfxTracks }),
    C("av_synchronized",
      startOffsetUs !== null && startOffsetUs <= x.lipSyncLagUs && -startOffsetUs <= x.lipSyncLeadUs && lengthDiffUs !== null && lengthDiffUs <= x.driftUs
        && !voiceOverruns.length && (e.syncReport?.passed ?? true),
      [
        startOffsetUs === null ? "stream start times unmeasured" : `audio starts ${(startOffsetUs / 1000).toFixed(1)} ms after picture`,
        lengthDiffUs === null ? "stream lengths unmeasured" : `streams differ by ${(lengthDiffUs / 1000).toFixed(1)} ms`,
        voiceOverruns.length ? `${voiceOverruns.length} scene voice track(s) run past their picture` : null,
        e.syncReport ? `sync report ${e.syncReport.passed ? "passed" : "FAILED"} (${e.syncReport.policy})` : null,
      ].filter(Boolean).join("; "),
      { startOffsetUs, lengthDiffUs, voiceOverruns: voiceOverruns.map((s) => s.id), syncReport: e.syncReport }),
    C("loudness_valid",
      m.loudness !== null && Math.abs(m.loudness.integratedLufs - x.integratedLufs) <= x.loudnessLu && (m.loudness.truePeakDbtp === null ? false : m.loudness.truePeakDbtp <= x.truePeakMaxDbtp),
      m.loudness ? `${m.loudness.integratedLufs.toFixed(1)} LUFS (target ${x.integratedLufs} ±${x.loudnessLu}), true peak ${fmt(m.loudness.truePeakDbtp, 1)} dBTP (max ${x.truePeakMaxDbtp})` : "loudness unmeasured",
      { loudness: m.loudness }),
    C("no_corrupt_frames", m.readable && !m.decodeErrors.length && longest(inner) <= 2 && longest(m.frozen) <= 3,
      [m.decodeErrors.length ? `${m.decodeErrors.length} decode error(s): ${m.decodeErrors[0]}` : "decodes cleanly",
        longest(inner) > 2 ? `a ${longest(inner).toFixed(1)}s black run inside the film` : null,
        longest(m.frozen) > 3 ? `a ${longest(m.frozen).toFixed(1)}s frozen run` : null].filter(Boolean).join("; "),
      { decodeErrors: m.decodeErrors.slice(0, 5), longestInnerBlack: longest(inner), longestFrozen: longest(m.frozen) }),
    C("scenes_present", e.planScenes > 0 && e.scenes.length === e.planScenes && e.scenes.every((s) => ready(s.status)),
      `${e.scenes.filter((s) => ready(s.status)).length} of ${e.planScenes} planned scenes READY (${e.scenes.length} in the database)`,
      { notReady: e.scenes.filter((s) => !ready(s.status)).map((s) => `${s.index}:${s.status}`) }),
    C("shots_present", e.planShots > 0 && e.shots.length === e.planShots && e.shots.every((s) => ready(s.status) && s.videoKey),
      `${e.shots.filter((s) => ready(s.status) && s.videoKey).length} of ${e.planShots} planned shots READY with a clip`,
      { missing: e.shots.filter((s) => !ready(s.status) || !s.videoKey).map((s) => s.id) }),
    C("character_continuity",
      !e.planViolations.some((v) => v.kind === "character") && !mismatched(CHARACTER_VISUAL).length && !unreviewed(charShots).length,
      [
        `${e.planViolations.filter((v) => v.kind === "character").length} canon violation(s) in the plan`,
        `${mismatched(CHARACTER_VISUAL).length} shot(s) whose frame contradicts a character's canon`,
        `${unreviewed(charShots).length} of ${charShots.length} character shot(s) never visually reviewed`,
      ].join("; "),
      { planViolations: e.planViolations.filter((v) => v.kind === "character"), mismatched: mismatched(CHARACTER_VISUAL).map((s) => s.id), unreviewed: unreviewed(charShots).map((s) => s.id) }),
    C("location_continuity",
      !e.planViolations.some((v) => v.kind === "location") && !mismatched(LOCATION_VISUAL).length && !unreviewed(e.shots).length,
      [
        `${e.planViolations.filter((v) => v.kind === "location").length} location/time violation(s) in the plan`,
        `${mismatched(LOCATION_VISUAL).length} shot(s) whose frame shows the wrong place or time`,
        `${unreviewed(e.shots).length} of ${e.shots.length} shot(s) never visually reviewed`,
      ].join("; "),
      { mismatched: mismatched(LOCATION_VISUAL).map((s) => s.id), unreviewed: unreviewed(e.shots).map((s) => s.id) }),
    C("generated_assets_registered",
      e.masterVersion !== null && e.masterVersion.storageKey === m.key && (!m.sha256 || e.masterVersion.sha256 === m.sha256) && e.shots.every((s) => s.clipVersioned),
      [
        e.masterVersion ? (e.masterVersion.storageKey === m.key ? "master versioned" : `the newest master version is ${e.masterVersion.storageKey}, not the delivered ${m.key}`) : "the master has no media version",
        e.masterVersion && m.sha256 && e.masterVersion.sha256 !== m.sha256 ? "the recorded sha256 does not match the delivered file" : null,
        `${e.shots.filter((s) => s.clipVersioned).length} of ${e.shots.length} clips versioned`,
      ].filter(Boolean).join("; "),
      { masterVersion: e.masterVersion, unversioned: e.shots.filter((s) => !s.clipVersioned).map((s) => s.id) }),
    C("provenance_recorded",
      e.planDecision && e.shots.every((s) => s.generation !== null && s.generation.mediaVersionId !== null),
      `${e.planDecision ? "plan decision logged" : "no logged plan decision"}; ${e.shots.filter((s) => s.generation).length} of ${e.shots.length} shots have a recorded generation`,
      { withoutGeneration: e.shots.filter((s) => !s.generation || !s.generation.mediaVersionId).map((s) => s.id) }),
    C("no_failed_jobs_hidden", !failedShots.length && !hiddenFailures.length && ready(e.projectStatus),
      [
        `project ${e.projectStatus}`,
        failedShots.length ? `${failedShots.length} shot(s) failed or missing in a delivered film` : null,
        hiddenFailures.length ? `${hiddenFailures.length} READY shot(s) whose latest gate or generation failed` : null,
        e.degradations.length ? `${e.degradations.length} degradation(s) recorded and shown: ${[...new Set(e.degradations.map((d) => d.code))].join(", ")}` : "no degradations",
      ].filter(Boolean).join("; "),
      { failedShots: failedShots.map((s) => s.id), hidden: hiddenFailures.map((s) => s.id), degradations: e.degradations }),
  ];
}

export function filmVerdict(checks: FilmCheck[]): "PASS" | "FAIL" {
  return checks.length === CHECK_IDS.length && checks.every((c) => c.passed) ? "PASS" : "FAIL";
}

export function formatFilmChecks(checks: FilmCheck[]): string {
  return [
    ...checks.map((c) => `${c.passed ? "✓" : "✗"} ${c.id.replace(/_/g, " ").padEnd(28)} ${c.detail}`),
    "",
    `END_TO_END_MOVIE_PIPELINE: ${filmVerdict(checks)}`,
  ].join("\n");
}
