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
import { ffmpeg } from "../ffmpeg/ffmpeg";
import { S3Storage } from "../storage/storage";
import { buildSceneAnimatic, type AnimaticDb } from "../previs/run";
import { recordDegradations, type DegradationDb } from "../truth/recorder";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

export const sceneWorker = new Worker<SceneJob>(
  QUEUES.scene,
  async (job) => {
    const { projectId, sceneId } = job.data;

    // Previs (W19): the scene's animatic, after its stills and voice. Never marks the scene READY.
    if (job.name === "animatic") {
      if (!process.env.S3_BUCKET) return { sceneId, animatic: "no storage" };
      const storage = new S3Storage();
      try {
        const out = await buildSceneAnimatic(prisma as unknown as AnimaticDb, {
          download: (k, d) => storage.download(k, d), upload: (p, k, ct) => storage.upload(p, k, ct), ffmpeg: (a) => ffmpeg(a),
        }, sceneId);
        if (out.status === "built" && out.gaps.length) await recordDegradations(prisma as unknown as DegradationDb, projectId, out.gaps);
        console.log(JSON.stringify({ event: "previs.animatic", sceneId, ...(out.status === "built" ? { key: out.key, pictureSec: out.plan.pictureSec, voiceSec: out.plan.voiceSec, overrunSec: out.plan.overrunSec } : { skipped: out.reason }) }));
        return { sceneId, animatic: out.status === "built" ? out.key : out.reason };
      } catch (e) {
        // An animatic that cannot be built never blocks approval: the stills are still there.
        const reason = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        if (job.attemptsMade + 1 < (job.opts.attempts ?? 1)) throw e;
        console.warn(JSON.stringify({ event: "previs.animatic", sceneId, error: reason }));
        return { sceneId, animatic: "failed", reason };
      }
    }

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

    return { sceneId, durationSec };
  },
  { connection, concurrency: 8 },
);
