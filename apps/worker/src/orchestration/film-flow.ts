/**
 * Builds and enqueues the film's BullMQ flow from the PERSISTED scenes/shots
 * (docs/13). Used for both initial generation (after the Director plans) and
 * resume-after-pause (docs/24 §C8) — it never re-plans, so completed shots are
 * preserved. Idempotent: completed shots short-circuit in the video processor,
 * and existing audio tracks are skipped, so re-enqueuing the full flow is safe
 * and cheap (cache hits cost 0 GPU).
 */
import { FlowProducer } from "bullmq";
import { QUEUES } from "@cineforge/shared";
import { tierPriority, type Tier } from "@cineforge/gpu";
import { prisma } from "@cineforge/db";
import { shotNodes } from "./shot-nodes";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };


const flow = new FlowProducer({ connection });

export async function enqueueFilmFlow(projectId: string): Promise<number> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { modelId: true, user: { select: { tier: true } } },
  });
  // Fair scheduling (docs/24 §C5): higher tiers get higher dispatch priority.
  const priority = tierPriority(project.user.tier as Tier);
  const scenes = await prisma.scene.findMany({
    where: { projectId },
    orderBy: { index: "asc" },
    include: { shots: { orderBy: { index: "asc" } } },
  });

  await flow.add({
    name: "render-final",
    queueName: QUEUES.render,
    data: { projectId, kind: "final" },
    opts: { attempts: 2, removeOnComplete: 100 },
    children: scenes.map((scene) => ({
      name: "scene-finalize",
      queueName: QUEUES.scene,
      data: { projectId, sceneId: scene.id, index: scene.index },
      opts: { attempts: 2 },
      children: [
        ...shotNodes(scene.shots.map((sh) => sh.id), (shotId) => ({
          name: "shot",
          queueName: QUEUES.video,
          data: { projectId, sceneId: scene.id, shotId, modelId: project.modelId },
          opts: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, priority },
        })),
        {
          name: "music",
          queueName: QUEUES.audio,
          data: { projectId, sceneId: scene.id, kind: "music" },
          opts: { attempts: 2, priority },
        },
        {
          // Narration: OpenAI TTS reads the scene's dialogue (or summary) —
          // the render engine stitches every scene's track into the film's
          // voice bed. No-ops gracefully when TTS isn't configured.
          name: "voice",
          queueName: QUEUES.audio,
          data: { projectId, sceneId: scene.id, kind: "voice" },
          opts: { attempts: 2, priority },
        },
      ],
    })),
  });

  return scenes.length;
}

/**
 * One scene of a scene-by-scene (storyboard) project, on the same pipeline an
 * auto film uses: its shots + narration + music, then scene-finalize (which
 * marks the scene READY and advances project progress). Called by the poller
 * when the Director's Board queues a scene; assembly is a separate render job.
 */
export async function enqueueSceneFlow(projectId: string, sceneId: string): Promise<number> {
  const scene = await prisma.scene.findUniqueOrThrow({
    where: { id: sceneId },
    select: {
      id: true,
      index: true,
      shots: { orderBy: { index: "asc" }, select: { id: true } },
      project: { select: { modelId: true, user: { select: { tier: true } } } },
    },
  });
  const priority = tierPriority(scene.project.user.tier as Tier);
  await flow.add({
    name: "scene-finalize",
    queueName: QUEUES.scene,
    data: { projectId, sceneId: scene.id, index: scene.index },
    opts: { attempts: 2, removeOnComplete: 100 },
    children: [
      ...shotNodes(scene.shots.map((sh) => sh.id), (shotId) => ({
        name: "shot",
        queueName: QUEUES.video,
        data: { projectId, sceneId: scene.id, shotId, modelId: scene.project.modelId },
        opts: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, priority },
      })),
      { name: "music", queueName: QUEUES.audio, data: { projectId, sceneId: scene.id, kind: "music" }, opts: { attempts: 2, priority } },
      { name: "voice", queueName: QUEUES.audio, data: { projectId, sceneId: scene.id, kind: "voice" }, opts: { attempts: 2, priority } },
    ],
  });
  return scene.shots.length;
}
