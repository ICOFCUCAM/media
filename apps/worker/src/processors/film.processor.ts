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
import { QUEUES, planCapSec, degradation, isProductionFailure, type FilmJob, type Degradation } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { DirectorService } from "../director/director.service";
import { moderatePrompt } from "../director/moderation";
import { enqueueFilmFlow } from "../orchestration/film-flow";
import { realtime } from "../realtime";
import { recordDegradations, type DegradationDb } from "../truth/recorder";
import { recordGates, type GateDb } from "../quality/recorder";

/** Stop the project with a reason the user can read; never deliver a stand-in. */
async function failProject(projectId: string, code: string, message: string) {
  await prisma.project.update({ where: { id: projectId }, data: { status: "FAILED", errorMessage: message.slice(0, 500) } });
  await realtime.emit("error", { projectId, scope: "planning", message });
  console.warn(JSON.stringify({ event: "production.failed", projectId, code, message }));
}

const FAILURE_MESSAGES: Record<string, string> = {
  DIRECTOR_UNAVAILABLE: "The film couldn't be planned: the AI Director is unavailable right now. No credits were used — please try again.",
  DIRECTOR_OUTPUT_INVALID: "The film couldn't be planned: the AI Director's plan failed validation twice. No credits were used — please try again.",
  DIRECTOR_REFUSED: "The film couldn't be planned: the AI Director declined this brief. No credits were used — try rewording it.",
  MODERATION_UNAVAILABLE: "The film couldn't start: the content check is unavailable right now. No credits were used — please try again.",
};

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
        select: { prompt: true, targetSeconds: true, user: { select: { tier: true, role: true } } },
      });

      // Tier length gate — authoritative (the web's locked chips are cosmetic).
      // Over-length projects are CLAMPED, not failed: the user still gets a
      // film, at their plan's ceiling, with the reason recorded.
      const cap = planCapSec(project.user.tier, project.user.role);
      if (project.targetSeconds > cap) {
        await prisma.project.update({
          where: { id: projectId },
          data: { targetSeconds: cap, errorMessage: `Length clamped to your plan's ${cap}s ceiling — upgrade for longer films` },
        });
        console.log(`[film] clamped project ${projectId} from ${project.targetSeconds}s to ${cap}s (tier ${project.user.tier})`);
      }

      const gaps: Degradation[] = [];
      const verdict = await moderatePrompt(project.prompt);
      if (!verdict.checked) {
        if (process.env.MODERATION_REQUIRED === "1") {
          await failProject(projectId, "MODERATION_UNAVAILABLE", FAILURE_MESSAGES.MODERATION_UNAVAILABLE!);
          return { projectId, failed: "MODERATION_UNAVAILABLE" };
        }
        gaps.push(degradation("MODERATION_SKIPPED", "project", "The content check did not run for this film.", {
          detail: { reason: verdict.unchecked },
        }));
      }
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
      try {
        const plan = await director.plan(projectId);
        gaps.push(...plan.degradations);
        await recordGates(prisma as unknown as GateDb, projectId, "film", "plan", plan.gates);
      } catch (e) {
        if (!isProductionFailure(e)) throw e;
        await recordDegradations(prisma as unknown as DegradationDb, projectId, gaps);
        await failProject(projectId, e.code, FAILURE_MESSAGES[e.code] ?? e.message);
        return { projectId, failed: e.code };
      }
      await recordDegradations(prisma as unknown as DegradationDb, projectId, gaps);
    }

    const sceneCount = await enqueueFilmFlow(projectId);

    await prisma.project.update({ where: { id: projectId }, data: { status: "GENERATING" } });
    await realtime.emit("project.progress", { projectId, progress: 0, status: "GENERATING" });
    return { projectId, scenes: sceneCount, resumed: job.name === "resume" };
  },
  { connection, concurrency: 4 },
);
