/**
 * Structured shot end state (DirectorOS W20; Part 1 §36.2). The end frame
 * (W6) shows where a shot ended as a picture; this says it in data: who is in
 * frame and in what state, where the camera ended, and what the light and
 * weather are. The next shot's canonical request carries it as
 * `continuity.continuesFrom`, and every generated clip records its own.
 */
import type { FilmPackage, FilmShot } from "../ir/schema";
import { checkContinuity, type GenerationContext } from "./continuity";
import { materializeWorld, type WorldTimeline } from "./state";

export interface ShotEndState {
  sceneId: string;
  shotIndex: number;
  location: { id: string; name: string };
  characters: { id: string; name: string; wardrobe: string; holding: string[]; physical: string | null; emotion: string | null }[];
  camera: { size: string; angle: string; movement: string; side: string | null; screenDirection: string | null };
  light: { timeOfDay: string; clock: string | null; sun: string; weather: string | null; lighting: string };
}

type ShotCamera = { size: string; angle: string; movement: string; side?: string | null; screenDirection?: string | null; lighting?: string | null; emotion?: string | null };

/** A shot's end state from its corrected generation context and its camera plan (pure). */
export function endStateOf(ctx: GenerationContext, shot: ShotCamera): ShotEndState {
  return {
    sceneId: ctx.sceneId,
    shotIndex: ctx.shotIndex,
    location: { id: ctx.location.id, name: ctx.location.name },
    characters: ctx.characters.map((c) => ({
      id: c.characterId, name: c.name, wardrobe: c.wardrobe, holding: c.holding.map((h) => h.name), physical: c.physical,
      emotion: shot.emotion ?? c.emotion ?? null,
    })),
    camera: { size: shot.size, angle: shot.angle, movement: shot.movement, side: shot.side ?? null, screenDirection: shot.screenDirection ?? null },
    light: {
      timeOfDay: ctx.clock.timeOfDay, clock: ctx.clock.clock, sun: ctx.clock.sun, weather: ctx.clock.weather,
      lighting: shot.lighting ?? ctx.location.lighting,
    },
  };
}

/**
 * Where the shot before this one ended: the previous shot of the scene, or —
 * for a scene's first shot — the last shot of the scene it continues. Null
 * when the shot opens on a time cut.
 */
export function previousEndState(pkg: FilmPackage, sceneId: string, shotIndex: number, world: WorldTimeline = materializeWorld(pkg)): ShotEndState | null {
  const si = pkg.scenes.findIndex((s) => s.id === sceneId);
  const scene = pkg.scenes[si];
  if (!scene) return null;
  const ordered = [...scene.shots].sort((a, b) => a.index - b.index);
  const at = ordered.findIndex((s) => s.index === shotIndex);
  let prevScene = scene;
  let prevShot: FilmShot | undefined = at > 0 ? ordered[at - 1] : undefined;
  if (!prevShot) {
    const before = pkg.scenes[si - 1];
    if (!scene.storyTime?.continuous || !before) return null;
    prevScene = before;
    prevShot = [...before.shots].sort((a, b) => a.index - b.index).at(-1);
  }
  if (!prevShot) return null;
  const ctx = checkContinuity(pkg, { sceneId: prevScene.id, shotIndex: prevShot.index }, world).correctedGenerationContext;
  return endStateOf(ctx, prevShot);
}
