/**
 * Canon dependency graph (DirectorOS Part 2 §62.8–62.9, §91; W3).
 *
 * Which scenes, shots and dialogue lines depend on each piece of canon:
 *
 *   character  → scenes they are in, shots they are framed in
 *   wardrobe   → scenes it is worn in, shots framing its wearer there
 *   location   → scenes set there (every shot: the setting is in each prompt),
 *                shots framing it
 *   prop       → scenes where it is held, shots framing it
 *   fact       → scenes revealing it, dialogue lines relying on it
 *   style      → every shot (the film's look is in each prompt)
 *
 * This answers "what does changing X touch?" before anything is regenerated.
 */
import type { FilmPackage } from "../ir/schema";

export type CanonRef =
  | { kind: "character" | "wardrobe" | "location" | "prop" | "fact"; id: string }
  | { kind: "style" };

export interface ShotRef {
  sceneId: string;
  sceneIndex: number;
  shotIndex: number;
}

export interface Dependents {
  scenes: string[];
  shots: ShotRef[];
  lines: { sceneId: string; index: number }[];
}

export interface CanonGraph {
  dependents(ref: CanonRef): Dependents;
  /** Every canon node with at least one dependent, as "kind:id". */
  nodes(): string[];
}

const keyOf = (ref: CanonRef) => (ref.kind === "style" ? "style" : `${ref.kind}:${ref.id}`);
export const shotKey = (s: ShotRef) => `${s.sceneId}#${s.shotIndex}`;

export function canonGraph(pkg: FilmPackage): CanonGraph {
  const scenes = new Map<string, Set<string>>();
  const shots = new Map<string, Map<string, ShotRef>>();
  const lines = new Map<string, Map<string, { sceneId: string; index: number }>>();
  const castIds = new Set(pkg.cast.map((c) => c.id));
  const propIds = new Set(pkg.props.map((p) => p.id));
  const add = <T>(m: Map<string, Map<string, T>>, k: string, id: string, v: T) => (m.get(k) ?? m.set(k, new Map()).get(k)!).set(id, v);
  const addScene = (k: string, id: string) => (scenes.get(k) ?? scenes.set(k, new Set()).get(k)!).add(id);

  for (const sc of pkg.scenes) {
    addScene(`location:${sc.locationId}`, sc.id);
    for (const st of sc.characters) {
      addScene(`character:${st.characterId}`, sc.id);
      addScene(`wardrobe:${st.wardrobeId}`, sc.id);
      for (const p of st.holding) addScene(`prop:${p}`, sc.id);
    }
    for (const r of sc.reveals) addScene(`fact:${r.factId}`, sc.id);
    sc.dialogue.forEach((d, i) => {
      for (const f of d.references) {
        addScene(`fact:${f}`, sc.id);
        add(lines, `fact:${f}`, `${sc.id}#${i}`, { sceneId: sc.id, index: i });
      }
    });
    for (const sh of sc.shots) {
      const ref: ShotRef = { sceneId: sc.id, sceneIndex: sc.index, shotIndex: sh.index };
      const k = shotKey(ref);
      add(shots, "style", k, ref);
      add(shots, `location:${sc.locationId}`, k, ref);
      for (const s of sh.subjectIds) {
        if (castIds.has(s)) {
          add(shots, `character:${s}`, k, ref);
          const w = sc.characters.find((x) => x.characterId === s)?.wardrobeId;
          if (w) add(shots, `wardrobe:${w}`, k, ref);
        } else if (propIds.has(s)) {
          add(shots, `prop:${s}`, k, ref);
          addScene(`prop:${s}`, sc.id);
        } else {
          add(shots, `location:${s}`, k, ref);
        }
      }
    }
  }
  const order = new Map(pkg.scenes.map((s) => [s.id, s.index]));
  return {
    dependents(ref) {
      const k = keyOf(ref);
      const sceneIds = new Set(scenes.get(k) ?? []);
      for (const s of shots.get(k)?.values() ?? []) sceneIds.add(s.sceneId);
      if (k === "style") pkg.scenes.forEach((s) => sceneIds.add(s.id));
      return {
        scenes: [...sceneIds].sort((a, b) => order.get(a)! - order.get(b)!),
        shots: [...(shots.get(k)?.values() ?? [])].sort((a, b) => a.sceneIndex - b.sceneIndex || a.shotIndex - b.shotIndex),
        lines: [...(lines.get(k)?.values() ?? [])],
      };
    },
    nodes() {
      return [...new Set([...scenes.keys(), ...shots.keys()])].sort();
    },
  };
}
