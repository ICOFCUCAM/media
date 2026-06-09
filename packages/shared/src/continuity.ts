/**
 * The Continuity Engine — the layer that turns isolated clips into a coherent
 * movie. Every scene reads the *final state of all prior scenes* (the Project
 * Memory Graph) and writes its own changes, so character/world/location facts
 * carry forward and can never silently contradict (a destroyed village can't
 * reappear intact; winter can't become summer).
 *
 * Pure and framework-agnostic: the web storyboard folds it for the UI
 * (inherited state, continuity score, dependencies, timeline) and the worker
 * folds it to inject a "Previous State" preamble into each generation prompt.
 */

/** The bridge between two scenes — the secret sauce that connects them. */
export interface SceneBridge {
  whatJustHappened: string;
  whatChanged: string;
  whatCarriesForward: string;
  nextSceneRequirements: string;
}

export const EMPTY_BRIDGE: SceneBridge = {
  whatJustHappened: "",
  whatChanged: "",
  whatCarriesForward: "",
  nextSceneRequirements: "",
};

/** What a single scene changes about the world. Merged onto the running state. */
export interface StatePatch {
  /** character name -> { emotion, health, wardrobe, ... } */
  characters?: Record<string, Record<string, string>>;
  /** "Adisa->brother" -> "distrust" */
  relationships?: Record<string, string>;
  /** "village" -> "destroyed" */
  locations?: Record<string, string>;
  /** season, politics, religion, economy, ... */
  world?: Record<string, string>;
  /** character name -> current goal */
  goals?: Record<string, string>;
}

/** The accumulated Project Memory Graph at a point in the timeline. */
export interface ProjectState {
  characters: Record<string, Record<string, string>>;
  relationships: Record<string, string>;
  locations: Record<string, string>;
  world: Record<string, string>;
  goals: Record<string, string>;
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  index: number;
  heading: string;
  event: string;
}

export function emptyState(): ProjectState {
  return { characters: {}, relationships: {}, locations: {}, world: {}, goals: {}, timeline: [] };
}

/** A scene's inputs to the engine (a thin view over a stored scene). */
export interface SceneInput {
  index: number;
  heading: string;
  characterRef?: string | null;
  worldRef?: string | null;
  locationRef?: string | null;
  statePatch?: StatePatch | null;
  bridge?: SceneBridge | null;
  /** Explicit dependencies; defaults to [index-1] when omitted. */
  dependsOn?: number[] | null;
}

/** The engine's output for one scene. */
export interface SceneContinuity {
  index: number;
  /** State BEFORE this scene runs (folded from every prior scene). */
  inherited: ProjectState;
  /** The previous scene's bridge — what carries forward into this one. */
  bridgeIn: SceneBridge | null;
  dependsOn: number[];
  /** Scenes that declare a dependency on this one. */
  affects: number[];
  /** 0..100 — how well-connected/consistent this scene is. */
  score: number;
  /** Human-readable reasons behind the score (for tooltips). */
  notes: string[];
}

function clone(s: ProjectState): ProjectState {
  return {
    characters: Object.fromEntries(Object.entries(s.characters).map(([k, v]) => [k, { ...v }])),
    relationships: { ...s.relationships },
    locations: { ...s.locations },
    world: { ...s.world },
    goals: { ...s.goals },
    timeline: [...s.timeline],
  };
}

/** Merge a scene's patch onto the running state (mutates and returns it). */
export function applyPatch(state: ProjectState, patch: StatePatch | null | undefined): ProjectState {
  if (!patch) return state;
  for (const [name, attrs] of Object.entries(patch.characters ?? {})) {
    state.characters[name] = { ...(state.characters[name] ?? {}), ...attrs };
  }
  Object.assign(state.relationships, patch.relationships ?? {});
  Object.assign(state.locations, patch.locations ?? {});
  Object.assign(state.world, patch.world ?? {});
  Object.assign(state.goals, patch.goals ?? {});
  return state;
}

/**
 * Fold scenes in index order into per-scene continuity + the final state.
 * `inherited` for scene N is the state produced by scenes 0..N-1.
 */
export function computeContinuity(scenesIn: SceneInput[]): { perScene: SceneContinuity[]; final: ProjectState } {
  const scenes = [...scenesIn].sort((a, b) => a.index - b.index);
  const running = emptyState();
  const perScene: SceneContinuity[] = [];

  scenes.forEach((scene, i) => {
    const inherited = clone(running);
    const prev = i > 0 ? scenes[i - 1] : undefined;
    const bridgeIn = prev?.bridge ?? null;
    const dependsOn = scene.dependsOn && scene.dependsOn.length ? scene.dependsOn : prev ? [prev.index] : [];
    const { score, notes } = continuityScore(scene, inherited, bridgeIn, i);
    perScene.push({ index: scene.index, inherited, bridgeIn, dependsOn, affects: [], score, notes });

    // Advance the world: apply this scene's changes, then log the timeline.
    applyPatch(running, scene.statePatch);
    running.timeline.push({
      index: scene.index,
      heading: scene.heading,
      event: scene.bridge?.whatJustHappened?.trim() || scene.heading,
    });
  });

  // Back-fill `affects` from everyone's dependencies.
  const byIndex = new Map(perScene.map((c) => [c.index, c]));
  for (const c of perScene) for (const dep of c.dependsOn) byIndex.get(dep)?.affects.push(c.index);

  return { perScene, final: running };
}

/**
 * Deterministic, explainable score. Rewards a scene for being connected
 * (bridge in, anchored character/world/location, advancing state, bridging out)
 * and penalises hard contradictions (showing a location that's been destroyed).
 */
export function continuityScore(
  scene: SceneInput,
  inherited: ProjectState,
  bridgeIn: SceneBridge | null,
  position: number,
): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 0;
  const first = position === 0;

  if (first || (bridgeIn && bridgeIn.whatCarriesForward.trim())) {
    score += 25;
  } else {
    notes.push("No bridge from the previous scene");
  }
  if (scene.characterRef) score += 25;
  else notes.push("No anchored character");
  if (scene.worldRef || scene.locationRef) score += 20;
  else notes.push("No anchored world/location");
  if (hasPatch(scene.statePatch)) score += 15;
  else notes.push("Scene does not advance any state");
  if (scene.bridge && scene.bridge.whatCarriesForward.trim()) score += 15;
  else notes.push("No bridge to the next scene");

  // Hard contradiction: the scene is set in a location prior scenes destroyed.
  const loc = scene.locationRef?.toLowerCase();
  if (loc) {
    const status = findLocationStatus(inherited, loc);
    if (status && /destroy|ruin|burn|gone/.test(status)) {
      score -= 50;
      notes.push(`Location "${scene.locationRef}" was previously ${status}`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), notes };
}

function hasPatch(p: StatePatch | null | undefined): boolean {
  if (!p) return false;
  return Boolean(
    Object.keys(p.characters ?? {}).length ||
      Object.keys(p.relationships ?? {}).length ||
      Object.keys(p.locations ?? {}).length ||
      Object.keys(p.world ?? {}).length ||
      Object.keys(p.goals ?? {}).length,
  );
}

function findLocationStatus(state: ProjectState, locLower: string): string | undefined {
  for (const [k, v] of Object.entries(state.locations)) if (k.toLowerCase() === locLower) return v;
  return undefined;
}

/**
 * Render the inherited state + incoming bridge as a prompt preamble. The worker
 * prepends this to the scene prompt so the generated clip continues naturally.
 */
export function renderStatePreamble(c: SceneContinuity, _scene?: SceneInput): string {
  const s = c.inherited;
  const lines: string[] = [];
  for (const [name, attrs] of Object.entries(s.characters)) {
    const desc = Object.entries(attrs)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    if (desc) lines.push(`- ${name} — ${desc}`);
  }
  for (const [pair, rel] of Object.entries(s.relationships)) lines.push(`- Relationship ${pair}: ${rel}`);
  for (const [loc, status] of Object.entries(s.locations)) lines.push(`- Location ${loc}: ${status}`);
  for (const [k, v] of Object.entries(s.world)) lines.push(`- World ${k}: ${v}`);
  for (const [who, goal] of Object.entries(s.goals)) lines.push(`- Goal (${who}): ${goal}`);

  const parts: string[] = [];
  if (lines.length) {
    parts.push("Previous State (continuity — keep consistent, do not contradict):\n" + lines.join("\n"));
  }
  if (c.bridgeIn?.whatCarriesForward.trim()) parts.push(`Carried forward: ${c.bridgeIn.whatCarriesForward.trim()}`);
  if (c.bridgeIn?.nextSceneRequirements.trim()) parts.push(`This scene must: ${c.bridgeIn.nextSceneRequirements.trim()}`);
  return parts.join("\n");
}
