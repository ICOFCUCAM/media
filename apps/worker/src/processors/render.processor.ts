/**
 * Render processor — consumes `render-queue`. As the flow ROOT it runs only
 * after every scene is finalized. A real implementation invokes the FFmpeg
 * Render Engine (docs/10) to stitch scene clips + audio + subtitles + intro/
 * outro into final.mp4 + an HLS ladder and uploads to S3. This stub computes
 * the duration and writes the Film row so the lifecycle completes.
 */
import { Worker } from "bullmq";
import { QUEUES, type RenderJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

export const renderWorker = new Worker<RenderJob>(
  QUEUES.render,
  async (job) => {
    const { projectId, kind } = job.data;
    if (kind !== "final") return { skipped: kind };

    const scenes = await prisma.scene.findMany({ where: { projectId } });
    const durationSec = scenes.reduce((a, s) => a + s.durationSec, 0);

    // TODO: real FFmpeg assembly + HLS + S3 upload (docs/10).
    const mp4Key = `projects/${projectId}/film/final.mp4`;
    const hlsKey = `projects/${projectId}/film/hls/master.m3u8`;

    await prisma.film.upsert({
      where: { projectId },
      create: { projectId, mp4Key, hlsKey, durationSec, publishedAt: new Date() },
      update: { mp4Key, hlsKey, durationSec, publishedAt: new Date() },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "READY", progress: 1 },
    });

    return { projectId, durationSec };
  },
  { connection, concurrency: 2 },
);
