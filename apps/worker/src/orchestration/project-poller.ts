/**
 * Project watcher (Gap 2 bridge) — the link between the website and the worker.
 *
 * The web app creates an Auto-mode film as a `projects` row with
 * status=PLANNING (no API call, no queue access from the browser). This loop —
 * which runs inside the worker, already connected to the same Supabase database —
 * polls for those rows, atomically claims each (PLANNING → GENERATING so it's
 * picked up exactly once), and enqueues a `film` job. The film processor then
 * runs the Director and fans out scenes/shots. Status/progress flow back to the
 * web over Supabase Realtime.
 *
 * Polling (not webhooks) is deliberate: the worker is a background service with
 * no public URL, and this needs no extra infrastructure. Low frequency is fine.
 */
import { Queue } from "bullmq";
import { QUEUES, type FilmJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const filmQueue = new Queue<FilmJob>(QUEUES.film, { connection });

export function startProjectPoller(intervalMs = Number(process.env.PROJECT_POLL_SEC ?? 5) * 1000): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Auto-mode films awaiting the Director. Storyboard/hybrid generation is
      // deliberate per-scene (handled elsewhere), so we only claim mode=auto.
      const pending = await prisma.project.findMany({
        where: { status: "PLANNING", mode: "auto" },
        select: { id: true },
        take: 5,
      });
      for (const p of pending) {
        // Atomic claim: only one worker flips PLANNING → GENERATING. The jobId
        // carries a timestamp so a re-claimed project (recovery below) isn't
        // silently deduped against a stale completed job in Redis.
        const claimed = await prisma.project.updateMany({
          where: { id: p.id, status: "PLANNING", mode: "auto" },
          data: { status: "GENERATING" },
        });
        if (claimed.count === 1) {
          await filmQueue.add("plan", { projectId: p.id }, { jobId: `film-${p.id}-${Date.now()}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] enqueued film for project ${p.id}`);
        }
      }

      // ── Orphan recovery ────────────────────────────────────────────────
      // The job queue (Redis, no persistence) loses in-flight jobs on worker
      // restarts/deploys, stranding claimed projects on GENERATING forever.
      // Both classes are detected by silence:
      //  - never planned (no scenes): flip back to PLANNING — the normal claim
      //    path re-runs the Director (plan() is idempotent per scene index).
      //  - planned but stalled (no shot/project touch for 15 min): enqueue a
      //    "resume" film job — the flow re-fans out and completed shots
      //    short-circuit at zero GPU cost.
      const STALL_MS = 15 * 60_000;
      const candidates = await prisma.project.findMany({
        where: { status: "GENERATING", mode: "auto", updatedAt: { lt: new Date(Date.now() - STALL_MS) } },
        select: { id: true, updatedAt: true },
        take: 10,
      });
      for (const c of candidates) {
        const latestShot = await prisma.shot.findFirst({
          where: { scene: { projectId: c.id } },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        });
        if (latestShot && Date.now() - latestShot.updatedAt.getTime() < STALL_MS) continue; // shots are moving
        if (!latestShot) {
          await prisma.project.updateMany({
            where: { id: c.id, status: "GENERATING" },
            data: { status: "PLANNING" },
          });
          console.log(`[poller] recovered orphaned project ${c.id} (claimed but never planned)`);
        } else {
          // Touch the row first so the 15-min cooldown restarts (prevents a
          // resume storm while the resumed flow spins up).
          await prisma.project.update({ where: { id: c.id }, data: { status: "GENERATING" } });
          await filmQueue.add("resume", { projectId: c.id }, { jobId: `film-resume-${c.id}-${Date.now()}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] resumed stalled project ${c.id} (no activity for 15 min)`);
        }
      }
    } catch (e) {
      console.error("[poller] tick failed:", e);
    } finally {
      busy = false;
    }
  };
  const handle = setInterval(tick, intervalMs);
  console.log(`[poller] watching projects every ${intervalMs}ms`);
  return () => clearInterval(handle);
}
