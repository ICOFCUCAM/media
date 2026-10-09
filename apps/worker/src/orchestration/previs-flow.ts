import { QUEUES } from "@cineforge/shared";

/**
 * One scene's previs flow (W19): its storyboard stills and its voice, then the
 * animatic. A child that fails does not hold the animatic back
 * (ignoreDependencyOnFailure): the animatic shows what there is.
 */
export function previsFlow(p: { id: string; modelId: string }, scene: { id: string; index: number; shots: { id: string; source: string }[] }, stamp: number) {
  const keep = { ignoreDependencyOnFailure: true, removeOnComplete: 100 };
  return {
    name: "animatic",
    queueName: QUEUES.scene,
    data: { projectId: p.id, sceneId: scene.id, index: scene.index },
    opts: { jobId: `animatic-${scene.id}-${stamp}`, attempts: 2, removeOnComplete: 100 },
    children: [
      ...scene.shots.filter((s) => s.source === "image").map((s) => ({
        name: "previs",
        queueName: QUEUES.video,
        data: { projectId: p.id, sceneId: scene.id, shotId: s.id, modelId: p.modelId },
        opts: { jobId: `previs-${s.id}-${stamp}`, attempts: 2, ...keep },
      })),
      { name: "voice", queueName: QUEUES.audio, data: { projectId: p.id, sceneId: scene.id, kind: "voice" as const }, opts: { attempts: 2, ...keep } },
    ],
  };
}
