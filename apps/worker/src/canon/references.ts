/**
 * Which characters' reference frames and identity LoRAs a shot needs
 * (DirectorOS Part 2 §62.6 `requiredReferences`; W3).
 *
 * Before W3 the video processor sent every character inherited so far — a
 * harbour establishing shot carried Maya's face and LoRA, and a two-hander
 * could carry a third character's. Now the Continuity Engine checks the shot
 * against the world state and names the characters actually in frame; only
 * their assets go to the runtime. A shot that contradicts canon is not
 * generated.
 */
import { checkContinuity, type ContinuityResult, type FilmPackage } from "@cineforge/movie";

export interface ShotReferences {
  /** Database character ids whose assets this shot needs; null = no Film IR (legacy project): use the inherited set. */
  characterIds: string[] | null;
  result: ContinuityResult | null;
  /** Canon key → database character id for this scene. */
  charIdByKey: Map<string, string>;
}

/**
 * @param stateChars the scene row's statePatch.characters (name → {id, key, …}) — maps canon keys to database ids.
 */
export function shotReferences(
  pkg: FilmPackage | null,
  sceneIndex: number,
  shotIndex: number,
  stateChars: Record<string, Record<string, string>> | undefined,
): ShotReferences {
  const scene = pkg?.scenes.find((s) => s.index === sceneIndex);
  if (!pkg || !scene || !scene.shots.some((s) => s.index === shotIndex)) return { characterIds: null, result: null, charIdByKey: new Map() };
  const result = checkContinuity(pkg, { sceneId: scene.id, shotIndex });
  const idByKey = new Map(Object.values(stateChars ?? {}).filter((a) => a.key && a.id).map((a) => [a.key!, a.id!]));
  // Scenes planned before W3 stored no canon key — fall back to the character's name.
  const byName = (key: string) => stateChars?.[pkg.cast.find((c) => c.id === key)?.name ?? ""]?.id;
  const charIdByKey = new Map<string, string>();
  for (const c of pkg.cast) {
    const id = idByKey.get(c.id) ?? byName(c.id);
    if (id) charIdByKey.set(c.id, id);
  }
  const characterIds = result.requiredReferences
    .filter((r) => r.kind === "character")
    .map((r) => charIdByKey.get(r.id))
    .filter((id): id is string => !!id);
  return { characterIds, result, charIdByKey };
}
