/**
 * Production passes (DirectorOS W8b; Part 2 §87–88; migration 0040).
 *
 * A three-pass production runs STORY → PREVIS → FINAL:
 *   STORY   the plan waits for the owner (status REVIEW) — no stills, no video;
 *   PREVIS  once the story is approved, a storyboard still is drawn for every
 *           image-led shot (video queue job "previs"), still no video;
 *   FINAL   each scene whose storyboard the owner approves generates video;
 *           when every scene is approved and every shot is ready, the film
 *           renders.
 * The database refuses video for an unapproved scene (0040), so this module
 * only decides what to start; it can never let a scene skip its approval.
 */
import { Queue } from "bullmq";
import { prisma } from "@cineforge/db";
import { QUEUES, type RenderJob, type VideoJob } from "@cineforge/shared";
import { enqueueSceneFlow } from "./film-flow";
export { currentPass, scenesCleared, type Pass } from "./pass-rules";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
let videoQueue: Queue<VideoJob> | null = null;
let renderQueue: Queue<RenderJob> | null = null;

/** One poller tick: start previs, start approved scenes, render finished three-pass films. */
export async function advancePasses(): Promise<void> {
  videoQueue ??= new Queue<VideoJob>(QUEUES.video, { connection });
  renderQueue ??= new Queue<RenderJob>(QUEUES.render, { connection });

  // PREVIS: the story was approved — draw the storyboard stills (once per approval).
  const toPrevis = await prisma.project.findMany({
    where: { passMode: "three", storyApprovedAt: { not: null }, previsStartedAt: null },
    select: { id: true, modelId: true },
    take: 5,
  });
  for (const p of toPrevis) {
    const claimed = await prisma.project.updateMany({ where: { id: p.id, previsStartedAt: null, storyApprovedAt: { not: null } }, data: { previsStartedAt: new Date() } });
    if (claimed.count !== 1) continue;
    const shots = await prisma.shot.findMany({ where: { scene: { projectId: p.id }, source: "image" }, select: { id: true, sceneId: true } });
    for (const s of shots) {
      await videoQueue.add("previs", { projectId: p.id, sceneId: s.sceneId, shotId: s.id, modelId: p.modelId }, { jobId: `previs-${s.id}-${Date.now()}`, attempts: 2, removeOnComplete: 100 });
    }
    console.log(`[passes] previs started for ${p.id} (${shots.length} stills)`);
  }

  // FINAL, per scene: an approved storyboard whose scene has not started yet.
  const approved = await prisma.scene.findMany({
    where: { storyboardApprovedAt: { not: null }, status: "PENDING", project: { passMode: "three" }, shots: { some: { status: { not: "READY" } } } },
    select: { id: true, projectId: true },
    take: 10,
  });
  for (const sc of approved) {
    const claimed = await prisma.scene.updateMany({ where: { id: sc.id, status: "PENDING" }, data: { status: "GENERATING" } });
    if (claimed.count !== 1) continue;
    await prisma.project.updateMany({ where: { id: sc.projectId, status: { in: ["REVIEW", "READY", "FAILED"] } }, data: { status: "GENERATING", errorMessage: null } });
    await enqueueSceneFlow(sc.projectId, sc.id);
    console.log(`[passes] scene ${sc.id} approved — generating`);
  }

  // Render a three-pass film once every scene is approved and every shot is ready.
  const finishing = await prisma.project.findMany({
    where: { passMode: "three", status: "GENERATING", scenes: { some: {}, every: { storyboardApprovedAt: { not: null } } } },
    select: { id: true },
    take: 5,
  });
  for (const p of finishing) {
    const notReady = await prisma.shot.count({ where: { scene: { projectId: p.id }, OR: [{ status: { not: "READY" } }, { videoKey: null }] } });
    if (notReady) continue;
    const claimed = await prisma.project.updateMany({ where: { id: p.id, status: "GENERATING" }, data: { status: "RENDERING" } });
    if (claimed.count !== 1) continue;
    await renderQueue.add("final", { projectId: p.id, kind: "final" }, { jobId: `passes-render-${p.id}-${Date.now()}`, attempts: 2, removeOnComplete: 100 });
    console.log(`[passes] every scene approved and ready — rendering ${p.id}`);
  }
}
