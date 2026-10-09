/**
 * Locked films (DirectorOS W19; Part 1 §38). A film the owner locks is
 * rendered once more, from an approved production timeline built from its
 * locked scenes: one poller tick claims each locked, finished film whose lock
 * has no approved timeline yet, approves one and queues the render. The
 * claim (READY → RENDERING) keeps two workers from rendering the same lock.
 */
import { Queue } from "bullmq";
import { prisma } from "@cineforge/db";
import { QUEUES, type RenderJob } from "@cineforge/shared";
import { renderProfile } from "../render/profile";
import { approveLockedTimeline, lockRendered, type LockDb } from "../timeline/lock";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
let renderQueue: Queue<RenderJob> | null = null;

export async function advanceLocks(): Promise<void> {
  if (process.env.LOCK_RENDER === "0") return;
  const locked = await prisma.project.findMany({
    where: { lockedAt: { not: null }, status: "READY" },
    select: { id: true, lockedAt: true },
    take: 5,
  });
  for (const p of locked) {
    const timelines = await prisma.productionTimeline.findMany({
      where: { projectId: p.id, status: { in: ["approved", "frozen"] } },
      select: { status: true, approvedAt: true },
    }).catch(() => null); // before migration 0028
    if (!timelines || lockRendered(p.lockedAt!, timelines)) continue;
    const claimed = await prisma.project.updateMany({ where: { id: p.id, status: "READY", lockedAt: p.lockedAt }, data: { status: "RENDERING" } });
    if (claimed.count !== 1) continue;
    try {
      const approved = await approveLockedTimeline(prisma as unknown as LockDb, p.id, renderProfile().policy.id as string);
      if (!approved.approved) {
        await prisma.project.update({ where: { id: p.id }, data: { status: "READY" } });
        console.warn(JSON.stringify({ event: "lock.render", projectId: p.id, skipped: approved.reason }));
        continue;
      }
      renderQueue ??= new Queue<RenderJob>(QUEUES.render, { connection });
      await renderQueue.add("final", { projectId: p.id, kind: "final", timelineId: approved.timelineId }, { jobId: `lock-render-${approved.timelineId}`, attempts: 2, removeOnComplete: 100 });
      console.log(JSON.stringify({ event: "lock.render", projectId: p.id, timelineId: approved.timelineId, version: approved.version }));
    } catch (e) {
      await prisma.project.update({ where: { id: p.id }, data: { status: "READY" } }).catch(() => {});
      console.error(JSON.stringify({ event: "lock.render", projectId: p.id, error: e instanceof Error ? e.message : String(e) }));
    }
  }
}
