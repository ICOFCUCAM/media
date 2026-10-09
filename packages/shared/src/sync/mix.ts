/**
 * How a film's stems are balanced (DirectorOS Part 1 §18, §20; W16). The
 * sync policy says where the master must land (integrated loudness, true
 * peak); the mix spec of the same production profile says how the stems sit
 * against each other on the way there:
 *
 *   dialogue   the anchor: never attenuated, every other stem makes room for it
 *   music      a bed under the film, ducked while anyone speaks
 *   ambience   the room tone of each scene, ducked gently under dialogue
 *   sfx        placed effects, never ducked (a door slam must land)
 *
 * Levels are dB relative to the stem's own generated level; ducking is a
 * sidechain compressor keyed by the dialogue stem.
 */
import type { ProductionProfile, SyncPolicy } from "./policy";

export interface DuckSpec {
  /** Sidechain threshold, linear amplitude (0..1). */
  threshold: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
}

export interface MixSpec {
  musicDb: number;
  ambienceDb: number;
  sfxDb: number;
  musicDuck: DuckSpec;
  ambienceDuck: DuckSpec;
  /** Loudness range the master is normalised to (LU). */
  loudnessRangeLu: number;
  /** Fade an ambience bed in and out at its scene's edges (seconds). */
  ambienceFadeSec: number;
}

const duck = (ratio: number, releaseMs = 300): DuckSpec => ({ threshold: 0.03, ratio, attackMs: 5, releaseMs });

const base: MixSpec = {
  musicDb: -4.5, ambienceDb: -14, sfxDb: -3,
  musicDuck: duck(8), ambienceDuck: duck(3, 400),
  loudnessRangeLu: 11, ambienceFadeSec: 0.5,
};

export const MIX_SPECS: Record<ProductionProfile, MixSpec> = {
  cinematic: base,
  // Speech-forward profiles keep beds lower and the range tighter.
  broadcast: { ...base, musicDb: -8, ambienceDb: -18, loudnessRangeLu: 8 },
  documentary: { ...base, musicDb: -7, ambienceDb: -16 },
  education: { ...base, musicDb: -10, ambienceDb: -20, sfxDb: -6, loudnessRangeLu: 8 },
  corporate: { ...base, musicDb: -8, ambienceDb: -18, sfxDb: -6, loudnessRangeLu: 8 },
  // Social plays on phones: brighter music, less range.
  social: { ...base, musicDb: -3, ambienceDb: -14, loudnessRangeLu: 7 },
};

/** The mix spec for a policy's profile (cinematic for a profile without one). */
export function mixSpec(policy: Pick<SyncPolicy, "id">): MixSpec {
  return MIX_SPECS[policy.id as ProductionProfile] ?? MIX_SPECS.cinematic;
}

/** dB → linear amplitude. */
export const dbToGain = (db: number) => Math.pow(10, db / 20);
