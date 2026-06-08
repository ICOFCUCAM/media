/**
 * Film processor — consumes `film-queue`. Two job names:
 *  - "plan"   (initial): run the Director to plan + persist the whole film, then
 *             enqueue the flow.
 *  - "resume" (after budget pause, docs/24 §C8): re-enqueue the flow from the
 *             persisted scenes/shots WITHOUT re-planning — completed shots are
 *             preserved and short-circuit, pending shots regenerate.
 *
 * The flow (docs/13) is: render (root) <- scene-finalize <- shots + music, so
 * dependencies are enforced by the queue.
 */
import { Worker } from "bullmq";
import { QUEUES, type FilmJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { DirectorService } from "../director/director.service";
import { enqueueFilmFlow } from "../orchestration/film-flow";
import { realtime } from "../realtime";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const director = new DirectorService();

export const filmWorker = new Worker<FilmJob>(
  QUEUES.film,
  async (job) => {
    const { projectId } = job.data;

    if (job.name !== "resume") {
      await prisma.project.update({ where: { id: projectId }, data: { status: "PLANNING" } });
      await director.plan(projectId);
    }

    const sceneCount = await enqueueFilmFlow(projectId);

    await prisma.project.update({ where: { id: projectId }, data: { status: "GENERATING" } });
    await realtime.emit("project.progress", { projectId, progress: 0, status: "GENERATING" });
    return { projectId, scenes: sceneCount, resumed: job.name === "resume" };
  },
  { connection, concurrency: 4 },
);
