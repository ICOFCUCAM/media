/**
 * Video worker — consumes `video-queue`, generates one shot via the model
 * abstraction layer (Wan 2.1 / Hunyuan on RunPod A40), runs QC, stores the
 * result, and meters cost. See docs/09, docs/13, docs/24 §C7/§C8.
 *
 * Phase 3 additions:
 *  - Content-addressed cache (C7): before spending GPU, reuse an existing READY
 *    clip in the same project with the same cacheKey (editor re-render / repeats).
 *  - Cost metering + credit debit (C8): only billed when GPU is actually used.
 */
import { Worker, UnrecoverableError } from "bullmq";
import { QUEUES, shouldPauseForBudget, type VideoJob } from "@cineforge/shared";
import { buildClusterRegistry, MODEL_VERSIONS, type ShotRequest } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { realtime } from "../realtime";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

// Multi-GPU dispatch (docs/24 §C5): each model is backed by N workers
// (WAN_GPU_URLS / HUNYUAN_GPU_URLS comma-separated), round-robined per call.
const registry = buildClusterRegistry({
  WAN_GPU_URLS: process.env.WAN_GPU_URLS,
  WAN_GPU_URL: process.env.WAN_GPU_URL,
  HUNYUAN_GPU_URLS: process.env.HUNYUAN_GPU_URLS,
  HUNYUAN_GPU_URL: process.env.HUNYUAN_GPU_URL,
  RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
});

type ShotWithScene = Awaited<ReturnType<typeof loadShot>>;

function loadShot(shotId: string) {
  return prisma.shot.findUniqueOrThrow({
    where: { id: shotId },
    include: { scene: { include: { project: true, location: true } } },
  });
}

/** Compose the final ShotRequest from the persisted shot + bible/continuity. */
function buildShotRequest(shot: ShotWithScene): ShotRequest {
  const [w, h] = shot.scene.project.aspectRatio === "9:16" ? [720, 1280] : [1280, 720];
  return {
    prompt: shot.prompt,
    negativePrompt: shot.negativePrompt ?? undefined,
    seed: shot.seed ? Number(shot.seed) : undefined,
    durationSec: shot.durationSec,
    width: w,
    height: h,
    camera: (shot.cameraPlan as ShotRequest["camera"]) ?? undefined,
  };
}

/** Look for an already-generated clip with the same cacheKey in this project. */
async function findCacheHit(shot: ShotWithScene): Promise<{ videoKey: string; thumbnailKey: string | null } | null> {
  if (!shot.cacheKey) return null;
  const hit = await prisma.shot.findFirst({
    where: {
      cacheKey: shot.cacheKey,
      status: "READY",
      videoKey: { not: null },
      id: { not: shot.id },
      scene: { projectId: shot.scene.projectId },
    },
    select: { videoKey: true, thumbnailKey: true },
    orderBy: { updatedAt: "desc" },
  });
  return hit?.videoKey ? { videoKey: hit.videoKey, thumbnailKey: hit.thumbnailKey } : null;
}

export const videoWorker = new Worker<VideoJob>(
  QUEUES.video,
  async (job) => {
    const { shotId, modelId, projectId, sceneId } = job.data;
    const shot = await loadShot(shotId);

    // ── Idempotent resume (C8): a shot already generated is a no-op ──────
    if (shot.status === "READY" && shot.videoKey) {
      await realtime.emit("shot.ready", { projectId, sceneId, shotId, thumbnailKey: shot.thumbnailKey ?? undefined });
      return { shotId, videoKey: shot.videoKey, gpuMs: 0, alreadyDone: true };
    }

    // ── Budget pause gate (C8): stop dispatching GPU work when paused ────
    if (shot.scene.project.status === "PAUSED") {
      throw new UnrecoverableError("project paused (budget ceiling reached)");
    }

    // ── Cache hit (C7): reuse an identical clip, zero GPU spend ──────────
    const cached = await findCacheHit(shot);
    if (cached) {
      await prisma.shot.update({
        where: { id: shotId },
        data: {
          status: "READY",
          videoKey: cached.videoKey,
          thumbnailKey: cached.thumbnailKey,
          gpuMs: 0,
          attempts: { increment: 1 },
        },
      });
      await realtime.emit("shot.ready", { projectId, sceneId, shotId, thumbnailKey: cached.thumbnailKey ?? undefined });
      return { shotId, videoKey: cached.videoKey, gpuMs: 0, cached: true };
    }

    // ── Generate ────────────────────────────────────────────────────────
    const adapter = registry.get(modelId);
    await prisma.shot.update({ where: { id: shotId }, data: { status: "GENERATING" } });

    const result = await adapter.generate(buildShotRequest(shot));

    // QC gate (docs/09) omitted here; on failure throw to trigger retry.

    await prisma.shot.update({
      where: { id: shotId },
      data: {
        status: "READY",
        videoKey: result.videoKey,
        thumbnailKey: result.thumbnailKey,
        seed: BigInt(result.seed),
        gpuMs: result.gpuMs,
        modelVersion: shot.modelVersion ?? MODEL_VERSIONS[modelId],
        attempts: { increment: 1 },
      },
    });

    // ── Meter + debit + budget tracking (C8) ────────────────────────────
    const { userId } = shot.scene.project;
    const [, , updatedProject] = await prisma.$transaction([
      prisma.usageRecord.create({
        data: { userId, projectId, gpuMs: result.gpuMs, kind: "video" },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { creditsMs: { decrement: result.gpuMs } },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: { spentMs: { increment: result.gpuMs } },
        select: { spentMs: true, estimatedMs: true },
      }),
    ]);

    await realtime.emit("shot.ready", { projectId, sceneId, shotId, thumbnailKey: result.thumbnailKey });

    // Pause the project if it blew past its budget ceiling. Already-queued
    // shots then fail-fast at the gate above; the GPU drains and shuts down.
    if (shouldPauseForBudget(updatedProject.estimatedMs, updatedProject.spentMs)) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "PAUSED", errorMessage: "Budget ceiling reached" },
      });
      await realtime.emit("project.paused", {
        projectId,
        reason: "budget",
        spentMs: updatedProject.spentMs,
        estimatedMs: updatedProject.estimatedMs ?? undefined,
      });
    }

    return { shotId, videoKey: result.videoKey, gpuMs: result.gpuMs };
  },
  {
    connection,
    concurrency: Number(process.env.VIDEO_CONCURRENCY ?? 4), // bounded by GPU pool
    limiter: { max: 100, duration: 1000 },
  },
);
