/**
 * Operator command: run the A/V Sync Engine on a timeline version.
 *
 *   pnpm --filter @cineforge/worker avsync:check <timelineVersionId> [--dry-run] [--subtitles]
 *
 * Loads the timeline (0028–0029), downloads each shot's current clip, measures
 * it (ffprobe / blackdetect / freezedetect / sha256), runs the engine, prints
 * the report and plan, and — unless --dry-run — saves report, issues and
 * planned repair jobs (0030). --subtitles prints SRT derived from the
 * timeline's dialogue. Changes no media and no timeline.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@cineforge/db";
import { analyzeSync, buildSrt, deriveSubtitles, toCues, usToJson, type MediaFacts } from "@cineforge/shared";
import { S3Storage } from "../storage/storage";
import { measureFacts } from "./facts";
import { policyFor, toDraftAudio, toDraftEvents, type AudioRow, type EventRow, type TimelineRow } from "./load";
import { saveSyncAnalysis, jsonSafe, type AvSyncDb } from "./store";

type Db = {
  productionTimeline: { findUnique(a: unknown): Promise<TimelineRow | null> };
  timelineEvent: { findMany(a: unknown): Promise<EventRow[]> };
  audioEvent: { findMany(a: unknown): Promise<AudioRow[]> };
  shot: { findMany(a: unknown): Promise<Array<{ id: string; videoKey: string | null }>> };
  videoGeneration: { findFirst(a: unknown): Promise<{ id: string } | null> };
};

async function main(): Promise<number> {
  const id = process.argv[2];
  if (!id || id.startsWith("--")) {
    console.error("usage: avsync:check <timelineVersionId> [--dry-run] [--subtitles]");
    return 2;
  }
  const db = prisma as unknown as Db;
  const t = await db.productionTimeline.findUnique({ where: { id } });
  if (!t) {
    console.error(`timeline ${id} not found`);
    return 1;
  }
  const fps = { num: t.fpsNum, den: t.fpsDen };
  const events = toDraftEvents(await db.timelineEvent.findMany({ where: { timelineVersionId: id }, orderBy: { startUs: "asc" } }));
  const audio = toDraftAudio(await db.audioEvent.findMany({ where: { timelineVersionId: id } }));
  const { policy, note } = policyFor(t);
  if (note) console.warn(note);

  const shotEvents = events.filter((e) => e.kind === "shot" && e.refId);
  const shots = await db.shot.findMany({ where: { id: { in: shotEvents.map((e) => e.refId!) } }, select: { id: true, videoKey: true } });
  const storage = new S3Storage();
  const dir = await mkdtemp(join(tmpdir(), "cf-avsync-"));
  const media: MediaFacts[] = [];
  try {
    for (const e of shotEvents) {
      const key = shots.find((s) => s.id === e.refId)?.videoKey;
      if (!key) continue; // reported as missing_media
      const local = join(dir, `${e.refId}.mp4`);
      await storage.download(key, local);
      const gen = await db.videoGeneration.findFirst({ where: { shotId: e.refId }, orderBy: { createdAt: "desc" }, select: { id: true } }).catch(() => null);
      media.push(await measureFacts({ eventKey: e.key, kind: "video", localPath: local, generationRef: gen ? `video_generations:${gen.id}` : null }));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const { report, plan } = analyzeSync({ timelineVersionId: id, durationUs: t.durationUs, fps, events, audio, media, policy });
  console.log(JSON.stringify(jsonSafe({ passed: report.passed, policy: report.policy, durationUs: usToJson(t.durationUs), issues: report.issues, plan }), null, 2));
  if (process.argv.includes("--subtitles")) console.log(buildSrt(toCues(deriveSubtitles(events, fps))));
  if (process.argv.includes("--dry-run")) return report.passed ? 0 : 3;
  const saved = await saveSyncAnalysis(prisma as unknown as AvSyncDb, report, plan, { timelineStatus: t.status });
  console.log(JSON.stringify(saved));
  return report.passed ? 0 : 3;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
