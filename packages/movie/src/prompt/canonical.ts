/**
 * Canonical media request (DirectorOS Part 1 §12, §14; W4).
 *
 * What a shot must show, in CineForge's own language — independent of any
 * model. Built purely from canon: the shot as planned, the world state at
 * that scene (the Continuity Engine's corrected context: identity, wardrobe,
 * visible state, holdings, relationships), the location, the film's look and
 * the scene's sound. Model-specific compilers (./compilers.ts) turn it into
 * each engine's syntax; nothing downstream invents canon.
 */
import { createHash } from "node:crypto";
import type { FilmPackage } from "../ir/schema";
import { checkContinuity, type GenerationContext } from "../world/continuity";
import { materializeWorld, type WorldTimeline } from "../world/state";
import { previousEndState, type ShotEndState } from "../world/end-state";

export interface CanonicalMediaRequest {
  /** scene id + "_shot" + index, e.g. scene_03_shot02 */
  shotId: string;
  durationSec: number;
  visualIntent: {
    action: string;
    emotion: string | null;
    subjects: {
      id: string;
      kind: "character" | "prop" | "location";
      name: string;
      /** Canonical look, for characters: identity, age, wardrobe, visible state. */
      look: string;
      holding: string[];
      /** How an animated character moves (W12 design), for motion models. */
      movement?: string;
    }[];
  };
  camera: {
    size: string;
    angle: string;
    movement: string;
    lens: string | null;
    side: "A" | "B" | "neutral" | null;
    screenDirection: "left" | "right" | null;
    transition: string;
    /** The rest of the shot record (W20), present only when the plan gives them. */
    composition?: string;
    depthOfField?: "shallow" | "medium" | "deep";
    focus?: string;
  };
  environment: {
    locationId: string;
    location: string;
    description: string;
    timeOfDay: string;
    storyDay: number | null;
    flashback: boolean;
    lighting: string;
    /** The story clock, the sun and the weather (W20), present only when known. */
    clock?: string;
    sun?: string;
    weather?: string;
  };
  style: {
    palette: string;
    texture: string;
    lensLanguage: string;
    lighting: string;
    /** Animation (W11; Part 5 §181): the style's look, motion and what to avoid. Absent for live action. */
    render?: RenderStyle;
  };
  continuity: {
    worldStateVersion: string;
    requiredReferences: { kind: string; id: string; characterId?: string }[];
    relationships: { a: string; b: string; state: string }[];
    /** Where the shot before ended (W20), structured; not part of the canonical hash. */
    continuesFrom?: ShotEndState | null;
  };
  audio: { ambience: string; music: string | null; sfx: string[] };
}

/** An animation style as the compilers need it (from @cineforge/shared STYLE_PROFILES). */
export interface RenderStyle {
  medium: "animation";
  style: string;
  look: string;
  motion: string;
  avoid: string;
}

const SIZE_WORDS: Record<string, string> = {
  EWS: "extreme wide shot", WS: "wide shot", MS: "medium shot", MCU: "medium close-up", CU: "close-up", ECU: "extreme close-up", INSERT: "insert shot",
};
export const sizeWords = (s: string) => SIZE_WORDS[s] ?? s;

function look(c: GenerationContext["characters"][number]): string {
  const marks = c.identity.marks.length ? `, ${c.identity.marks.join(", ")}` : "";
  const age = c.age !== null ? `${c.age}-year-old, ` : "";
  // Animated characters (W12) keep their proportions and exact colours in every shot.
  const design = c.design ? `; ${c.design.proportions}; colours: ${c.design.palette}` : "";
  return `${age}${c.identity.face}, ${c.identity.hair}, ${c.identity.body}${marks}${design}; wearing ${c.wardrobe}${c.physical ? `; ${c.physical}` : ""}`;
}

export function compileGeneration(
  pkg: FilmPackage,
  sceneId: string,
  shotIndex: number,
  world: WorldTimeline = materializeWorld(pkg),
  opts: { render?: RenderStyle | null } = {},
): CanonicalMediaRequest {
  const scene = pkg.scenes.find((s) => s.id === sceneId);
  const shot = scene?.shots.find((s) => s.index === shotIndex);
  if (!scene || !shot) throw new Error(`no shot ${sceneId}#${shotIndex}`);
  const r = checkContinuity(pkg, { sceneId, shotIndex }, world);
  const ctx = r.correctedGenerationContext;
  const loc = pkg.locations.find((l) => l.id === scene.locationId)!;
  const props = new Map(pkg.props.map((p) => [p.id, p]));
  const locs = new Map(pkg.locations.map((l) => [l.id, l]));
  const subjects: CanonicalMediaRequest["visualIntent"]["subjects"] = shot.subjectIds.map((id) => {
    const c = ctx.characters.find((x) => x.characterId === id);
    if (c) {
      return { id, kind: "character" as const, name: c.name, look: look(c), holding: c.holding.map((h) => h.name),
        ...(c.design ? { movement: c.design.movement } : {}) };
    }
    const p = props.get(id);
    if (p) return { id, kind: "prop" as const, name: p.name, look: p.description, holding: [] };
    const l = locs.get(id)!;
    return { id, kind: "location" as const, name: l.name, look: l.description, holding: [] };
  });
  return {
    shotId: `${scene.id}_shot${String(shot.index).padStart(2, "0")}`,
    durationSec: shot.durationSec,
    visualIntent: { action: shot.action, emotion: shot.emotion, subjects },
    camera: {
      size: shot.size, angle: shot.angle, movement: shot.movement, lens: shot.lens, side: shot.side,
      screenDirection: shot.screenDirection, transition: shot.transition,
      ...(shot.composition ? { composition: shot.composition } : {}),
      ...(shot.depthOfField ? { depthOfField: shot.depthOfField } : {}),
      ...(shot.focus ? { focus: shot.focus } : {}),
    },
    environment: {
      locationId: loc.id, location: loc.name, description: `${loc.description}; ${loc.architecture}; ${loc.era}`,
      timeOfDay: scene.timeOfDay, storyDay: scene.storyTime?.day ?? null, flashback: scene.storyTime?.flashback ?? false,
      lighting: shot.lighting ?? loc.lighting,
      // Present only when the plan gives them, so requests planned before W20 (and their hashes) are unchanged.
      ...(ctx.clock.clock ? { clock: ctx.clock.clock, sun: ctx.clock.sun } : {}),
      ...(ctx.clock.weather ? { weather: ctx.clock.weather } : {}),
    },
    style: {
      palette: pkg.film.visualStyle.palette, texture: pkg.film.visualStyle.texture,
      lensLanguage: pkg.film.visualStyle.lensLanguage, lighting: pkg.film.visualStyle.lighting,
      // Only present for animation, so live-action requests (and their hashes) are unchanged.
      ...(opts.render ? { render: opts.render } : {}),
    },
    continuity: {
      worldStateVersion: r.worldStateVersion,
      requiredReferences: r.requiredReferences.map(({ kind, id, characterId }) => (characterId ? { kind, id, characterId } : { kind, id })),
      relationships: ctx.relationships.map(({ a, b, state }) => ({ a, b, state })),
      continuesFrom: previousEndState(pkg, sceneId, shotIndex, world),
    },
    audio: { ambience: scene.audio.ambience, music: scene.audio.music, sfx: scene.audio.sfx },
  };
}

/** Content hash of a canonical request (what the shot must show, model-independent). */
export function canonicalHash(req: CanonicalMediaRequest): string {
  // Where the previous shot ended is context, not this shot's canon: a change to
  // another shot must not invalidate this one (W3 dependency precision).
  const { worldStateVersion: _v, continuesFrom: _c, ...continuity } = req.continuity;
  return createHash("sha256").update(JSON.stringify({ ...req, continuity })).digest("hex");
}
