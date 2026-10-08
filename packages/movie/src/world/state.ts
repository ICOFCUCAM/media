/**
 * World State Engine (DirectorOS Part 1 §55, §33, §56–57; W3).
 *
 * At every point of the film a typed WORLD STATE exists, keyed by the IR's
 * stable ids (never by display name). It is a pure fold over the Film IR,
 * scene by scene, so it is reproducible from `screenplays.raw` at any time:
 *
 *   - story time   — day, time of day, continuous action, flashback
 *   - characters   — present?, where, wardrobe, emotion, visible physical
 *                    state, what they hold, what they know
 *   - props        — who holds it, where it was last seen
 *   - audience     — what the audience has been shown
 *
 * Scenes state their characters' visible state explicitly (the planner is
 * required to); the engine carries everything forward for characters who are
 * off screen, so a later scene inherits where Maya was and what she carried.
 * Knowledge only grows: `facts[].knownAtStart`, then each scene's `reveals`.
 */
import { AUDIENCE, type FilmPackage, type FilmScene, type FilmTimeOfDay } from "../ir/schema";

export interface StoryClock {
  /** Story day, or null when the plan does not say (packages planned before W3). */
  day: number | null;
  timeOfDay: FilmTimeOfDay;
  continuous: boolean;
  flashback: boolean;
}

export interface CharacterWorldState {
  characterId: string;
  present: boolean;
  locationId: string | null;
  wardrobeId: string | null;
  emotion: string | null;
  physical: string | null;
  holding: string[];
  knows: string[];
  /** Last scene the character was on screen. */
  lastSceneId: string | null;
}

export interface PropWorldState {
  propId: string;
  holderId: string | null;
  /** Where the prop was last seen. */
  locationId: string | null;
}

export interface SceneWorld {
  sceneId: string;
  index: number;
  locationId: string;
  clock: StoryClock;
  characters: Record<string, CharacterWorldState>;
  props: Record<string, PropWorldState>;
  audienceKnows: string[];
}

export interface WorldTimeline {
  /** Knowledge before scene one, per knower (character id or "audience"). */
  initialKnowledge: Record<string, string[]>;
  /** World state during each scene, after its reveals (index-aligned with pkg.scenes). */
  scenes: SceneWorld[];
}

const TOD_ORDER: Record<FilmTimeOfDay, number> = { dawn: 0, day: 1, dusk: 2, night: 3 };
export const timeOfDayRank = (t: FilmTimeOfDay) => TOD_ORDER[t];

export function clockOf(scene: FilmScene): StoryClock {
  return {
    day: scene.storyTime?.day ?? null,
    timeOfDay: scene.timeOfDay,
    continuous: scene.storyTime?.continuous ?? false,
    flashback: scene.storyTime?.flashback ?? false,
  };
}

function sorted(set: Set<string>): string[] {
  return [...set].sort();
}

/** Knowledge per knower before scene one. */
export function initialKnowledge(pkg: FilmPackage): Map<string, Set<string>> {
  const k = new Map<string, Set<string>>();
  const add = (who: string, fact: string) => (k.get(who) ?? k.set(who, new Set()).get(who)!).add(fact);
  for (const c of pkg.cast) k.set(c.id, new Set());
  k.set(AUDIENCE, new Set());
  for (const f of pkg.facts) for (const who of f.knownAtStart) add(who, f.id);
  return k;
}

/** Apply one scene's reveals to a knowledge map (mutates). */
export function applyReveals(k: Map<string, Set<string>>, scene: FilmScene): void {
  for (const r of scene.reveals) for (const who of r.to) (k.get(who) ?? k.set(who, new Set()).get(who)!).add(r.factId);
}

export function materializeWorld(pkg: FilmPackage): WorldTimeline {
  const knowledge = initialKnowledge(pkg);
  const initial = Object.fromEntries([...knowledge].map(([who, s]) => [who, sorted(s)]));
  const chars = new Map<string, CharacterWorldState>(
    pkg.cast.map((c) => [c.id, {
      characterId: c.id, present: false, locationId: null, wardrobeId: null, emotion: null, physical: null,
      holding: [], knows: [], lastSceneId: null,
    }]),
  );
  const props = new Map<string, PropWorldState>(pkg.props.map((p) => [p.id, { propId: p.id, holderId: null, locationId: null }]));

  const scenes: SceneWorld[] = pkg.scenes.map((sc) => {
    applyReveals(knowledge, sc);
    const here = new Set(sc.characters.map((s) => s.characterId));
    for (const [id, st] of chars) {
      if (!here.has(id)) {
        chars.set(id, { ...st, present: false });
        continue;
      }
      const s = sc.characters.find((x) => x.characterId === id)!;
      // A prop this character put down stays where they last were.
      for (const p of st.holding) {
        if (!s.holding.includes(p)) {
          const prop = props.get(p);
          if (prop && prop.holderId === id) props.set(p, { ...prop, holderId: null });
        }
      }
      chars.set(id, {
        characterId: id, present: true, locationId: sc.locationId, wardrobeId: s.wardrobeId, emotion: s.emotion,
        physical: s.physical, holding: [...s.holding], knows: [], lastSceneId: sc.id,
      });
      for (const p of s.holding) if (props.has(p)) props.set(p, { propId: p, holderId: id, locationId: sc.locationId });
    }
    // Props travel with whoever holds them, on screen or not.
    for (const [p, st] of props) {
      if (st.holderId) props.set(p, { ...st, locationId: chars.get(st.holderId)?.locationId ?? st.locationId });
    }
    const characters = Object.fromEntries(
      [...chars].map(([id, st]) => [id, { ...st, holding: [...st.holding], knows: sorted(knowledge.get(id) ?? new Set()) }]),
    );
    return {
      sceneId: sc.id,
      index: sc.index,
      locationId: sc.locationId,
      clock: clockOf(sc),
      characters,
      props: Object.fromEntries([...props].map(([id, st]) => [id, { ...st }])),
      audienceKnows: sorted(knowledge.get(AUDIENCE) ?? new Set()),
    };
  });
  return { initialKnowledge: initial, scenes };
}

/**
 * Continuity runs: maximal chains of scenes joined by `storyTime.continuous`
 * (the action carries straight on). Within a run a character cannot change
 * clothes or shed an injury. Returns, per scene index, the run's scene indices.
 */
export function continuityRuns(pkg: FilmPackage): number[][] {
  const runs: number[][] = [];
  pkg.scenes.forEach((sc, i) => {
    if (i > 0 && sc.storyTime?.continuous) runs[runs.length - 1]!.push(i);
    else runs.push([i]);
  });
  return runs;
}

export function runOf(pkg: FilmPackage, sceneIndex: number): number[] {
  return continuityRuns(pkg).find((r) => r.includes(sceneIndex)) ?? [sceneIndex];
}
