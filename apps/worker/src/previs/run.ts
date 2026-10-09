/**
 * Build one scene's previs animatic from what previs made (W19): the scene's
 * storyboard stills and its voice track. Recorded as a video media version of
 * the scene (derivation role "animatic") with its rough timing; a voice that
 * runs past the planned pictures is flagged PREVIS_TIMING.
 */
import { degradation, type Degradation } from "@cineforge/shared";
import { planAnimatic, renderAnimatic, type AnimaticDeps, type AnimaticPlan } from "./animatic";
import { recordVersion, type VersionDb } from "../versions/record";

export interface AnimaticDb extends VersionDb {
  scene: {
    findUnique(a: unknown): Promise<{
      id: string; index: number; projectId: string;
      project: { aspectRatio: string | null };
      shots: { id: string; durationSec: number; seedImageKey: string | null; cameraMovement: string | null }[];
      audioTracks: { key: string; durationMs: number | null }[];
    } | null>;
  };
}

export type AnimaticOutcome =
  | { status: "built"; key: string; plan: AnimaticPlan; gaps: Degradation[] }
  | { status: "skipped"; reason: string };

export async function buildSceneAnimatic(db: AnimaticDb, media: AnimaticDeps, sceneId: string, stamp = Date.now()): Promise<AnimaticOutcome> {
  const scene = await db.scene.findUnique({
    where: { id: sceneId },
    select: {
      id: true, index: true, projectId: true,
      project: { select: { aspectRatio: true } },
      shots: { orderBy: { index: "asc" }, select: { id: true, durationSec: true, seedImageKey: true, cameraMovement: true } },
      audioTracks: { where: { kind: "VOICE" }, take: 1, select: { key: true, durationMs: true } },
    },
  });
  if (!scene) return { status: "skipped", reason: "scene gone" };
  const voice = scene.audioTracks[0] ?? null;
  const plan = planAnimatic(
    scene.shots.map((s) => ({ id: s.id, durationSec: s.durationSec, stillKey: s.seedImageKey, cameraMovement: s.cameraMovement })),
    voice?.durationMs != null ? voice.durationMs / 1000 : null,
  );
  if (!plan.segments.length) return { status: "skipped", reason: "the scene has no shots" };
  const key = `projects/${scene.projectId}/previs/${scene.id}/animatic-${stamp}.mp4`;
  await renderAnimatic(media, plan, { voiceKey: voice?.key ?? null, key, aspectRatio: scene.project.aspectRatio });
  await recordVersion(db, {
    projectId: scene.projectId, assetType: "video", assetId: scene.id, storageKey: key, durationSec: plan.pictureSec,
    derivation: {
      role: "animatic", shots: plan.segments.length, missingStills: plan.missingStills, voice: voice?.key ?? null,
      pictureSec: plan.pictureSec, voiceSec: plan.voiceSec, overrunSec: plan.overrunSec,
    },
  });
  const gaps: Degradation[] = [];
  if (plan.overrunSec > 0) {
    gaps.push(degradation("PREVIS_TIMING", "scene",
      `Scene ${scene.index + 1}: the voice runs ${plan.overrunSec.toFixed(1)}s longer than the planned pictures (${plan.pictureSec.toFixed(1)}s). Lengthen the shots or shorten the lines before approving.`,
      { refId: scene.id, detail: { pictureSec: plan.pictureSec, voiceSec: plan.voiceSec, overrunSec: plan.overrunSec } }));
  }
  return { status: "built", key, plan, gaps };
}
