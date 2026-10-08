/**
 * Canon revisions (DirectorOS Part 2 §62.8–62.9; W3).
 *
 * A canon change is applied to the Film IR as a pure function, re-validated,
 * and recompiled; the result names exactly the scenes and shots whose compiled
 * output changed. Only those are regenerated — everything else keeps its media.
 *
 * Changes made inside continuous action propagate across the whole
 * continuity run (scenes joined by `storyTime.continuous`): if Maya changes
 * into a blue coat in scene 12, and scene 12 picks up straight from scene 11,
 * she is wearing the blue coat in scene 11 too — and scene 10, a day earlier,
 * is untouched.
 */
import { compileFilm, type CompiledScene } from "../compile/compile";
import type { FilmCharacter, FilmLocation, FilmPackage } from "../ir/schema";
import { validateCanon, type Issue } from "../ir/validate";
import { canonGraph, shotKey, type CanonRef, type ShotRef } from "./graph";
import { runOf } from "./state";
import { canonVersion } from "./version";

export type CanonChange =
  /** From this scene (and across its continuity run) the character wears this wardrobe; a new id adds the entry. */
  | { kind: "scene_wardrobe"; sceneId: string; characterId: string; wardrobe: { id: string; description: string } }
  /** Rewrite a wardrobe entry everywhere it is worn. */
  | { kind: "wardrobe_description"; characterId: string; wardrobeId: string; description: string }
  /** Canonical identity (face, hair, body, marks) and age. */
  | { kind: "identity"; characterId: string; identity: Partial<FilmCharacter["identity"]>; age?: number | null }
  /** Visible physical state from this scene on, across its continuity run. */
  | { kind: "physical"; sceneId: string; characterId: string; physical: string | null }
  | { kind: "location"; locationId: string; patch: Partial<Pick<FilmLocation, "description" | "architecture" | "era" | "lighting">> }
  | { kind: "prop"; propId: string; patch: { name?: string; description?: string } };

export interface CanonRevision {
  pkg: FilmPackage;
  change: CanonChange;
  /** Canon issues in the revised package; a revision with issues must not be applied. */
  issues: Issue[];
  /** Scenes whose rows change (state, dialogue or any shot). */
  affectedScenes: string[];
  /** Shots whose compiled generation changed — regenerate exactly these. */
  affectedShots: ShotRef[];
  /** What the dependency graph predicted the change could touch. */
  predicted: { scenes: string[]; shots: ShotRef[] };
  /** Version of the canon before and after. */
  fromVersion: string;
  toVersion: string;
}

export class CanonChangeError extends Error {}

function apply(pkg: FilmPackage, change: CanonChange): FilmPackage {
  const next = structuredClone(pkg);
  const char = (id: string) => {
    const c = next.cast.find((x) => x.id === id);
    if (!c) throw new CanonChangeError(`character ${id} is not in the cast`);
    return c;
  };
  const sceneAt = (id: string) => {
    const i = next.scenes.findIndex((s) => s.id === id);
    if (i < 0) throw new CanonChangeError(`scene ${id} does not exist`);
    return i;
  };
  switch (change.kind) {
    case "scene_wardrobe": {
      const c = char(change.characterId);
      const i = sceneAt(change.sceneId);
      const existing = c.wardrobe.find((w) => w.id === change.wardrobe.id);
      if (existing) existing.description = change.wardrobe.description;
      else c.wardrobe.push({ ...change.wardrobe });
      const old = next.scenes[i]!.characters.find((s) => s.characterId === c.id)?.wardrobeId;
      if (!old) throw new CanonChangeError(`${c.id} is not in ${change.sceneId}`);
      // The same garment across the continuous action this scene belongs to.
      for (const j of runOf(next, i)) {
        const st = next.scenes[j]!.characters.find((s) => s.characterId === c.id);
        if (st && (j === i || st.wardrobeId === old)) st.wardrobeId = change.wardrobe.id;
      }
      return next;
    }
    case "wardrobe_description": {
      const w = char(change.characterId).wardrobe.find((x) => x.id === change.wardrobeId);
      if (!w) throw new CanonChangeError(`${change.wardrobeId} is not one of ${change.characterId}'s wardrobe entries`);
      w.description = change.description;
      return next;
    }
    case "identity": {
      const c = char(change.characterId);
      c.identity = { ...c.identity, ...change.identity };
      if (change.age !== undefined) c.age = change.age;
      return next;
    }
    case "physical": {
      char(change.characterId);
      const i = sceneAt(change.sceneId);
      if (!next.scenes[i]!.characters.some((s) => s.characterId === change.characterId)) {
        throw new CanonChangeError(`${change.characterId} is not in ${change.sceneId}`);
      }
      // From this scene to the end of its continuous action.
      for (const j of runOf(next, i).filter((j) => j >= i)) {
        const st = next.scenes[j]!.characters.find((s) => s.characterId === change.characterId);
        if (st) st.physical = change.physical;
      }
      return next;
    }
    case "location": {
      const l = next.locations.find((x) => x.id === change.locationId);
      if (!l) throw new CanonChangeError(`location ${change.locationId} does not exist`);
      Object.assign(l, change.patch);
      return next;
    }
    case "prop": {
      const p = next.props.find((x) => x.id === change.propId);
      if (!p) throw new CanonChangeError(`prop ${change.propId} does not exist`);
      Object.assign(p, change.patch);
      return next;
    }
  }
}

/** The canon nodes a change touches, and (for scene-scoped changes) the scenes it is confined to. */
function predictedRefs(pkg: FilmPackage, change: CanonChange): { refs: CanonRef[]; within?: Set<string> } {
  switch (change.kind) {
    case "scene_wardrobe":
    case "physical": {
      const i = pkg.scenes.findIndex((s) => s.id === change.sceneId);
      const run = runOf(pkg, i).filter((j) => change.kind === "scene_wardrobe" || j >= i);
      return { refs: [{ kind: "character", id: change.characterId }], within: new Set(run.map((j) => pkg.scenes[j]!.id)) };
    }
    case "wardrobe_description":
      return { refs: [{ kind: "wardrobe", id: change.wardrobeId }] };
    case "identity":
      return { refs: [{ kind: "character", id: change.characterId }] };
    case "location":
      return { refs: [{ kind: "location", id: change.locationId }] };
    case "prop":
      return { refs: [{ kind: "prop", id: change.propId }] };
  }
}

const sceneSig = (s: CompiledScene) => JSON.stringify({ statePatch: s.statePatch, dialogue: s.dialogue, summary: s.summary });
const shotSig = (s: CompiledScene["shots"][number]) => JSON.stringify(s);

export function reviseCanon(pkg: FilmPackage, change: CanonChange): CanonRevision {
  const next = apply(pkg, change);
  const issues = validateCanon(next);
  const before = compileFilm(pkg);
  const after = issues.some((i) => i.stage === "references") ? before : compileFilm(next);

  const affectedShots: ShotRef[] = [];
  const affectedScenes: string[] = [];
  after.scenes.forEach((sc, i) => {
    const old = before.scenes[i]!;
    let touched = sceneSig(old) !== sceneSig(sc);
    sc.shots.forEach((sh, j) => {
      if (shotSig(old.shots[j]!) !== shotSig(sh)) {
        affectedShots.push({ sceneId: sc.key, sceneIndex: sc.index, shotIndex: sh.index });
        touched = true;
      }
    });
    if (touched) affectedScenes.push(sc.key);
  });

  const graph = canonGraph(pkg);
  const { refs, within } = predictedRefs(pkg, change);
  const inScope = (sceneId: string) => !within || within.has(sceneId);
  const deps = refs.map((r) => graph.dependents(r));
  const predictedShots = new Map(deps.flatMap((d) => d.shots).filter((s) => inScope(s.sceneId)).map((s) => [shotKey(s), s]));
  const order = new Map(pkg.scenes.map((s) => [s.id, s.index]));
  const predictedScenes = [...new Set(deps.flatMap((d) => d.scenes))].filter(inScope).sort((a, b) => order.get(a)! - order.get(b)!);
  return {
    pkg: next,
    change,
    issues,
    affectedScenes,
    affectedShots,
    predicted: { scenes: predictedScenes, shots: [...predictedShots.values()] },
    fromVersion: canonVersion(pkg),
    toVersion: canonVersion(next),
  };
}
