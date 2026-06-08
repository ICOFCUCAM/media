/**
 * Shared film-planning math (docs/05, docs/09). One source of truth so the
 * Director (which creates the shots) and the cost governor (which estimates
 * before generation) never disagree on how many scenes/shots a film has.
 */

export const AVG_SCENE_SEC = 18;
export const AVG_SHOT_SEC = 5;
export const MAX_SCENES = 400;

export function planSceneCount(targetSeconds: number): number {
  return Math.min(MAX_SCENES, Math.max(1, Math.round(targetSeconds / AVG_SCENE_SEC)));
}

export function planShotsPerScene(): number {
  return Math.max(1, Math.ceil(AVG_SCENE_SEC / AVG_SHOT_SEC));
}

export function planShotCount(targetSeconds: number): number {
  return planSceneCount(targetSeconds) * planShotsPerScene();
}
