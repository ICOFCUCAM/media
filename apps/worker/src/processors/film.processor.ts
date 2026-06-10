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
import { moderatePrompt } from "../director/moderation";
import { enqueueFilmFlow } from "../orchestration/film-flow";
import { realtime } from "../realtime";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const director = new DirectorService();

export const filmWorker = new Worker<FilmJob>(
  QUEUES.film,
  async (job) => {
    const { projectId } = job.data;

    if (job.name !== "resume") {
      // Content gate — before planning, before any GPU spend.
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { prompt: true },
      });
      const verdict = await moderatePrompt(project.prompt);
      if (!verdict.allowed) {
        const message = "Content policy: this prompt can't be produced.";
        await prisma.project.update({
          where: { id: projectId },
          data: { status: "FAILED", errorMessage: message },
        });
        await realtime.emit("error", { projectId, scope: "moderation", message });
        console.log(`[film] blocked project ${projectId} by content policy (${verdict.reason})`);
        return { projectId, blocked: verdict.reason };
      }

      // NB: stay on GENERATING while the Director writes. Setting the status
      // back to PLANNING here made the project claimable AGAIN by the poller
      // every tick for the whole ~70s planning window — duplicate film jobs,
      // duplicate Director runs, and flows enqueued against half-written
      // scene lists (an empty children list makes the render root run
      // immediately and record a phantom zero-duration film).
      await director.plan(projectId);
    }

    const sceneCount = await enqueueFilmFlow(projectId);

    await prisma.project.update({ where: { id: projectId }, data: { status: "GENERATING" } });
    await realtime.emit("project.progress", { projectId, progress: 0, status: "GENERATING" });
    return { projectId, scenes: sceneCount, resumed: job.name === "resume" };
  },
  { connection, concurrency: 4 },
);
