/**
 * Film processor — consumes `film-queue`. Runs the Director to plan + persist
 * the whole film, then fans it out as a single BullMQ FLOW so dependencies are
 * enforced by the queue itself (docs/13):
 *
 *   render (root, runs last)
 *     └─ scene-finalize  (one per scene, runs after its shots+audio)
 *          ├─ shot  -> video-queue (GPU: Wan 2.1 / Hunyuan)
 *          └─ music -> audio-queue
 *
 * A parent job only becomes active once all its children complete, so the final
 * render runs after every scene is ready, and each scene-finalize runs after all
 * its shots + audio are done. See docs/05 + docs/09.
 */
import { Worker, FlowProducer } from "bullmq";
import { QUEUES, type FilmJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { DirectorService } from "../director/director.service";
import { realtime } from "../realtime";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const director = new DirectorService();
const flow = new FlowProducer({ connection });

export const filmWorker = new Worker<FilmJob>(
  QUEUES.film,
  async (job) => {
    const { projectId } = job.data;

    await prisma.project.update({ where: { id: projectId }, data: { status: "PLANNING" } });
    const plan = await director.plan(projectId);

    await flow.add({
      name: "render-final",
      queueName: QUEUES.render,
      data: { projectId, kind: "final" },
      opts: { attempts: 2, removeOnComplete: 100 },
      children: plan.scenes.map((scene) => ({
        name: "scene-finalize",
        queueName: QUEUES.scene,
        data: { projectId, sceneId: scene.id, index: scene.index },
        opts: { attempts: 2 },
        children: [
          ...scene.shots.map((shot) => ({
            name: "shot",
            queueName: QUEUES.video,
            data: { projectId, sceneId: scene.id, shotId: shot.id, modelId: plan.modelId },
            opts: { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
          })),
          {
            name: "music",
            queueName: QUEUES.audio,
            data: { projectId, sceneId: scene.id, kind: "music" },
            opts: { attempts: 2 },
          },
        ],
      })),
    });

    await prisma.project.update({ where: { id: projectId }, data: { status: "GENERATING" } });
    await realtime.emit("project.progress", { projectId, progress: 0, status: "GENERATING" });
    return { projectId, scenes: plan.scenes.length };
  },
  { connection, concurrency: 4 },
);
