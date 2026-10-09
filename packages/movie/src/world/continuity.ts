/**
 * Character Continuity Engine (DirectorOS Part 2 §62; Part 1 §32; W3).
 *
 * Compares a requested shot generation against the canonical world state for
 * that point of the film and returns a ContinuityResult. It never passes a
 * shot merely because its characters exist (§62.7): every applicable check
 * runs and is listed in `checked`, and `correctedGenerationContext` is what
 * canon says the shot must show — the thing to generate from instead of the
 * request when they disagree.
 */
import { shotPrompt } from "../compile/shot-prompt";
import type { FilmCharacter, FilmPackage, FilmTimeOfDay } from "../ir/schema";
import { canonVersion } from "./version";
import { materializeWorld, type SceneWorld, type StoryClock, type WorldTimeline } from "./state";

/** What a generation asks for. Omitted fields mean "as planned". */
export interface GenerationRequest {
  sceneId: string;
  shotIndex: number;
  /** Who and what is framed (default: the planned shot's subjects). */
  subjectIds?: string[];
  locationId?: string;
  timeOfDay?: FilmTimeOfDay;
  characters?: {
    characterId: string;
    wardrobeId?: string;
    physical?: string | null;
    emotion?: string;
    holding?: string[];
    age?: number | null;
    hair?: string;
    face?: string;
    body?: string;
    marks?: string[];
  }[];
}

export type ContinuitySeverity = "none" | "warning" | "blocking";

export interface ContinuityViolation {
  code: string;
  severity: Exclude<ContinuitySeverity, "none">;
  /** The canon id the violation is about. */
  subjectId: string;
  expected: string | null;
  requested: string | null;
  message: string;
}

export interface AssetReference {
  kind: "character" | "wardrobe" | "location" | "prop";
  id: string;
  characterId?: string;
  reason: string;
}

export interface GenerationContext {
  sceneId: string;
  shotIndex: number;
  clock: StoryClock;
  /** How the framed characters stand with each other here. */
  relationships: { relationshipId: string; a: string; b: string; state: string }[];
  location: { id: string; name: string; description: string; lighting: string };
  characters: {
    characterId: string;
    name: string;
    age: number | null;
    identity: FilmCharacter["identity"];
    wardrobeId: string;
    wardrobe: string;
    physical: string | null;
    emotion: string;
    holding: { id: string; name: string }[];
  }[];
  props: { id: string; name: string; description: string; holderId: string | null }[];
  /** The canonical prompt for this shot. */
  prompt: string;
}

export interface ContinuityResult {
  passed: boolean;
  violations: ContinuityViolation[];
  requiredReferences: AssetReference[];
  correctedGenerationContext: GenerationContext;
  severity: ContinuitySeverity;
  /** Checks that actually ran (§62.5) — never empty for a shot with characters. */
  checked: string[];
  worldStateVersion: string;
}

export class ContinuityInputError extends Error {}

export function checkContinuity(pkg: FilmPackage, req: GenerationRequest, world: WorldTimeline = materializeWorld(pkg)): ContinuityResult {
  const si = pkg.scenes.findIndex((s) => s.id === req.sceneId);
  if (si < 0) throw new ContinuityInputError(`scene ${req.sceneId} does not exist`);
  const scene = pkg.scenes[si]!;
  const shot = scene.shots.find((s) => s.index === req.shotIndex);
  if (!shot) throw new ContinuityInputError(`${req.sceneId} has no shot ${req.shotIndex}`);
  const w: SceneWorld = world.scenes[si]!;
  const prevScene = si > 0 ? pkg.scenes[si - 1] : undefined;

  const cast = new Map(pkg.cast.map((c) => [c.id, c]));
  const props = new Map(pkg.props.map((p) => [p.id, p]));
  const locs = new Map(pkg.locations.map((l) => [l.id, l]));
  const subjects = req.subjectIds ?? shot.subjectIds;
  const framedChars = subjects.filter((s) => cast.has(s));
  const violations: ContinuityViolation[] = [];
  const checked = new Set<string>();
  const V = (severity: ContinuityViolation["severity"], code: string, subjectId: string, expected: string | null, requested: string | null, message: string) =>
    violations.push({ code, severity, subjectId, expected, requested, message });

  // Location and time.
  checked.add("location");
  if (req.locationId && req.locationId !== scene.locationId) {
    V("blocking", "LOCATION_MISMATCH", req.locationId, scene.locationId, req.locationId, `${scene.id} is set in ${scene.locationId}`);
  }
  for (const s of subjects) {
    // A different place in frame can be a view (the lighthouse seen from the quay) — flagged, not blocked.
    if (locs.has(s) && s !== scene.locationId) V("warning", "OTHER_LOCATION_IN_FRAME", s, scene.locationId, s, `${s} is framed but ${scene.id} is set in ${scene.locationId}`);
  }
  checked.add("time");
  if (req.timeOfDay && req.timeOfDay !== scene.timeOfDay) {
    V("blocking", "TIME_MISMATCH", scene.id, scene.timeOfDay, req.timeOfDay, `${scene.id} happens at ${scene.timeOfDay}`);
  }

  for (const id of framedChars) {
    const c = cast.get(id)!;
    const canon = w.characters[id]!;
    const ask = req.characters?.find((x) => x.characterId === id);
    checked.add("presence");
    if (!canon.present) {
      V("blocking", "CHARACTER_NOT_IN_SCENE", id, null, id, `${c.name} is framed but is not in ${scene.id}`);
      continue;
    }
    checked.add("alive");
    if (!canon.alive) {
      V("blocking", "CHARACTER_DEAD", id, `died in ${canon.diedIn}`, scene.id, `${c.name} died in ${canon.diedIn}; ${scene.id} is not a flashback`);
    }
    // Identity, age, hair, accessories (marks): canon never drifts.
    checked.add("identity").add("age").add("hair").add("accessories").add("body");
    for (const f of ["face", "hair", "body"] as const) {
      if (ask?.[f] !== undefined && ask[f] !== c.identity[f]) {
        V("blocking", `${f.toUpperCase()}_MISMATCH`, id, c.identity[f], ask[f]!, `${c.name}'s canonical ${f} is "${c.identity[f]}"`);
      }
    }
    if (ask?.age !== undefined && ask.age !== c.age) V("blocking", "AGE_MISMATCH", id, String(c.age), String(ask.age), `${c.name} is ${c.age}`);
    if (ask?.marks) {
      for (const m of c.identity.marks) if (!ask.marks.includes(m)) V("blocking", "MARK_MISSING", id, m, null, `${c.name} always has: ${m}`);
    }
    // Wardrobe.
    checked.add("wardrobe");
    if (ask?.wardrobeId && ask.wardrobeId !== canon.wardrobeId) {
      V("blocking", "WARDROBE_MISMATCH", id, canon.wardrobeId, ask.wardrobeId, `${c.name} wears ${canon.wardrobeId} in ${scene.id}`);
    }
    const before = prevScene?.characters.find((x) => x.characterId === id);
    if (scene.storyTime?.continuous && before && before.wardrobeId !== canon.wardrobeId) {
      V("blocking", "WARDROBE_BREAKS_CONTINUOUS_ACTION", id, before.wardrobeId, canon.wardrobeId,
        `${scene.id} continues ${prevScene!.id}, where ${c.name} wore ${before.wardrobeId}`);
    }
    // Injuries and body state.
    checked.add("injuries");
    if (ask && ask.physical !== undefined && ask.physical !== canon.physical) {
      if (canon.physical && !ask.physical) V("blocking", "INJURY_MISSING", id, canon.physical, null, `${c.name} must show: ${canon.physical}`);
      else V("warning", "PHYSICAL_MISMATCH", id, canon.physical, ask.physical, `${c.name}'s visible state in ${scene.id} is ${canon.physical ?? "unmarked"}`);
    }
    const lastSeen = previousAppearance(pkg, si, id);
    if (lastSeen?.physical && !canon.physical) {
      const sameDay = lastSeen.day !== null && lastSeen.day === scene.storyTime?.day;
      if (scene.storyTime?.continuous && lastSeen.sceneIndex === si - 1) {
        V("blocking", "INJURY_VANISHED", id, lastSeen.physical, null, `${c.name} was "${lastSeen.physical}" in the action this scene continues`);
      } else if (sameDay) {
        V("warning", "INJURY_VANISHED_SAME_DAY", id, lastSeen.physical, null, `${c.name} was "${lastSeen.physical}" earlier the same day (${lastSeen.sceneId})`);
      }
    }
    // Emotional state.
    checked.add("emotion");
    if (ask?.emotion && canon.emotion && ask.emotion !== canon.emotion) {
      V("warning", "EMOTION_MISMATCH", id, canon.emotion, ask.emotion, `${c.name} is ${canon.emotion} in ${scene.id}`);
    }
    // Possessions.
    checked.add("possessions");
    for (const p of ask?.holding ?? []) {
      const holder = w.props[p]?.holderId;
      if (holder && holder !== id) V("blocking", "PROP_HELD_BY_OTHER", p, holder, id, `${p} is held by ${holder} in ${scene.id}`);
    }
    // Knowledge: lines this character speaks in the scene.
    checked.add("knowledge");
    for (const d of scene.dialogue.filter((x) => x.characterId === id)) {
      for (const f of d.references) {
        if (!canon.knows.includes(f)) V("blocking", "KNOWLEDGE_VIOLATION", id, null, f, `${c.name} cannot know ${f} by ${scene.id}`);
      }
    }
  }
  // Props in frame must be here.
  for (const p of subjects.filter((s) => props.has(s))) {
    checked.add("possessions");
    const st = w.props[p]!;
    if (st.holderId && !w.characters[st.holderId]?.present) {
      V("blocking", "PROP_ELSEWHERE", p, st.holderId, scene.id, `${p} is with ${st.holderId}, who is not in ${scene.id}`);
    } else if (!st.holderId && st.locationId && st.locationId !== scene.locationId) {
      V("warning", "PROP_LAST_SEEN_ELSEWHERE", p, st.locationId, scene.locationId, `${p} was last seen in ${st.locationId}`);
    }
  }

  // References: identity + wardrobe per framed character, the location, props in play.
  const requiredReferences: AssetReference[] = [{ kind: "location", id: scene.locationId, reason: "setting" }];
  const inPlay = new Set(subjects.filter((s) => props.has(s)));
  for (const id of framedChars) {
    const canon = w.characters[id]!;
    if (!canon.present) continue;
    requiredReferences.push({ kind: "character", id, reason: "identity" });
    if (canon.wardrobeId) requiredReferences.push({ kind: "wardrobe", id: canon.wardrobeId, characterId: id, reason: "wardrobe in this scene" });
    canon.holding.forEach((p) => inPlay.add(p));
  }
  for (const p of inPlay) requiredReferences.push({ kind: "prop", id: p, reason: "in frame" });

  const loc = locs.get(scene.locationId)!;
  const context: GenerationContext = {
    sceneId: scene.id,
    shotIndex: shot.index,
    clock: w.clock,
    relationships: Object.values(w.relationships)
      .filter((r) => framedChars.includes(r.a) && framedChars.includes(r.b))
      .map(({ relationshipId, a, b, state }) => ({ relationshipId, a, b, state })),
    location: { id: loc.id, name: loc.name, description: loc.description, lighting: loc.lighting },
    characters: framedChars.filter((id) => w.characters[id]!.present).map((id) => {
      const c = cast.get(id)!;
      const st = w.characters[id]!;
      return {
        characterId: id, name: c.name, age: c.age, identity: c.identity, wardrobeId: st.wardrobeId!,
        wardrobe: c.wardrobe.find((x) => x.id === st.wardrobeId)!.description, physical: st.physical, emotion: st.emotion!,
        holding: st.holding.map((p) => ({ id: p, name: props.get(p)?.name ?? p })),
      };
    }),
    props: [...inPlay].map((p) => ({ id: p, name: props.get(p)!.name, description: props.get(p)!.description, holderId: w.props[p]!.holderId })),
    prompt: shotPrompt(pkg, scene, shot),
  };

  const severity: ContinuitySeverity = violations.some((v) => v.severity === "blocking") ? "blocking" : violations.length ? "warning" : "none";
  return {
    passed: severity !== "blocking",
    violations,
    requiredReferences,
    correctedGenerationContext: context,
    severity,
    checked: [...checked].sort(),
    worldStateVersion: canonVersion(pkg),
  };
}

/** The character's most recent on-screen state before scene `si`. */
function previousAppearance(pkg: FilmPackage, si: number, id: string) {
  for (let j = si - 1; j >= 0; j--) {
    const sc = pkg.scenes[j]!;
    const st = sc.characters.find((x) => x.characterId === id);
    if (st) return { sceneId: sc.id, sceneIndex: j, physical: st.physical, day: sc.storyTime?.day ?? null };
  }
  return null;
}

/** Check every planned shot of the film. */
export function checkFilmContinuity(pkg: FilmPackage): { sceneId: string; shotIndex: number; result: ContinuityResult }[] {
  const world = materializeWorld(pkg);
  return pkg.scenes.flatMap((sc) => sc.shots.map((sh) => ({
    sceneId: sc.id, shotIndex: sh.index, result: checkContinuity(pkg, { sceneId: sc.id, shotIndex: sh.index }, world),
  })));
}
