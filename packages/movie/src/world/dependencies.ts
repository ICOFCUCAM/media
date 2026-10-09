/**
 * Dependency edges (DirectorOS W8; Part 2 §62): which canon entities each
 * planned shot depends on — its scene's location, everyone and everything it
 * frames, and the wardrobe each framed character wears (and what they hold)
 * in that scene. Stored
 * per shot (shot_dependencies) when a film is compiled, so "what does
 * changing this touch?" is a lookup, and an edit regenerates only those shots.
 */
import type { FilmPackage } from "../ir/schema";

export type DependencyType = "character" | "wardrobe" | "location" | "prop";

export interface DependencyEdge {
  type: DependencyType;
  key: string;
}

export interface ShotDependencies {
  sceneIndex: number;
  shotIndex: number;
  edges: DependencyEdge[];
}

const typeOf = (id: string): DependencyType | null =>
  id.startsWith("char_") ? "character" : id.startsWith("prop_") ? "prop" : id.startsWith("loc_") ? "location" : null;

export function shotDependencies(pkg: FilmPackage): ShotDependencies[] {
  const out: ShotDependencies[] = [];
  pkg.scenes.forEach((sc, sceneIndex) => {
    const state = new Map(sc.characters.map((c) => [c.characterId, c]));
    for (const sh of sc.shots) {
      const edges = new Map<string, DependencyEdge>();
      const add = (type: DependencyType, key: string) => edges.set(`${type}:${key}`, { type, key });
      add("location", sc.locationId);
      for (const id of sh.subjectIds) {
        const type = typeOf(id);
        if (!type) continue;
        add(type, id);
        const st = type === "character" ? state.get(id) : undefined;
        if (st) {
          add("wardrobe", st.wardrobeId);
          for (const prop of st.holding) add("prop", prop); // what a framed character holds is in frame
        }
      }
      out.push({ sceneIndex, shotIndex: sh.index, edges: [...edges.values()] });
    }
  });
  return out;
}

/** The shots that depend on an entity. */
export function dependents(deps: ShotDependencies[], type: DependencyType, key: string): { sceneIndex: number; shotIndex: number }[] {
  return deps.filter((d) => d.edges.some((e) => e.type === type && e.key === key)).map(({ sceneIndex, shotIndex }) => ({ sceneIndex, shotIndex }));
}
