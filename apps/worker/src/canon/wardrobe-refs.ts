/**
 * Wardrobe reference pack at render time (DirectorOS W3 follow-up; §62.9).
 *
 * For every framed character the Continuity Engine names a wardrobe reference.
 * Each is a still of the character's canonical identity in that wardrobe,
 * keyed by a digest of the canon it shows (packages/movie world/wardrobe.ts):
 * found → reused; missing → generated once with the image provider and
 * recorded (migration 0034); a canon change → new digest → new still. When no
 * still can be had the shot still runs on identity frames and the gap is a
 * recorded degradation, never silent.
 */
import { degradation, type Degradation } from "@cineforge/shared";
import { wardrobeReferenceSpec, type ContinuityResult, type FilmPackage } from "@cineforge/movie";
import { isMissingTable } from "../timeline/store";

export interface WardrobeRefDb {
  wardrobeReference: {
    findFirst(a: unknown): Promise<{ storageKey: string } | null>;
    create(a: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface ReferenceImageGenerator {
  readonly id: string;
  /** Generate a still and store it at `key`; returns the stored key. `meta` names the canon it depicts (for the image record). */
  generate(prompt: string, key: string, meta?: { subject: string; digest: string }): Promise<string>;
}

let tableMissing = false;
/** Test hook. */
export function _resetWardrobeRefState(): void {
  tableMissing = false;
}

export async function wardrobeReferenceKeys(
  db: WardrobeRefDb,
  image: ReferenceImageGenerator | null,
  projectId: string,
  shotId: string,
  pkg: FilmPackage,
  result: ContinuityResult,
  charIdByKey: Map<string, string>,
  /** Why `image` is null (shown in the degradation). */
  unavailable = "no image provider configured",
): Promise<{ keys: string[]; gaps: Degradation[] }> {
  const keys: string[] = [];
  const gaps: Degradation[] = [];
  const gap = (wardrobeId: string, reason: string) =>
    gaps.push(degradation("WARDROBE_REFERENCE_UNAVAILABLE", "shot",
      "No wardrobe reference image for a character in this shot; their clothes come from the prompt only.",
      { refId: shotId, detail: { wardrobeId, reason } }));

  for (const ref of result.requiredReferences) {
    if (ref.kind !== "wardrobe" || !ref.characterId) continue;
    const characterId = charIdByKey.get(ref.characterId);
    if (!characterId) continue;
    const spec = wardrobeReferenceSpec(pkg, ref.characterId, ref.id);
    const where = { characterId, wardrobeKey: ref.id, digest: spec.digest };
    if (tableMissing) { gap(ref.id, "wardrobe_references not migrated (0034)"); continue; }
    let row: { storageKey: string } | null;
    try {
      row = await db.wardrobeReference.findFirst({ where, select: { storageKey: true } });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      tableMissing = true;
      gap(ref.id, "wardrobe_references not migrated (0034)");
      continue;
    }
    if (row) { keys.push(row.storageKey); continue; }
    if (!image) { gap(ref.id, unavailable); continue; }
    const key = `projects/${projectId}/wardrobe/${ref.id}-${spec.digest.slice(0, 16)}.png`;
    try {
      const stored = await image.generate(spec.prompt, key, { subject: ref.id, digest: spec.digest });
      try {
        await db.wardrobeReference.create({
          data: { projectId, characterId, wardrobeKey: ref.id, digest: spec.digest, storageKey: stored, provider: image.id },
          select: { id: true },
        });
      } catch (e) {
        // Another shot generated the same reference first: use theirs.
        if ((e as { code?: string })?.code !== "P2002") throw e;
        const other = await db.wardrobeReference.findFirst({ where, select: { storageKey: true } });
        if (other) { keys.push(other.storageKey); continue; }
      }
      keys.push(stored);
    } catch (e) {
      gap(ref.id, e instanceof Error ? e.message.slice(0, 200) : String(e));
    }
  }
  return { keys, gaps };
}
