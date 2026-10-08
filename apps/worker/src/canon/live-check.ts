/**
 * Live acceptance of a canon revision (DirectorOS Part 2 §62.9; W10).
 *
 *   pnpm --filter @cineforge/worker canon:live-check <projectId> <change.json> [--timeout-min 30]
 *
 * Run against PRODUCTION infrastructure (DATABASE_URL, REDIS_URL of the
 * deployed worker, GPU live) on a finished Film IR project. It:
 *   1. snapshots every shot (status, clip, cache key) — all must be READY;
 *   2. applies the change (canon_revisions row) and enqueues a resume job;
 *   3. waits until every invalidated shot is READY again (or FAILED / timeout);
 *   4. verifies: invalidated shots have a NEW clip and cache key; every other
 *      shot kept its exact clip and key; the revision row exists; a wardrobe
 *      reference exists for the new canon when the change was a wardrobe one;
 *      and reports visual-review decisions and degradations for those shots.
 * Exit 0 = §62.9 holds on live infrastructure. It spends GPU time for the
 * regenerated shots; no credits are charged.
 */
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { Queue } from "bullmq";
import { prisma } from "@cineforge/db";
import { QUEUES, type FilmJob } from "@cineforge/shared";
import type { CanonChange } from "@cineforge/movie";
import { applyCanonRevision, type CanonDb } from "./revision";

type Snap = { id: string; status: string; videoKey: string | null; cacheKey: string | null };

async function snapshot(projectId: string): Promise<Snap[]> {
  return prisma.shot.findMany({ where: { scene: { projectId } }, select: { id: true, status: true, videoKey: true, cacheKey: true } });
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const [projectId, file] = args.filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  const t = args.indexOf("--timeout-min");
  const timeoutMin = t >= 0 ? Number(args[t + 1]) : 30;
  if (!projectId || !file) {
    console.error("usage: canon:live-check <projectId> <change.json> [--timeout-min 30]");
    return 2;
  }
  const change = JSON.parse(await readFile(file, "utf8")) as CanonChange;
  const before = await snapshot(projectId);
  const notReady = before.filter((s) => s.status !== "READY" || !s.videoKey);
  if (!before.length || notReady.length) {
    console.error(`every shot must be READY first (${notReady.length} of ${before.length} are not)`);
    return 1;
  }

  const startedAt = new Date();
  const r = await applyCanonRevision(prisma as unknown as CanonDb, projectId, change, { actor: "operator:live-check" });
  if (r.outcome !== "applied") {
    console.error(`change rejected: ${r.issues.map((i) => i.code).join(", ")}`);
    return 1;
  }
  console.log(`applied: ${r.invalidatedShotIds.length} shot(s) invalidated in ${r.affectedScenes.join(", ")}`);
  const queue = new Queue<FilmJob>(QUEUES.film, { connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" } });
  await queue.add("resume", { projectId }, { jobId: `film-canon-${projectId}-${r.toVersion}`, attempts: 2, removeOnComplete: 100 });
  await queue.close();

  const deadline = Date.now() + timeoutMin * 60_000;
  let now = await snapshot(projectId);
  for (;;) {
    const pending = now.filter((s) => r.invalidatedShotIds.includes(s.id) && s.status !== "READY" && s.status !== "FAILED");
    if (!pending.length || Date.now() > deadline) break;
    console.log(`waiting: ${pending.length} shot(s) regenerating…`);
    await sleep(15_000);
    now = await snapshot(projectId);
  }

  const failures: string[] = [];
  for (const b of before) {
    const a = now.find((x) => x.id === b.id);
    if (!a) { failures.push(`shot ${b.id} disappeared`); continue; }
    if (r.invalidatedShotIds.includes(b.id)) {
      if (a.status !== "READY") failures.push(`affected shot ${b.id} is ${a.status}, not READY`);
      else if (a.videoKey === b.videoKey) failures.push(`affected shot ${b.id} kept its old clip`);
      if (a.cacheKey === b.cacheKey) failures.push(`affected shot ${b.id} kept its old cache key`);
    } else if (a.videoKey !== b.videoKey || a.cacheKey !== b.cacheKey || a.status !== "READY") {
      failures.push(`unaffected shot ${b.id} changed (${b.status}→${a.status})`);
    }
  }
  const revisions = await prisma.canonRevision.count({ where: { projectId, toVersion: r.toVersion, outcome: "applied" } });
  if (revisions !== 1) failures.push(`expected one canon_revisions row for ${r.toVersion}, found ${revisions}`);
  if (change.kind === "scene_wardrobe" || change.kind === "wardrobe_description") {
    const refs = await prisma.wardrobeReference.count({ where: { projectId, createdAt: { gte: startedAt } } });
    if (!refs) failures.push("no new wardrobe reference was generated for the changed wardrobe (check OPENAI_API_KEY / WARDROBE_REFERENCES)");
  }
  const degradations = await prisma.productionDegradation.findMany({
    where: { projectId, createdAt: { gte: startedAt } }, select: { code: true, refId: true, message: true },
  });
  const reviews = await prisma.aiDecision.count({ where: { projectId, task: "visual_review", createdAt: { gte: startedAt } } });

  console.log(JSON.stringify({
    projectId, change, affectedScenes: r.affectedScenes, invalidated: r.invalidatedShotIds.length,
    unaffected: before.length - r.invalidatedShotIds.length, visualReviews: reviews, degradations, failures,
  }, null, 2));
  console.log(failures.length ? `§62.9 FAILED on live infrastructure (${failures.length})` : "§62.9 holds on live infrastructure");
  return failures.length ? 1 : 0;
}

main()
  .then((code) => prisma.$disconnect().then(() => process.exit(code)))
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
