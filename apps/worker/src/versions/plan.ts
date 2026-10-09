/**
 * Plan history and dependency edges (DirectorOS W8b; migration 0041).
 *
 *  - snapshotScenes: before a re-plan replaces a scene or a canon edit changes
 *    it, the scene as it was — plan, shots with their clip pointers, dialogue —
 *    is kept in scene_versions (append-only).
 *  - writeShotDependencies: each shot's canon dependencies (character,
 *    wardrobe, location, prop) as rows, so what an edit touches is a lookup.
 *
 * Both are records next to work that already happened: a missing table or a
 * write error is logged once and never fails the plan or the edit.
 */
import type { FilmPackage } from "@cineforge/movie";
import { shotDependencies } from "@cineforge/movie";
import { isMissingTable } from "../timeline/store";

type Row = Record<string, unknown>;

export interface PlanHistoryDb {
  scene: { findMany(a: unknown): Promise<Row[]> };
  sceneVersion: { create(a: { data: Row; select: { id: true } }): Promise<unknown> };
  shotDependency: {
    deleteMany(a: { where: Row }): Promise<unknown>;
    createMany(a: { data: Row[]; skipDuplicates?: boolean }): Promise<unknown>;
  };
}

const missing = { sceneVersions: false, dependencies: false };

function report(what: keyof typeof missing, e: unknown) {
  if (isMissingTable(e)) {
    if (!missing[what]) console.warn(JSON.stringify({ event: `plan.${what}`, note: "table not migrated (0041); not recorded until restart" }));
    missing[what] = true;
  } else {
    console.error(JSON.stringify({ event: `plan.${what}`, error: e instanceof Error ? e.message : String(e) }));
  }
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))) as Row;

/** Keep these scenes as they are now. */
export async function snapshotScenes(
  db: PlanHistoryDb,
  projectId: string,
  where: { indexes?: number[]; ids?: string[] },
  reason: "replan" | "canon_edit" | "editorial",
  canonVersion: string | null,
): Promise<number> {
  if (missing.sceneVersions) return 0;
  try {
    const scenes = await db.scene.findMany({
      where: { projectId, ...(where.indexes ? { index: { in: where.indexes } } : {}), ...(where.ids ? { id: { in: where.ids } } : {}) },
      include: { shots: { orderBy: { index: "asc" } }, dialogueLines: { orderBy: { index: "asc" } } },
    });
    for (const sc of scenes) {
      await db.sceneVersion.create({
        data: { projectId, sceneId: sc.id, sceneIndex: sc.index, reason, canonVersion, snapshot: json(sc) },
        select: { id: true },
      });
    }
    return scenes.length;
  } catch (e) {
    report("sceneVersions", e);
    return 0;
  }
}

/**
 * Write the dependency edges of the given shots (all of the package's shots
 * when `only` is omitted), replacing what they had.
 */
export async function writeShotDependencies(
  db: PlanHistoryDb,
  projectId: string,
  pkg: FilmPackage,
  shotIdAt: (sceneIndex: number, shotIndex: number) => string | undefined,
  canonVersion: string | null,
  only?: Set<string>,
): Promise<number> {
  if (missing.dependencies) return 0;
  try {
    const rows: Row[] = [];
    const ids: string[] = [];
    for (const d of shotDependencies(pkg)) {
      const shotId = shotIdAt(d.sceneIndex, d.shotIndex);
      if (!shotId || (only && !only.has(shotId))) continue;
      ids.push(shotId);
      for (const e of d.edges) rows.push({ projectId, shotId, entityType: e.type, entityKey: e.key, canonVersion });
    }
    if (!ids.length) return 0;
    await db.shotDependency.deleteMany({ where: { shotId: { in: ids } } });
    if (rows.length) await db.shotDependency.createMany({ data: rows, skipDuplicates: true });
    return rows.length;
  } catch (e) {
    report("dependencies", e);
    return 0;
  }
}

/** Test hook. */
export function _resetPlanHistoryState(): void {
  missing.sceneVersions = false;
  missing.dependencies = false;
}
