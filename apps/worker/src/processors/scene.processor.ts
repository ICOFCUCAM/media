/**
 * Scene-finalize processor — consumes `scene-queue`. Runs AFTER all of a
 * scene's shots + audio complete (enforced by the flow). Computes the scene
 * duration, marks it READY, and advances overall project progress. A real
 * implementation also stitches the scene's shots into scene.mp4 (docs/10) and
 * advances the Continuity Engine (docs/06).
 */
import { Worker } from "bullmq";
import { QUEUES, type SceneJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { realtime } from "../realtime";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

export const sceneWorker = new Worker<SceneJob>(
  QUEUES.scene,
  async (job) => {
    const { projectId, sceneId } = job.data;

    const shots = await prisma.shot.findMany({ where: { sceneId } });
    const durationSec = shots.reduce((a, s) => a + s.durationSec, 0);

    await prisma.scene.update({
      where: { id: sceneId },
      data: { status: "READY", durationSec },
    });

    // Advance project progress = fraction of scenes READY.
    const [total, ready] = await Promise.all([
      prisma.scene.count({ where: { projectId } }),
      prisma.scene.count({ where: { projectId, status: "READY" } }),
    ]);
    const progress = total ? ready / total : 0;
    await prisma.project.update({ where: { id: projectId }, data: { progress } });

    await realtime.emit("scene.ready", { projectId, sceneId, index: job.data.index });
    await realtime.emit("project.progress", { projectId, progress, status: "GENERATING" });
    return { sceneId, durationSec };
  },
  { connection, concurrency: 8 },
);
