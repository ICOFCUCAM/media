/**
 * Pure cost estimation in GPU-milliseconds (docs/24 §C8, docs/12). Lives here
 * (not inside an adapter instance) so the API can run a PRE-FLIGHT estimate
 * without a live GPU connection, and the adapters delegate to it so there's a
 * single cost formula. Calibrate `MODEL_COST` from real RunPod A40 telemetry.
 */

export const MODEL_VERSIONS: Record<string, string> = {
  "wan-2.1": "wan-2.1-1.0",
  hunyuan: "hunyuan-1.0",
  cinematic: "fal-kling-2.1",
};

interface CostBase {
  baseMs: number; // ~per reference clip on an A40 48GB
  refW: number;
  refH: number;
  refDur: number;
}

// Both models share a common 720p/5s reference so cost comparisons at equal
// output are apples-to-apples (premium Hunyuan costs more at the same target).
const MODEL_COST: Record<string, CostBase> = {
  "wan-2.1": { baseMs: 12_000, refW: 1280, refH: 720, refDur: 5 },
  hunyuan: { baseMs: 22_000, refW: 1280, refH: 720, refDur: 5 },
};

export function estimateShotMs(
  modelId: string,
  r: { width: number; height: number; durationSec: number },
): number {
  const c = MODEL_COST[modelId] ?? MODEL_COST["wan-2.1"]!;
  const resFactor = (r.width * r.height) / (c.refW * c.refH);
  return Math.round(c.baseMs * resFactor * (r.durationSec / c.refDur));
}

/** FFmpeg camera pass per still-motion shot, counted like render overhead. */
export const STILL_MOTION_SHOT_MS = 500;

/** Whole-film estimate from planned scene/shot counts (see @cineforge/shared planning). */
export function estimateFilmMs(
  modelId: string,
  p: { shotCount: number; sceneCount: number; width: number; height: number; shotDurationSec?: number; stillMotion?: boolean },
): number {
  // Storybook / motion comic (W12): a drawn still per shot (metered as an image) moved by
  // the camera in FFmpeg — no video model, no GPU; only the camera pass is counted.
  if (p.stillMotion) return p.sceneCount * 2_000 + p.shotCount * STILL_MOTION_SHOT_MS;
  const perShot = estimateShotMs(modelId, {
    width: p.width,
    height: p.height,
    durationSec: p.shotDurationSec ?? 5,
  });
  const video = p.shotCount * perShot;
  const audio = p.sceneCount * 2_000; // ~2s GPU per music cue (MusicGen)
  const render = Math.round(video * 0.05); // assembly overhead
  return video + audio + render;
}
