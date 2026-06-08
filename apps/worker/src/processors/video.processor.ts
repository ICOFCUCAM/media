/**
 * Video worker — consumes `video-queue`, generates one shot via the model
 * abstraction layer (Wan 2.1 / Hunyuan on RunPod A40), runs QC, stores the
 * result, and advances continuity. See docs/09-scene-pipeline.md & 13-queues.md.
 *
 * This is a reference processor showing how the shared contracts, the model
 * registry, and the DB fit together. Wire it into the worker bootstrap
 * (apps/worker/src/main.ts) alongside the other queue processors.
 */
import { Worker } from "bullmq";
import { QUEUES, type VideoJob } from "@cineforge/shared";
import { buildDefaultRegistry, type ShotRequest } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { realtime } from "../realtime";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

const registry = buildDefaultRegistry({
  WAN_GPU_URL: process.env.WAN_GPU_URL!,
  HUNYUAN_GPU_URL: process.env.HUNYUAN_GPU_URL!,
  RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
});

/** Compose the final ShotRequest from the persisted shot + bible/continuity. */
async function buildShotRequest(shotId: string): Promise<ShotRequest> {
  const shot = await prisma.shot.findUniqueOrThrow({
    where: { id: shotId },
    include: { scene: { include: { project: true, location: true } } },
  });
  // The real Prompt Builder composes bible + continuity + camera here
  // (docs/09-scene-pipeline.md). The shot.prompt is already the composed text.
  const [w, h] = shot.scene.project.aspectRatio === "16:9" ? [1280, 720] : [720, 1280];
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

export const videoWorker = new Worker<VideoJob>(
  QUEUES.video,
  async (job) => {
    const { shotId, modelId } = job.data;
    const adapter = registry.get(modelId);

    await prisma.shot.update({ where: { id: shotId }, data: { status: "GENERATING" } });

    const req = await buildShotRequest(shotId);
    const result = await adapter.generate(req);

    // QC gate (docs/09): blackdetect, identity/CLIP match, ffprobe — omitted
    // here; on failure, throw to trigger BullMQ retry with stronger conditioning.

    await prisma.shot.update({
      where: { id: shotId },
      data: {
        status: "READY",
        videoKey: result.videoKey,
        thumbnailKey: result.thumbnailKey,
        seed: BigInt(result.seed),
        gpuMs: result.gpuMs,
        attempts: { increment: 1 },
      },
    });

    // Meter usage in GPU-ms (docs/15-monetization.md).
    await prisma.usageRecord.create({
      data: {
        userId: (await prisma.project.findUniqueOrThrow({
          where: { id: job.data.projectId },
          select: { userId: true },
        })).userId,
        projectId: job.data.projectId,
        gpuMs: result.gpuMs,
        kind: "video",
      },
    });

    await realtime.emit("shot.ready", {
      projectId: job.data.projectId,
      sceneId: job.data.sceneId,
      shotId,
      thumbnailKey: result.thumbnailKey,
    });

    return { shotId, videoKey: result.videoKey, gpuMs: result.gpuMs };
  },
  {
    connection,
    concurrency: Number(process.env.VIDEO_CONCURRENCY ?? 4), // bounded by GPU pool
    limiter: { max: 100, duration: 1000 },
  },
);
