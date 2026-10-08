/**
 * Operator command: change a planned film's canon and regenerate only what it touches.
 *
 *   pnpm --filter @cineforge/worker canon:revise <projectId> <change.json> [--apply]
 *
 * change.json is one CanonChange (packages/movie/src/world/revise.ts), e.g.
 *   {"kind":"scene_wardrobe","sceneId":"scene_12","characterId":"char_maya",
 *    "wardrobe":{"id":"wardrobe_blue_coat","description":"long blue wool coat"}}
 *
 * Without --apply it prints what the change would touch and whether canon
 * allows it, and writes nothing. With --apply it invalidates exactly the
 * affected shots (canon_revisions row, migration 0033) and enqueues a
 * "resume" film job: only those shots regenerate, then the film re-assembles.
 * Regeneration spends GPU time; no credits are charged by this command.
 */
import { readFile } from "node:fs/promises";
import { Queue } from "bullmq";
import { prisma } from "@cineforge/db";
import { QUEUES, type FilmJob } from "@cineforge/shared";
import type { CanonChange } from "@cineforge/movie";
import { applyCanonRevision, previewCanonRevision, type CanonDb } from "./revision";

async function main(): Promise<number> {
  const [projectId, file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!projectId || !file) {
    console.error("usage: canon:revise <projectId> <change.json> [--apply]");
    return 2;
  }
  const change = JSON.parse(await readFile(file, "utf8")) as CanonChange;
  const db = prisma as unknown as CanonDb;
  const preview = await previewCanonRevision(db, projectId, change);
  console.log(JSON.stringify({
    change: preview.change, issues: preview.issues, affectedScenes: preview.affectedScenes,
    affectedShots: preview.affectedShots, fromVersion: preview.fromVersion, toVersion: preview.toVersion,
  }, null, 2));
  if (preview.issues.length) {
    console.error("rejected: the change would break canon (issues above)");
    if (apply) await applyCanonRevision(db, projectId, change, { actor: "operator:cli" }); // records the rejection
    return 1;
  }
  if (!apply) {
    console.log("dry run — re-run with --apply to invalidate these shots and regenerate them");
    return 0;
  }
  const r = await applyCanonRevision(db, projectId, change, { actor: "operator:cli" });
  console.log(`applied: ${r.invalidatedShotIds.length} shot(s) invalidated`);
  if (r.invalidatedShotIds.length) {
    const queue = new Queue<FilmJob>(QUEUES.film, { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" } });
    await queue.add("resume", { projectId }, { jobId: `film-canon-${projectId}-${r.toVersion}`, attempts: 2, removeOnComplete: 100 });
    await queue.close();
    console.log("resume job enqueued: affected shots regenerate, the film re-assembles");
  }
  return 0;
}

main()
  .then((code) => prisma.$disconnect().then(() => process.exit(code)))
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
