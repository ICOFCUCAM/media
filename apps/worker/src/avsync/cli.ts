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
import { prisma } from "@cineforge/db";
import { buildSrt, deriveSubtitles, toCues } from "@cineforge/shared";
import { S3Storage } from "../storage/storage";
import { checkTimeline, type SyncDb } from "./run";
import { saveSyncAnalysis, jsonSafe, type AvSyncDb } from "./store";

async function main(): Promise<number> {
  const id = process.argv[2];
  if (!id || id.startsWith("--")) {
    console.error("usage: avsync:check <timelineVersionId> [--dry-run] [--subtitles]");
    return 2;
  }
  const storage = new S3Storage();
  const check = await checkTimeline(prisma as unknown as SyncDb, (key, dest) => storage.download(key, dest), id);
  if (!check) {
    console.error(`timeline ${id} not found`);
    return 1;
  }
  const { report, plan, note, fps, events } = check;
  if (note) console.warn(note);
  console.log(JSON.stringify(jsonSafe({ passed: report.passed, policy: report.policy, issues: report.issues, plan }), null, 2));
  if (process.argv.includes("--subtitles")) console.log(buildSrt(toCues(deriveSubtitles(events, fps))));
  if (process.argv.includes("--dry-run")) return report.passed ? 0 : 3;
  const t = await (prisma as unknown as SyncDb).productionTimeline.findUnique({ where: { id } });
  const saved = await saveSyncAnalysis(prisma as unknown as AvSyncDb, report, plan, { timelineStatus: t?.status });
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
