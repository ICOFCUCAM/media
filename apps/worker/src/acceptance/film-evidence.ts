/**
 * Evidence for the film acceptance test (Part 2 §81): the delivered master
 * measured with ffprobe/ffmpeg, and what the database says was planned,
 * generated, versioned, reviewed and degraded. ./film-checks.ts judges it.
 */
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { checkFilmContinuity, FilmPackage } from "@cineforge/movie";
import { outputDimensions, syncPolicy } from "@cineforge/shared";
import { measureBlack, measureFreezes, measureLoudness, sha256File } from "../ffmpeg/analysis";
import { masterFormat } from "../ffmpeg/render-engine";
import type { FilmEvidence, MasterFacts, SceneFacts, ShotFacts } from "./film-checks";

const run = promisify(execFile);
const sec = (us: bigint) => Number(us) / 1e6;

function rate(r: string | undefined): number | null {
  const m = /^(\d+)\/(\d+)$/.exec(r ?? "");
  if (!m || Number(m[2]) === 0) return null;
  return +(Number(m[1]) / Number(m[2])).toFixed(3);
}

/** Everything §81 asks of the master file, measured. An unreadable file is a fact, not an exception. */
export async function measureMaster(path: string, key: string | null): Promise<MasterFacts> {
  const empty: MasterFacts = {
    key, exists: false, bytes: 0, sha256: null, readable: false, container: null, hasVideo: false, hasAudio: false, durationSec: null,
    width: null, height: null, fps: null, videoStartSec: null, audioStartSec: null, videoDurationSec: null, audioDurationSec: null,
    loudness: null, decodeErrors: [], black: [], frozen: [],
  };
  const st = await stat(path).catch(() => null);
  if (!st) return empty;
  const base = { ...empty, exists: true, bytes: st.size, sha256: await sha256File(path) };
  let probe: { streams?: Record<string, string | number>[]; format?: { format_name?: string; duration?: string } };
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries",
      "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,start_time,duration:format=format_name,duration", "-of", "json", path]);
    probe = JSON.parse(stdout);
  } catch {
    return base;
  }
  const v = probe.streams?.find((s) => s.codec_type === "video");
  const a = probe.streams?.find((s) => s.codec_type === "audio");
  const num = (x: unknown) => (x === undefined || x === null || x === "N/A" ? null : Number(x));
  const durationSec = num(probe.format?.duration);
  const total = durationSec === null ? undefined : BigInt(Math.round(durationSec * 1e6));
  const [loud, black, frozen, decode] = await Promise.all([
    a ? measureLoudness(path).catch(() => null) : Promise.resolve(null),
    v ? measureBlack(path).catch(() => []) : Promise.resolve([]),
    v ? measureFreezes(path, total).catch(() => []) : Promise.resolve([]),
    run("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"], { maxBuffer: 16 * 1024 * 1024 }).then((r) => r.stderr).catch((e: { stderr?: string }) => e.stderr ?? "decode failed"),
  ]);
  return {
    ...base,
    readable: Boolean(v || a),
    container: probe.format?.format_name ?? null,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    durationSec,
    width: num(v?.width),
    height: num(v?.height),
    fps: rate(String(v?.avg_frame_rate && v.avg_frame_rate !== "0/0" ? v.avg_frame_rate : v?.r_frame_rate ?? "")),
    videoStartSec: num(v?.start_time),
    audioStartSec: num(a?.start_time),
    videoDurationSec: num(v?.duration),
    audioDurationSec: num(a?.duration),
    loudness: loud ? { integratedLufs: loud.integratedLufs, truePeakDbtp: loud.truePeakDbtp ?? null } : null,
    decodeErrors: decode.split("\n").map((l) => l.trim()).filter(Boolean),
    black: black.map((i) => [sec(i.startUs), sec(i.endUs)] as [number, number]),
    frozen: frozen.map((i) => [sec(i.startUs), sec(i.endUs)] as [number, number]),
  };
}

const CHARACTER_CODES = /CHARACTER|WARDROBE|INJURY|PHYSICAL|AGE|HAIR|FACE|BODY|MARK|EMOTION|PROP_HELD|KNOWLEDGE|DEAD/;
const LOCATION_CODES = /LOCATION|TIME_MISMATCH/;

/** The stored plan's blocking continuity violations, sorted into character / location / other. */
export function planViolations(pkg: FilmPackage): FilmEvidence["planViolations"] {
  return checkFilmContinuity(pkg).flatMap((x) => x.result.violations.filter((v) => v.severity === "blocking").map((v) => ({
    code: v.code,
    kind: LOCATION_CODES.test(v.code) ? "location" as const : CHARACTER_CODES.test(v.code) ? "character" as const : "other" as const,
  })));
}

/** The database reads the gatherer needs (Prisma-shaped; faked in tests). */
export interface FilmEvidenceDb {
  project: { findUnique(a: unknown): Promise<{ id: string; status: string; targetSeconds: number; resolution: string; aspectRatio: string } | null> };
  film: { findUnique(a: unknown): Promise<{ mp4Key: string } | null> };
  screenplay: { findUnique(a: unknown): Promise<{ raw: unknown } | null> };
  scene: { findMany(a: unknown): Promise<Array<{ id: string; index: number; status: string; shots: Array<{ id: string; index: number; status: string; videoKey: string | null; durationSec: number }>; audioTracks: Array<{ kind: string; key: string; durationMs: number | null }> }>> };
  videoGeneration: { findMany(a: unknown): Promise<Array<{ shotId: string | null; modelId: string; outcome: string | null; grantId: string | null; mediaVersionId: string | null; createdAt: Date }>> };
  mediaVersion: { findMany(a: unknown): Promise<Array<{ assetType: string; assetId: string; storageKey: string; sha256: string | null; version: number }>> };
  qualityGateResult: { findMany(a: unknown): Promise<Array<{ refId: string; gate: string; outcome: string; findings: unknown; attempt: number; createdAt: Date }>> };
  aiDecision: { count(a: unknown): Promise<number> };
  productionDegradation: { findMany(a: unknown): Promise<Array<{ code: string; message: string }>> };
  productionTimeline: { findFirst(a: unknown): Promise<{ id: string } | null> };
  avSyncReport: { findFirst(a: unknown): Promise<{ passed: boolean; policy: string } | null> };
}

const FAILED_GENERATION = new Set(["FAILED", "REQUIRES_REGENERATION"]);

export async function gatherFilmEvidence(
  db: FilmEvidenceDb,
  projectId: string,
  download: (key: string, to: string) => Promise<void>,
  dir: string,
  env: Record<string, string | undefined> = process.env,
): Promise<FilmEvidence> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, status: true, targetSeconds: true, resolution: true, aspectRatio: true } });
  if (!project) throw new Error(`project ${projectId} not found`);
  const [film, sp, scenes, gens, versions, gates, planDecisions, degradations, timeline] = await Promise.all([
    db.film.findUnique({ where: { projectId }, select: { mp4Key: true } }),
    db.screenplay.findUnique({ where: { projectId }, select: { raw: true } }),
    db.scene.findMany({
      where: { projectId }, orderBy: { index: "asc" },
      select: { id: true, index: true, status: true, shots: { orderBy: { index: "asc" }, select: { id: true, index: true, status: true, videoKey: true, durationSec: true } },
        audioTracks: { select: { kind: true, key: true, durationMs: true } } },
    }),
    db.videoGeneration.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { shotId: true, modelId: true, outcome: true, grantId: true, mediaVersionId: true, createdAt: true } }),
    db.mediaVersion.findMany({ where: { projectId }, select: { assetType: true, assetId: true, storageKey: true, sha256: true, version: true } }),
    db.qualityGateResult.findMany({ where: { projectId, scope: "shot" }, orderBy: { createdAt: "asc" }, select: { refId: true, gate: true, outcome: true, findings: true, attempt: true, createdAt: true } }),
    db.aiDecision.count({ where: { projectId, task: { in: ["film_plan", "film_plan_revision"] }, outcome: "ok" } }),
    db.productionDegradation.findMany({ where: { projectId }, select: { code: true, message: true } }),
    db.productionTimeline.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { id: true } }).catch(() => null),
  ]);
  const syncReport = timeline
    ? await db.avSyncReport.findFirst({ where: { timelineVersionId: timeline.id }, orderBy: { createdAt: "desc" }, select: { passed: true, policy: true } }).catch(() => null)
    : null;

  const parsed = FilmPackage.safeParse((sp?.raw as { package?: unknown } | null)?.package);
  const pkg = parsed.success ? parsed.data : null;

  const masterPath = join(dir, "master.mp4");
  if (film?.mp4Key) await download(film.mp4Key, masterPath).catch(() => undefined);
  const master = await measureMaster(masterPath, film?.mp4Key ?? null);

  const sceneFacts: SceneFacts[] = scenes.map((s) => {
    const planned = pkg?.scenes[s.index];
    const voice = s.audioTracks.filter((t) => t.kind === "VOICE").at(-1);
    return {
      id: s.id, index: s.index, status: s.status, plannedShots: planned?.shots.length ?? s.shots.length,
      spoken: Boolean(planned ? planned.narration || planned.dialogue.length : false),
      ambiencePlanned: Boolean(planned && (planned.audio.sfx.length || planned.audio.ambience)),
      voiceTrack: voice ? { key: voice.key, durationMs: voice.durationMs } : null,
      pictureSec: s.shots.reduce((a, x) => a + x.durationSec, 0),
    };
  });

  const shotFacts: ShotFacts[] = scenes.flatMap((s) => s.shots.map((sh) => {
    const planned = pkg?.scenes[s.index]?.shots.find((x) => x.index === sh.index);
    const mine = gens.filter((g) => g.shotId === sh.id);
    const last = mine.at(-1) ?? null;
    const lastOk = mine.map((g) => !FAILED_GENERATION.has(g.outcome ?? "")).lastIndexOf(true);
    const shotGates = gates.filter((g) => g.refId === sh.id);
    const lastAttempt = shotGates.reduce((n, g) => Math.max(n, g.attempt), 0);
    const visual = shotGates.filter((g) => g.gate === "visual").at(-1);
    const mismatches = ((visual?.findings as { code?: string }[] | null) ?? [])
      .map((f) => /^VISUAL_([A-Z]+)_MISMATCH$/.exec(f.code ?? "")?.[1]?.toLowerCase()).filter((x): x is string => !!x);
    return {
      id: sh.id, sceneId: s.id, index: sh.index, status: sh.status, videoKey: sh.videoKey,
      framesCharacters: Boolean(planned?.subjectIds.some((x) => x.startsWith("char_"))),
      generation: last ? { modelId: last.modelId, outcome: last.outcome, grantId: last.grantId, mediaVersionId: last.mediaVersionId } : null,
      unrecoveredFailures: mine.slice(lastOk + 1).filter((g) => FAILED_GENERATION.has(g.outcome ?? "")).length,
      latestGateFailed: shotGates.some((g) => g.attempt === lastAttempt && g.outcome === "fail"),
      clipVersioned: Boolean(sh.videoKey && versions.some((v) => v.assetType === "video" && v.assetId === sh.id && v.storageKey === sh.videoKey)),
      visual: visual ? { outcome: visual.outcome, mismatches } : null,
    };
  }));

  const masters = versions.filter((v) => v.assetType === "master" && v.assetId === projectId).sort((a, b) => b.version - a.version);
  const [w, h] = outputDimensions(project.resolution, project.aspectRatio);
  const fmt = masterFormat(env, { width: w, height: h });
  const policy = syncPolicy("cinematic");
  const tracks = scenes.flatMap((s) => s.audioTracks);
  return {
    projectId, projectStatus: project.status, targetSec: project.targetSeconds,
    expected: {
      width: fmt.width, height: fmt.height, fps: fmt.fps,
      integratedLufs: policy.delivery.integratedLufs, loudnessLu: policy.tolerances.loudnessLu, truePeakMaxDbtp: policy.delivery.truePeakDbtp,
      lipSyncLeadUs: Number(policy.tolerances.lipSyncLeadUs), lipSyncLagUs: Number(policy.tolerances.lipSyncLagUs), driftUs: Number(policy.tolerances.driftUs),
      durationTolerance: 0.1,
    },
    master,
    masterVersion: masters[0] ? { storageKey: masters[0].storageKey, sha256: masters[0].sha256 } : null,
    planScenes: pkg?.scenes.length ?? 0,
    planShots: pkg?.scenes.reduce((n, s) => n + s.shots.length, 0) ?? 0,
    scenes: sceneFacts,
    shots: shotFacts,
    musicTrack: tracks.some((t) => t.kind === "MUSIC"),
    // Sound design (W16): ambience beds and placed effects.
    sfxTracks: tracks.filter((t) => t.kind === "SFX" || t.kind === "AMBIENCE").length,
    planViolations: pkg ? planViolations(pkg) : [{ code: "NO_FILM_IR_PLAN", kind: "other" }],
    planDecision: planDecisions > 0,
    degradations,
    syncReport,
  };
}
