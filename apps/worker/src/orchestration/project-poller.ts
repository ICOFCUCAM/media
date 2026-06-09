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
        // Atomic claim: only one worker flips PLANNING → GENERATING.
        const claimed = await prisma.project.updateMany({
          where: { id: p.id, status: "PLANNING", mode: "auto" },
          data: { status: "GENERATING" },
        });
        if (claimed.count === 1) {
          await filmQueue.add("plan", { projectId: p.id }, { jobId: `film-${p.id}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] enqueued film for project ${p.id}`);
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
