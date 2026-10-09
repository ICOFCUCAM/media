/**
 * The A/V Sync Engine as a step of the pipeline (DirectorOS Part 1 §39–40;
 * W18), not only an operator command: after every final render the
 * production's timeline is built from what was actually made and the sync
 * engine checks it — every shot clip measured, dialogue and cues against
 * their anchors, durations, drift — and the report, issues and planned
 * repairs are saved (0028–0030). It records; it never blocks a delivered film.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeSync, buildTimelineDraft, MasterClock, syncPolicy, type AVSyncReport, type MediaFacts, type RepairPlan } from "@cineforge/shared";
import { measureFacts } from "./facts";
import { policyFor, toDraftAudio, toDraftEvents, type AudioRow, type EventRow, type TimelineRow } from "./load";
import { saveSyncAnalysis, type AvSyncDb, type SaveSyncResult } from "./store";
import { loadProjectSource, saveTimelineDraft, type TimelineDb } from "../timeline/store";

export type SyncDb = {
  productionTimeline: { findUnique(a: unknown): Promise<TimelineRow | null> };
  timelineEvent: { findMany(a: unknown): Promise<EventRow[]> };
  audioEvent: { findMany(a: unknown): Promise<AudioRow[]> };
  shot: { findMany(a: unknown): Promise<Array<{ id: string; videoKey: string | null }>> };
  videoGeneration: { findFirst(a: unknown): Promise<{ id: string } | null> };
};

export interface TimelineCheck {
  report: AVSyncReport;
  plan: RepairPlan;
  note?: string;
  fps: { num: number; den: number };
  events: ReturnType<typeof toDraftEvents>;
}

/** Measure every shot of a saved timeline version and run the engine on it. */
export async function checkTimeline(
  db: SyncDb,
  download: (key: string, dest: string) => Promise<void>,
  timelineId: string,
  measure: typeof measureFacts = measureFacts,
): Promise<TimelineCheck | null> {
  const t = await db.productionTimeline.findUnique({ where: { id: timelineId } });
  if (!t) return null;
  const fps = { num: t.fpsNum, den: t.fpsDen };
  const events = toDraftEvents(await db.timelineEvent.findMany({ where: { timelineVersionId: timelineId }, orderBy: { startUs: "asc" } }));
  const audio = toDraftAudio(await db.audioEvent.findMany({ where: { timelineVersionId: timelineId } }));
  const { policy, note } = policyFor(t);
  const shotEvents = events.filter((e) => e.kind === "shot" && e.refId);
  const shots = await db.shot.findMany({ where: { id: { in: shotEvents.map((e) => e.refId!) } }, select: { id: true, videoKey: true } });
  const dir = await mkdtemp(join(tmpdir(), "cf-avsync-"));
  const media: MediaFacts[] = [];
  try {
    for (const e of shotEvents) {
      const key = shots.find((s) => s.id === e.refId)?.videoKey;
      if (!key) continue; // reported as missing_media
      const local = join(dir, `${e.refId}.mp4`);
      await download(key, local);
      const gen = await db.videoGeneration.findFirst({ where: { shotId: e.refId }, orderBy: { createdAt: "desc" }, select: { id: true } }).catch(() => null);
      media.push(await measure({ eventKey: e.key, kind: "video", localPath: local, generationRef: gen ? `video_generations:${gen.id}` : null }));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const { report, plan } = analyzeSync({ timelineVersionId: timelineId, durationUs: t.durationUs, fps, events, audio, media, policy });
  return { report, plan, note, fps, events };
}

export type RenderSyncResult =
  | { status: "checked"; timelineId: string; passed: boolean; issues: number; errors: number; saved: SaveSyncResult }
  | { status: "skipped"; reason: string };

/** After a final render: build this production's timeline from what was made, check it, save the report. */
export async function syncAfterRender(
  db: TimelineDb & SyncDb & AvSyncDb,
  download: (key: string, dest: string) => Promise<void>,
  projectId: string,
  profile: string,
): Promise<RenderSyncResult> {
  const draft = buildTimelineDraft({ scenes: await loadProjectSource(db, projectId), clock: new MasterClock({ fps: "24" }) });
  const saved = await saveTimelineDraft(db, projectId, draft, syncPolicy(profile));
  if (!saved.saved) return { status: "skipped", reason: saved.reason };
  const check = await checkTimeline(db, download, saved.timelineId);
  if (!check) return { status: "skipped", reason: "timeline not found after saving" };
  const stored = await saveSyncAnalysis(db, check.report, check.plan, { timelineStatus: "draft", trigger: "render" });
  return {
    status: "checked", timelineId: saved.timelineId, passed: check.report.passed,
    issues: check.report.issues.length, errors: check.report.issues.filter((i) => i.severity === "error" || i.severity === "blocker").length, saved: stored,
  };
}
