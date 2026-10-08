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

/** Short-side pixels per output format. 4K is generated at 1080p and upscaled. */
const SHORT_SIDE: Record<string, number> = { "480p": 480, "720p": 720, "1080p": 1080, "4k": 1080 };

/**
 * Generation size for a project's chosen format and aspect ratio — one source
 * for the Director (cache keys) and the video processor (the request). The
 * long side is rounded down to a multiple of 32 (what video models accept):
 * 480p 16:9 → 832×480, 720p → 1280×720, 1080p → 1920×1080; portrait swaps.
 * Unknown values fall back to 720p / 16:9 rather than guessing silently: the
 * caller records the difference.
 */
export function outputDimensions(resolution: string | null | undefined, aspectRatio: string | null | undefined): [number, number] {
  const short = SHORT_SIDE[resolution ?? ""] ?? 720;
  const m = /^(\d+):(\d+)$/.exec(aspectRatio ?? "");
  const [a, b] = m ? [Number(m[1]), Number(m[2])] : [16, 9];
  if (!a || !b || a === b) return [short, short];
  const long = Math.floor((short * Math.max(a, b)) / Math.min(a, b) / 32) * 32;
  return a > b ? [long, short] : [short, long];
}
