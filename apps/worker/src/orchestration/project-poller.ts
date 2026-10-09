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
import { QUEUES, planCapSec, type FilmJob, type VoiceLabJob, type VoiceEngineJob, type SocialJob, type RenderJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { enqueueSceneFlow } from "./film-flow";
import { advancePasses } from "./passes";
import { advanceLocks } from "./locks";
import { processEditRequest } from "../canon/edits";
import { processDirectorMessage } from "../canon/conversation";
import { loadFilmPackage } from "../canon/revision";
import { interpretInstruction } from "@cineforge/movie";
import { applyEditorialReview, editorialReview, processEditorialReview } from "../editor/editorial";
import { purgeOrphanedSpeech } from "../voice/cache";
import { S3Storage } from "../storage/storage";
import { constraintsFor, productionOf } from "../director/production";
import { intelligence } from "../intelligence";
import { applyCanonRevision, type CanonDb } from "../canon/revision";
import { notifyFinish } from "../notify";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const filmQueue = new Queue<FilmJob>(QUEUES.film, { connection });
const voiceLabQueue = new Queue<VoiceLabJob>(QUEUES.voiceLab, { connection });
const voiceEngineQueue = new Queue<VoiceEngineJob>(QUEUES.voiceEngine, { connection });
const socialQueue = new Queue<SocialJob>(QUEUES.social, { connection });
const renderQueue = new Queue<RenderJob>(QUEUES.render, { connection });

/** Progress marker for a claimed storyboard assembly (the web requests with 0.9). */
const ASSEMBLY_CLAIMED = 0.92;

/**
 * Scene-by-scene (storyboard) production. The Director's Board writes
 * requests into the rows it owns; this claims them exactly once:
 *  - a shot set to QUEUED → QUEUED→GENERATING, then the scene's flow;
 *  - a project set to RENDERING at progress 0.9 → progress 0.92, then the
 *    final render (the same FFmpeg assembly an auto film gets).
 * Credits and the plan's length ceiling are checked here — the browser can't
 * bypass either.
 */
async function claimStoryboardWork(): Promise<void> {
  const queued = await prisma.shot.findMany({
    where: { status: "QUEUED", scene: { project: { mode: "storyboard" } } },
    select: {
      id: true,
      videoKey: true,
      sceneId: true,
      scene: { select: { projectId: true, project: { select: { user: { select: { creditsMs: true, tier: true, role: true } } } } } },
    },
    take: 10,
  });
  for (const shot of queued) {
    const { projectId } = shot.scene;
    const { user } = shot.scene.project;
    const refuse = async (message: string) => {
      const claimed = await prisma.shot.updateMany({ where: { id: shot.id, status: "QUEUED" }, data: { status: "FAILED" } });
      if (claimed.count !== 1) return;
      await prisma.scene.update({ where: { id: shot.sceneId }, data: { status: "FAILED" } });
      await prisma.project.update({ where: { id: projectId }, data: { errorMessage: message } });
      console.log(`[poller] refused storyboard shot ${shot.id}: ${message}`);
    };
    if (user.creditsMs <= 0) {
      await refuse("Out of credits — top up to keep creating");
      continue;
    }
    const planned = await prisma.shot.aggregate({ where: { scene: { projectId } }, _sum: { durationSec: true } });
    const total = planned._sum.durationSec ?? 0;
    const cap = planCapSec(user.tier, user.role);
    if (total > cap) {
      await refuse(`This storyboard runs ${total}s; your plan allows ${cap}s — shorten it or upgrade`);
      continue;
    }
    const claimed = await prisma.shot.updateMany({ where: { id: shot.id, status: "QUEUED" }, data: { status: "GENERATING" } });
    if (claimed.count !== 1) continue;
    // A re-generation after edits: drop the scene's old narration / music so
    // they are produced again from the current script.
    if (shot.videoKey) await prisma.audioTrack.deleteMany({ where: { sceneId: shot.sceneId } });
    await prisma.scene.update({ where: { id: shot.sceneId }, data: { status: "GENERATING" } });
    await prisma.project.updateMany({
      where: { id: projectId, status: { in: ["DRAFT", "PLANNING", "READY", "FAILED"] } },
      data: { status: "GENERATING", errorMessage: null },
    });
    await enqueueSceneFlow(projectId, shot.sceneId);
    console.log(`[poller] enqueued storyboard scene ${shot.sceneId} (shot ${shot.id})`);
  }

  const assemblies = await prisma.project.findMany({
    where: { mode: "storyboard", status: "RENDERING", progress: { lt: ASSEMBLY_CLAIMED } },
    select: { id: true },
    take: 5,
  });
  for (const p of assemblies) {
    const claimed = await prisma.project.updateMany({
      where: { id: p.id, status: "RENDERING", progress: { lt: ASSEMBLY_CLAIMED } },
      data: { progress: ASSEMBLY_CLAIMED },
    });
    if (claimed.count !== 1) continue;
    const notReady = await prisma.shot.count({ where: { scene: { projectId: p.id }, OR: [{ status: { not: "READY" } }, { videoKey: null }] } });
    if (notReady > 0) {
      await prisma.project.update({
        where: { id: p.id },
        data: { status: "GENERATING", errorMessage: `${notReady} scene clip(s) are not generated yet — generate every scene, then assemble` },
      });
      continue;
    }
    await renderQueue.add("final", { projectId: p.id, kind: "final" }, { jobId: `storyboard-render-${p.id}-${Date.now()}`, attempts: 2, removeOnComplete: 100 });
    console.log(`[poller] enqueued storyboard assembly for project ${p.id}`);
  }
}

async function answerDirectorMessages(): Promise<void> {
  const pending = await prisma.directorMessage.findMany({ where: { status: "pending", author: "owner" }, orderBy: { createdAt: "asc" }, take: 5 })
    .catch(() => []); // before migration 0042
  for (const msg of pending) {
    const outcome = await processDirectorMessage(msg, {
      claim: async (id) => (await prisma.directorMessage.updateMany({ where: { id, status: "pending" }, data: { status: "answered" } })).count === 1,
      loadPackage: (projectId) => loadFilmPackage(prisma as unknown as CanonDb, projectId).catch(() => null),
      available: () => intelligence().available("edit_interpret"),
      interpret: (pkg, text, projectId) => interpretInstruction(intelligence(), pkg, text, { projectId }),
      fileEdit: async (projectId, requestedBy, change) =>
        (await prisma.editRequest.create({ data: { projectId, requestedBy, change: change as object }, select: { id: true } })).id,
      fileReview: async (projectId, requestedBy, instruction) =>
        (await prisma.editorialReview.create({ data: { projectId, requestedBy, instruction: instruction.slice(0, 2000) }, select: { id: true } })).id,
      reply: async (projectId, replyTo, body, editRequestId) => {
        await prisma.directorMessage.create({ data: { projectId, author: "director", body, status: "answered", replyTo, editRequestId }, select: { id: true } });
      },
    });
    console.log(`[poller] director message ${msg.id} ${outcome}`);
  }
}

/** The Editor (W13): review pending cuts, and apply the edits owners approved. */
async function runEditor(): Promise<void> {
  const pending = await prisma.editorialReview.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 3 })
    .catch(() => []); // before migration 0048
  for (const row of pending) {
    const outcome = await processEditorialReview(row, {
      claim: async (id) => (await prisma.editorialReview.updateMany({ where: { id, status: "pending" }, data: { status: "reviewing" } })).count === 1,
      loadPackage: async (projectId) => {
        const pkg = await loadFilmPackage(prisma as unknown as CanonDb, projectId).catch(() => null);
        if (!pkg) return null;
        const p = await prisma.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { targetSeconds: true, kind: true, medium: true, animationStyle: true, episodes: true, seriesId: true, episodeNumber: true },
        });
        return { pkg, maxShotSec: constraintsFor(p.targetSeconds, productionOf(p)).maxShotSec };
      },
      available: () => intelligence().available("editorial"),
      review: editorialReview(intelligence()),
      save: async (id, o) => {
        await prisma.$transaction(async (tx) => {
          for (const p of o.proposals ?? []) {
            await tx.editProposal.create({ data: { reviewId: id, projectId: row.projectId, position: p.position, op: p.op as object, description: p.description, effect: p.effect as object } });
          }
          await tx.editorialReview.update({
            where: { id },
            data: {
              status: o.status, canonVersion: o.canonVersion, summary: o.summary, findings: (o.findings ?? []) as object[],
              dropped: (o.dropped ?? []) as object[], error: o.error, reviewedAt: new Date(),
            },
          });
        });
      },
    });
    console.log(`[poller] editorial review ${row.id} ${outcome}`);
  }
  const toApply = await prisma.editorialReview.findMany({ where: { status: "apply_requested" }, orderBy: { createdAt: "asc" }, take: 2, select: { id: true, projectId: true } })
    .catch(() => []);
  for (const r of toApply) {
    if ((await prisma.editorialReview.updateMany({ where: { id: r.id, status: "apply_requested" }, data: { status: "applying" } })).count !== 1) continue;
    try {
      const out = await applyEditorialReview(prisma, r.id);
      if (out.outcome === "applied") {
        // Only the regenerated shots generate; the master renders again as a new version.
        await filmQueue.add("resume", { projectId: r.projectId }, { jobId: `film-editor-${r.projectId}-${out.toVersion}`, attempts: 2, removeOnComplete: 100 });
      }
      console.log(JSON.stringify({ event: "editor.applied", reviewId: r.id, ...out }));
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
      await prisma.editorialReview.update({ where: { id: r.id }, data: { status: "failed", error } }).catch(() => {});
      console.error(JSON.stringify({ event: "editor.apply_failed", reviewId: r.id, error }));
    }
  }
}

async function claimEditRequests(): Promise<void> {
  const pending = await prisma.editRequest.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 5 })
    .catch(() => []); // before migration 0039
  for (const req of pending) {
    const outcome = await processEditRequest(req, {
      claim: async (id) => (await prisma.editRequest.updateMany({ where: { id, status: "pending" }, data: { status: "applying" } })).count === 1,
      finish: async (id, d) => {
        await prisma.editRequest.update({
          where: { id },
          data: { status: d.status, issues: (d.issues ?? []) as object[], affectedShots: d.affectedShots, toVersion: d.toVersion, error: d.error, finishedAt: new Date() },
          select: { id: true },
        });
      },
      apply: (projectId, change, actor) => applyCanonRevision(prisma as unknown as CanonDb, projectId, change, { actor }),
      regenerate: async (projectId, toVersion) => {
        await filmQueue.add("resume", { projectId }, { jobId: `film-edit-${projectId}-${toVersion}`, attempts: 2, removeOnComplete: 100 });
      },
    });
    console.log(`[poller] edit request ${req.id} ${outcome}`);
  }
}

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
          const rejected = await prisma.project.updateMany({
            where: { id: p.id, status: "PLANNING" },
            data: { status: "FAILED", errorMessage: "Out of credits — top up to keep creating" },
          });
          if (rejected.count) await notifyFinish(p.id, "FAILED", "Out of credits — top up to keep creating");
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
      // ── Scene-by-scene: queued shots + assembly requests ───────────────
      await claimStoryboardWork();
      // Production passes (W8b): previs, approved scenes, final render of three-pass films.
      await advancePasses();
      // Locked films (W19): render once more from an approved timeline.
      await advanceLocks().catch((e) => console.error(`[poller] locks: ${e instanceof Error ? e.message : String(e)}`));
      // Director chat (W9): plain-language instructions become edit requests.
      await answerDirectorMessages();
      // Edit requests (W8b): an owner's canon change, applied; only affected shots regenerate.
      await claimEditRequests();
      // The Editor (W13): reviews of the cut, and the edits owners approved.
      await runEditor();
      // Speech cache (W14): a deleted voice's cached clips are deleted too.
      await purgeOrphanedSpeech(prisma as never, (keys) => new S3Storage().deleteKeys(keys))
        .then((n) => n && console.log(JSON.stringify({ event: "speech_cache.purged", clips: n })))
        .catch(() => {}); // before migration 0049

      // ── Voice Lab (docs/29): claim pending clones + voiceovers ─────────
      // Same producer/consumer split as films: the web writes PENDING rows,
      // we claim them atomically and enqueue. Stable jobIds dedupe re-claims.
      // A new voice is enrolled by the Voice Engine (W7): consent checked,
      // recording judged, engine artifact stored — one voice_jobs row each.
      const pendingVoices = await prisma.voice.findMany({ where: { status: "PENDING" }, select: { id: true, userId: true }, take: 5 });
      for (const v of pendingVoices) {
        const claimed = await prisma.voice.updateMany({ where: { id: v.id, status: "PENDING" }, data: { status: "CLONING" } });
        if (claimed.count === 1) {
          const vj = await prisma.voiceJob.create({ data: { userId: v.userId, voiceId: v.id, type: "voice.enroll" }, select: { id: true } });
          await voiceEngineQueue.add("voice.enroll", { jobId: vj.id }, { jobId: `voice-job-${vj.id}`, removeOnComplete: 100 });
          console.log(`[poller] enqueued voice enrollment ${v.id} (job ${vj.id})`);
        }
      }
      // Voice jobs the API created but whose enqueue was lost: re-enqueue after a minute (jobIds dedupe).
      const stranded = await prisma.voiceJob.findMany({
        where: { status: "queued", createdAt: { lt: new Date(Date.now() - 60_000) } },
        select: { id: true, type: true },
        take: 10,
      });
      for (const j of stranded) await voiceEngineQueue.add(j.type, { jobId: j.id }, { jobId: `voice-job-${j.id}`, removeOnComplete: 100 });
      const pendingVoiceovers = await prisma.voiceover.findMany({ where: { status: "PENDING" }, select: { id: true }, take: 5 });
      for (const vo of pendingVoiceovers) {
        const claimed = await prisma.voiceover.updateMany({ where: { id: vo.id, status: "PENDING" }, data: { status: "SPEAKING" } });
        if (claimed.count === 1) {
          await voiceLabQueue.add("speak", { kind: "speak", id: vo.id }, { jobId: `voiceover-${vo.id}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] enqueued voiceover ${vo.id}`);
        }
      }
      const pendingAvatars = await prisma.avatarVideo.findMany({ where: { status: "PENDING" }, select: { id: true }, take: 5 });
      for (const a of pendingAvatars) {
        const claimed = await prisma.avatarVideo.updateMany({ where: { id: a.id, status: "PENDING" }, data: { status: "RENDERING" } });
        if (claimed.count === 1) {
          await voiceLabQueue.add("avatar", { kind: "avatar", id: a.id }, { jobId: `avatar-${a.id}`, attempts: 2, removeOnComplete: 100 });
          console.log(`[poller] enqueued avatar video ${a.id}`);
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
