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
 *   - story state  — who is alive, how each relationship stands
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
  /** 24h clock the scene starts at (W20), or null when the plan does not say. */
  clock: string | null;
  /** Where the sun is (W20): from the clock when there is one, else the time of day. */
  sun: SunPhase;
  /** The weather in force (W20): the scene's own, else carried from earlier the same story day; null when unknown. */
  weather: string | null;
  /** True when the weather was carried forward rather than stated by the scene. */
  weatherInherited: boolean;
}

export type SunPhase = "night" | "dawn" | "morning" | "midday" | "afternoon" | "golden hour" | "dusk";

/** Minutes since midnight of an HH:MM clock. */
export function clockMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

/** The sun's phase at a clock, or from the time of day when there is no clock (pure). */
export function sunPhase(clock: string | null | undefined, timeOfDay: FilmTimeOfDay): SunPhase {
  if (!clock) return timeOfDay === "day" ? "midday" : timeOfDay;
  const m = clockMinutes(clock);
  if (m < 5 * 60) return "night";
  if (m < 7 * 60) return "dawn";
  if (m < 11 * 60) return "morning";
  if (m < 14 * 60) return "midday";
  if (m < 17 * 60) return "afternoon";
  if (m < 19 * 60) return "golden hour";
  if (m < 20 * 60 + 30) return "dusk";
  return "night";
}

/** The time of day a clock falls in, with an hour's grace either side (pure). */
export function clockFitsTimeOfDay(clock: string, timeOfDay: FilmTimeOfDay): boolean {
  const m = clockMinutes(clock);
  const within = (a: number, b: number) => m >= a * 60 - 60 && m <= b * 60 + 60;
  switch (timeOfDay) {
    case "dawn": return within(4, 7);
    case "day": return within(7, 17);
    case "dusk": return within(17, 20.5);
    case "night": return m >= 19.5 * 60 || m <= 6 * 60;
  }
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
  /** False once the character has died in an earlier (present-time) scene. Flashbacks show them alive. */
  alive: boolean;
  /** The scene they died in, if they have. */
  diedIn: string | null;
}

export interface RelationshipWorldState {
  relationshipId: string;
  a: string;
  b: string;
  state: string;
  /** Scene that last changed it (null = as at the start). */
  changedIn: string | null;
}

export interface GoalWorldState {
  goalId: string;
  characterId: string;
  want: string;
  /** open until a scene moves it; achieved and abandoned are final. */
  status: "open" | "advanced" | "blocked" | "achieved" | "abandoned";
  changedIn: string | null;
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
  relationships: Record<string, RelationshipWorldState>;
  goals: Record<string, GoalWorldState>;
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

export function clockOf(scene: FilmScene, carried: string | null = null): StoryClock {
  const clock = scene.storyTime?.clock ?? null;
  const own = scene.weather ?? null;
  return {
    day: scene.storyTime?.day ?? null,
    timeOfDay: scene.timeOfDay,
    continuous: scene.storyTime?.continuous ?? false,
    flashback: scene.storyTime?.flashback ?? false,
    clock,
    sun: sunPhase(clock, scene.timeOfDay),
    weather: own ?? carried,
    weatherInherited: !own && carried !== null,
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
      holding: [], knows: [], lastSceneId: null, alive: true, diedIn: null,
    }]),
  );
  const rels = new Map<string, RelationshipWorldState>(
    pkg.relationships.map((r) => [r.id, { relationshipId: r.id, a: r.a, b: r.b, state: r.initial, changedIn: null }]),
  );
  const goals = new Map<string, GoalWorldState>(
    pkg.goals.map((g) => [g.id, { goalId: g.id, characterId: g.characterId, want: g.want, status: "open", changedIn: null }]),
  );
  const died = new Map<string, string>();
  const props = new Map<string, PropWorldState>(pkg.props.map((p) => [p.id, { propId: p.id, holderId: null, locationId: null }]));
  // Weather carries forward through the same story day of the present-time story (W20).
  let weatherDay: { day: number; weather: string } | null = null;

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
        physical: s.physical, holding: [...s.holding], knows: [], lastSceneId: sc.id, alive: true, diedIn: null,
      });
      for (const p of s.holding) if (props.has(p)) props.set(p, { propId: p, holderId: id, locationId: sc.locationId });
    }
    // Props travel with whoever holds them, on screen or not.
    for (const [p, st] of props) {
      if (st.holderId) props.set(p, { ...st, locationId: chars.get(st.holderId)?.locationId ?? st.locationId });
    }
    for (const ch of sc.relationshipChanges) {
      const r = rels.get(ch.relationshipId);
      if (r) rels.set(ch.relationshipId, { ...r, state: ch.becomes, changedIn: sc.id });
    }
    for (const ch of sc.goalChanges) {
      const g = goals.get(ch.goalId);
      if (g && g.status !== "achieved" && g.status !== "abandoned") goals.set(ch.goalId, { ...g, status: ch.status, changedIn: sc.id });
    }
    const flashback = sc.storyTime?.flashback ?? false;
    // Alive during this scene: not dead from an earlier present-time scene (a flashback shows the past).
    const characters = Object.fromEntries(
      [...chars].map(([id, st]) => {
        const diedIn = died.get(id) ?? null;
        return [id, {
          ...st, holding: [...st.holding], knows: sorted(knowledge.get(id) ?? new Set()),
          alive: flashback || !diedIn, diedIn,
        }];
      }),
    );
    if (!flashback) for (const d of sc.deaths) if (!died.has(d)) died.set(d, sc.id);
    const day = sc.storyTime?.day ?? null;
    const carried = !flashback && day !== null && weatherDay?.day === day ? weatherDay.weather : null;
    const clock = clockOf(sc, carried);
    if (!flashback && day !== null && clock.weather) weatherDay = { day, weather: clock.weather };
    return {
      sceneId: sc.id,
      index: sc.index,
      locationId: sc.locationId,
      clock,
      characters,
      props: Object.fromEntries([...props].map(([id, st]) => [id, { ...st }])),
      relationships: Object.fromEntries([...rels].map(([id, r]) => [id, { ...r }])),
      goals: Object.fromEntries([...goals].map(([id, g]) => [id, { ...g }])),
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
