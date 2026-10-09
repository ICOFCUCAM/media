/**
 * Location and prop reference stills at render time (DirectorOS Part 1 §34–35;
 * W17). For every place and prop the Continuity Engine names for a shot, a
 * still of it as canon describes it, keyed by a digest of that canon
 * (packages/movie world/places.ts): found → reused; missing → generated once
 * and recorded (migration 0052); a canon change → new digest → new still.
 * When no still can be had the shot runs without it and the gap is recorded.
 */
import { degradation, type Degradation } from "@cineforge/shared";
import { locationReferenceSpec, propReferenceSpec, type ContinuityResult, type FilmPackage, type WorldReferenceSpec } from "@cineforge/movie";
import { isMissingTable } from "../timeline/store";
import type { ReferenceImageGenerator } from "./wardrobe-refs";

export interface WorldRefDb {
  worldReference: {
    findFirst(a: unknown): Promise<{ storageKey: string } | null>;
    create(a: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<unknown>;
  };
}

let tableMissing = false;
/** Test hook. */
export function _resetWorldRefState(): void {
  tableMissing = false;
}

export async function worldReferenceKeys(
  db: WorldRefDb,
  image: ReferenceImageGenerator | null,
  projectId: string,
  shotId: string,
  pkg: FilmPackage,
  result: ContinuityResult,
  unavailable = "no image provider configured",
): Promise<{ location: string[]; props: string[]; gaps: Degradation[] }> {
  const out = { location: [] as string[], props: [] as string[], gaps: [] as Degradation[] };
  const gap = (kind: string, id: string, reason: string) =>
    out.gaps.push(degradation("WORLD_REFERENCE_UNAVAILABLE", "shot",
      `No reference still for the ${kind} in this shot; it comes from the prompt only.`,
      { refId: shotId, detail: { kind, id, reason } }));

  for (const ref of result.requiredReferences) {
    if (ref.kind !== "location" && ref.kind !== "prop") continue;
    let spec: WorldReferenceSpec;
    try {
      spec = ref.kind === "location" ? locationReferenceSpec(pkg, ref.id) : propReferenceSpec(pkg, ref.id);
    } catch {
      continue; // not in the plan (an older plan): nothing to draw
    }
    const bucket = ref.kind === "location" ? out.location : out.props;
    if (tableMissing) { gap(ref.kind, ref.id, "world_references not migrated (0052)"); continue; }
    const where = { projectId, kind: spec.kind, refKey: spec.id, digest: spec.digest };
    let row: { storageKey: string } | null;
    try {
      row = await db.worldReference.findFirst({ where, select: { storageKey: true } });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
      tableMissing = true;
      gap(ref.kind, ref.id, "world_references not migrated (0052)");
      continue;
    }
    if (row) { bucket.push(row.storageKey); continue; }
    if (!image) { gap(ref.kind, ref.id, unavailable); continue; }
    const key = `projects/${projectId}/world/${spec.id}-${spec.digest.slice(0, 16)}.png`;
    try {
      const stored = await image.generate(spec.prompt, key, { subject: spec.id, digest: spec.digest });
      try {
        await db.worldReference.create({ data: { ...where, storageKey: stored, provider: image.id }, select: { id: true } });
      } catch (e) {
        // Another shot drew the same reference first: use theirs.
        if ((e as { code?: string })?.code !== "P2002") throw e;
        const other = await db.worldReference.findFirst({ where, select: { storageKey: true } });
        if (other) { bucket.push(other.storageKey); continue; }
      }
      bucket.push(stored);
    } catch (e) {
      gap(ref.kind, ref.id, e instanceof Error ? e.message.slice(0, 200) : String(e));
    }
  }
  return out;
}
