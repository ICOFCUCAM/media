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
import { QUEUES, type FilmJob, type VoiceLabJob, type SocialJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const filmQueue = new Queue<FilmJob>(QUEUES.film, { connection });
const voiceLabQueue = new Queue<VoiceLabJob>(QUEUES.voiceLab, { connection });
const socialQueue = new Queue<SocialJob>(QUEUES.social, { connection });

export function startProjectPoller(intervalMs = Number(process.env.PROJECT_POLL_SEC ?? 5) * 1000): () => void {
  let busy = false;
  // Per-project resume cooldown (see the storm guard below).
  const resumedAt = new Map<string, number>();
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      // Auto-mode films awaiting the Director. Storyboard/hybrid generation is
      // deliberate per-scene (handled elsewhere), so we only claim mode=auto.
      const pending = await prisma.project.findMany({
        where: { status: "PLANNING", mode: "auto" },
        select: { id: true, user: { select: { creditsMs: true } } },
        take: 5,
      });
      for (const p of pending) {
        // Hard credit gate — the authoritative check (the web shows a friendly
        // version, but only this one can't be bypassed). No credits, no GPU.
        if (p.user.creditsMs <= 0) {
          await prisma.project.updateMany({
            where: { id: p.id, status: "PLANNING" },
            data: { status: "FAILED", errorMessage: "Out of credits — top up to keep creating" },
          });
          console.log(`[poller] rejected project ${p.id}: user out of credits`);
          continue;
        }
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
      // restarts/deploys, stranding claimed projects on GENERATING. Two classes:
      //  - never planned (no scenes): flip back to PLANNING — the normal claim
      //    path re-runs the Director (plan() is idempotent per scene index).
      //  - planned but stalled: enqueue a "resume" film job — the flow re-fans
      //    out and completed shots short-circuit at zero GPU cost.
      //
      // "Stalled" is judged by real PROGRESS (last shot to reach READY), not by
      // the last shot merely TOUCHED: a lost job leaves its shot flapping in
      // GENERATING (updatedAt keeps moving) while no shot ever finishes, which
      // a touch-based check would mistake for healthy activity. WAN_STALL_MIN
      // raises the window for slow models (e.g. 14B/Hunyuan at minutes/shot).
      const STALL_MS = Number(process.env.WAN_STALL_MIN ?? 15) * 60_000;
      const now = Date.now();
      // All in-flight auto projects (no updatedAt filter — that field is bumped
      // by every shot's spend update, so it can't tell stalled from healthy).
      const candidates = await prisma.project.findMany({
        where: { status: "GENERATING", mode: "auto" },
        select: { id: true, createdAt: true },
        take: 20,
      });
      for (const c of candidates) {
        const firstScene = await prisma.scene.findFirst({
          where: { projectId: c.id },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        });
        if (!firstScene) {
          // Claimed but never planned. Only act once the claim is genuinely old,
          // so a project mid-planning isn't yanked back.
          if (now - c.createdAt.getTime() > STALL_MS) {
            await prisma.project.updateMany({ where: { id: c.id, status: "GENERATING" }, data: { status: "PLANNING" } });
            console.log(`[poller] recovered orphaned project ${c.id} (claimed but never planned)`);
          }
          continue;
        }
        // Reference = real progress: the last shot to reach READY, or — if none
        // yet — when planning finished. Stalled if that's older than STALL_MS.
        const lastReady = await prisma.shot.findFirst({
          where: { scene: { projectId: c.id }, status: "READY" },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        });
        const reference = lastReady?.updatedAt.getTime() ?? firstScene.createdAt.getTime();
        if (now - reference < STALL_MS) continue; // progressing (or still warming up)
        // Its jobs were lost mid-flight — re-fan-out (READY shots cost 0 GPU).
        // Resume STORM guard, twice over: an in-memory cooldown per project,
        // plus a jobId keyed to the 15-min window so BullMQ itself dedupes
        // even across worker restarts. (A naive unique jobId here once queued
        // a resume EVERY TICK and flooded the GPU with duplicate work.)
        if (now - (resumedAt.get(c.id) ?? 0) < STALL_MS) continue;
        resumedAt.set(c.id, now);
        const windowId = Math.floor(now / STALL_MS);
        await filmQueue.add("resume", { projectId: c.id }, { jobId: `film-resume-${c.id}-${windowId}`, attempts: 2, removeOnComplete: 100 });
        console.log(`[poller] resumed stalled project ${c.id} (no shot completed in ${STALL_MS / 60000} min)`);
      }
      // ── Voice Lab (docs/29): claim pending clones + voiceovers ─────────
      // Same producer/consumer split as films: the web writes PENDING rows,
      // we claim them atomically and enqueue. Stable jobIds dedupe re-claims.
      const pendingVoices = await prisma.voice.findMany({ where: { status: "PENDING" }, select: { id: true }, take: 5 });
      for (const v of pendingVoices) {
        const claimed = await prisma.voice.updateMany({ where: { id: v.id, status: "PENDING" }, data: { status: "CLONING" } });
        if (claimed.count === 1) {
          await voiceLabQueue.add("clone", { kind: "clone", id: v.id }, { jobId: `voice-clone-${v.id}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] enqueued voice clone ${v.id}`);
        }
      }
      const pendingVoiceovers = await prisma.voiceover.findMany({ where: { status: "PENDING" }, select: { id: true }, take: 5 });
      for (const vo of pendingVoiceovers) {
        const claimed = await prisma.voiceover.updateMany({ where: { id: vo.id, status: "PENDING" }, data: { status: "SPEAKING" } });
        if (claimed.count === 1) {
          await voiceLabQueue.add("speak", { kind: "speak", id: vo.id }, { jobId: `voiceover-${vo.id}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] enqueued voiceover ${vo.id}`);
        }
      }
      // ── Social Launchpad: claim kit + launch requests ──────────────────
      const pendingLaunches = await prisma.socialLaunch.findMany({ where: { status: "PENDING" }, select: { id: true }, take: 5 });
      for (const l of pendingLaunches) {
        const claimed = await prisma.socialLaunch.updateMany({ where: { id: l.id, status: "PENDING" }, data: { status: "KIT_BUILDING" } });
        if (claimed.count === 1) {
          await socialQueue.add("kit", { kind: "kit", id: l.id }, { jobId: `social-kit-${l.id}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] enqueued social kit ${l.id}`);
        }
      }
      const launchRequests = await prisma.socialLaunch.findMany({ where: { status: "LAUNCH_REQUESTED" }, select: { id: true }, take: 5 });
      for (const l of launchRequests) {
        const claimed = await prisma.socialLaunch.updateMany({ where: { id: l.id, status: "LAUNCH_REQUESTED" }, data: { status: "LAUNCHING" } });
        if (claimed.count === 1) {
          await socialQueue.add("launch", { kind: "launch", id: l.id }, { jobId: `social-launch-${l.id}-${Date.now()}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] enqueued social launch ${l.id}`);
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
