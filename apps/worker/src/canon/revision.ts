/**
 * Canon revisions in production (DirectorOS Part 2 §62.9; W3).
 *
 *   change canon (e.g. Maya's coat)
 *     → the World State Engine revises the Film IR and re-validates it
 *     → the compiler says exactly which scenes and shots changed
 *     → those shots are invalidated: new prompt + cache key, status PENDING,
 *       old clip / generated seed frame dropped (their media_versions history
 *       stays); every other shot keeps its media
 *     → the next "resume" film job regenerates only the PENDING shots
 *       (completed shots short-circuit at zero GPU cost) and re-assembles.
 *
 * A change that would break canon (an injury vanishing mid-action, a speaker
 * who cannot know a line) is rejected and touches nothing. Every attempt is a
 * canon_revisions row (migration 0033; tolerated until applied — the JSON log
 * line is always written).
 */
import {
  compileFilm,
  FilmPackage,
  reviseCanon,
  type CanonChange,
  type CanonRevision,
  type Issue,
} from "@cineforge/movie";
import { outputDimensions } from "@cineforge/shared";
import { MODEL_VERSIONS } from "@cineforge/model-adapters";
import { isMissingTable } from "../timeline/store";
import { shotGenerationFields, statePatchRow } from "../director/rows";

type Row = Record<string, unknown>;
export interface CanonDb {
  screenplay: {
    findUnique(a: unknown): Promise<{ raw: unknown } | null>;
    update(a: unknown): Promise<unknown>;
  };
  project: { findUniqueOrThrow(a: unknown): Promise<{ modelId: string; resolution: string; aspectRatio: string; lockedAt?: Date | null }> };
  character: { findMany(a: unknown): Promise<{ id: string; name: string }[]> };
  scene: {
    findMany(a: unknown): Promise<{ id: string; index: number; lockedAt?: Date | null; shots: { id: string; index: number; seedImageKey: string | null }[] }[]>;
    update(a: unknown): Promise<unknown>;
  };
  shot: { update(a: unknown): Promise<unknown> };
  canonRevision: { create(a: { data: Row; select?: Row }): Promise<unknown> };
  $transaction<T>(fn: (tx: CanonDb) => Promise<T>): Promise<T>;
}

export class CanonUnavailableError extends Error {}

export interface AppliedRevision {
  outcome: "applied" | "rejected";
  issues: Issue[];
  affectedScenes: string[];
  /** Database ids of the shots that will regenerate. */
  invalidatedShotIds: string[];
  fromVersion: string;
  toVersion: string;
}

/** The project's Film IR (packages stored before W3 parse with empty canon), with the stored raw document. */
async function loadRaw(db: Pick<CanonDb, "screenplay">, projectId: string): Promise<{ pkg: FilmPackage; raw: Record<string, unknown> }> {
  const sp = await db.screenplay.findUnique({ where: { projectId }, select: { raw: true } });
  const raw = (sp?.raw ?? {}) as Record<string, unknown>;
  const parsed = FilmPackage.safeParse(raw.package);
  if (!parsed.success) throw new CanonUnavailableError(`project ${projectId} has no Film IR (planned before DirectorOS W2, or not planned)`);
  return { pkg: parsed.data, raw };
}

export async function loadFilmPackage(db: Pick<CanonDb, "screenplay">, projectId: string): Promise<FilmPackage> {
  return (await loadRaw(db, projectId)).pkg;
}

let tableMissing = false;

async function record(db: Pick<CanonDb, "canonRevision">, projectId: string, rev: CanonRevision, outcome: "applied" | "rejected", invalidated: number, actor: string | null) {
  const row = {
    projectId, kind: rev.change.kind, change: rev.change, fromVersion: rev.fromVersion, toVersion: rev.toVersion, outcome,
    issues: rev.issues, affectedScenes: outcome === "applied" ? rev.affectedScenes : [],
    affectedShots: outcome === "applied" ? rev.affectedShots : [], invalidated, actor,
  };
  console.log(JSON.stringify({ event: "canon.revision", ...row, issues: rev.issues.length }));
  if (tableMissing) return;
  try {
    await db.canonRevision.create({ data: row, select: { id: true } });
  } catch (e) {
    if (isMissingTable(e)) {
      tableMissing = true;
      console.warn('{"event":"canon.revision","note":"canon_revisions not migrated (0033); logging only until restart"}');
    } else {
      // The change itself is already applied (or rejected); the log line above stands.
      console.error(JSON.stringify({ event: "canon.revision", error: e instanceof Error ? e.message : String(e) }));
    }
  }
}

/** Test hook. */
export function _resetCanonState(): void {
  tableMissing = false;
}

/** Preview a change: what it would touch, and whether canon allows it. Writes nothing. */
export async function previewCanonRevision(db: Pick<CanonDb, "screenplay">, projectId: string, change: CanonChange): Promise<CanonRevision> {
  return reviseCanon(await loadFilmPackage(db, projectId), change);
}

export async function applyCanonRevision(
  db: CanonDb,
  projectId: string,
  change: CanonChange,
  opts: { actor?: string } = {},
): Promise<AppliedRevision> {
  const { pkg, raw: stored } = await loadRaw(db, projectId);
  const rev = reviseCanon(pkg, change);
  const actor = opts.actor ?? null;
  const base = { issues: rev.issues, fromVersion: rev.fromVersion, toVersion: rev.toVersion };
  if (rev.issues.length) {
    await record(db, projectId, rev, "rejected", 0, actor);
    return { outcome: "rejected", affectedScenes: [], invalidatedShotIds: [], ...base };
  }

  const project0 = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { modelId: true, resolution: true, aspectRatio: true, lockedAt: true } });
  const compiled = compileFilm(rev.pkg, { modelId: project0.modelId });
  const project = project0;
  const [width, height] = outputDimensions(project.resolution, project.aspectRatio);
  const keying = { projectId, modelId: project.modelId, modelVersion: MODEL_VERSIONS[project.modelId] ?? "unknown", width, height };
  const byName = new Map((await db.character.findMany({ where: { projectId }, select: { id: true, name: true } })).map((c) => [c.name, c.id]));
  const charId = new Map(compiled.characters.filter((c) => byName.has(c.name)).map((c) => [c.key, byName.get(c.name)!]));
  const rows = await db.scene.findMany({
    where: { projectId },
    select: { id: true, index: true, lockedAt: true, shots: { select: { id: true, index: true, seedImageKey: true } } },
  });
  const sceneRow = new Map(rows.map((r) => [r.index, r]));
  // Locks (W8, 0037): a change that would touch a locked scene or a locked film is refused, not half-applied.
  const lockIssues: Issue[] = project0.lockedAt
    ? [{ stage: "production", code: "FILM_LOCKED", path: "project", message: "the film is locked: unlock it to change its canon" }]
    : compiled.scenes
        .filter((sc) => rev.affectedScenes.includes(sc.key) && sceneRow.get(sc.index)?.lockedAt)
        .map((sc) => ({ stage: "production" as const, code: "SCENE_LOCKED", path: sc.key, message: `${sc.key} is locked: unlock it to change it` }));
  if (lockIssues.length) {
    const blocked = { ...rev, issues: [...rev.issues, ...lockIssues] };
    await record(db, projectId, blocked, "rejected", 0, actor);
    return { outcome: "rejected", affectedScenes: [], invalidatedShotIds: [], ...base, issues: blocked.issues };
  }
  const affectedShots = new Set(rev.affectedShots.map((s) => `${s.sceneIndex}#${s.shotIndex}`));
  const invalidated: string[] = [];

  await db.$transaction(async (tx) => {
    for (const sc of compiled.scenes.filter((s) => rev.affectedScenes.includes(s.key))) {
      const row = sceneRow.get(sc.index);
      if (!row) throw new CanonUnavailableError(`scene ${sc.key} (index ${sc.index}) has no row`);
      await tx.scene.update({ where: { id: row.id }, data: { statePatch: statePatchRow(sc, charId) }, select: { id: true } });
      for (const sh of sc.shots.filter((s) => affectedShots.has(`${sc.index}#${s.index}`))) {
        const shotRow = row.shots.find((s) => s.index === sh.index);
        if (!shotRow) throw new CanonUnavailableError(`shot ${sc.key}#${sh.index} has no row`);
        // A seed frame generated from the old prompt is stale; one a creator uploaded is theirs and stays.
        const generatedSeed = Boolean(shotRow.seedImageKey?.startsWith(`projects/${projectId}/seeds/${shotRow.id}`));
        await tx.shot.update({
          where: { id: shotRow.id },
          data: {
            ...shotGenerationFields(keying, sc.index, sh, charId),
            cameraPlan: sh.cameraPlan,
            status: "PENDING", videoKey: null, thumbnailKey: null, qcScore: null, attempts: 0,
            ...(generatedSeed ? { seedImageKey: null } : {}),
          },
          select: { id: true },
        });
        invalidated.push(shotRow.id);
      }
    }
    const raw = { ...stored, irVersion: rev.pkg.irVersion, canonVersion: rev.toVersion, package: rev.pkg, revisedFrom: rev.fromVersion };
    await tx.screenplay.update({ where: { projectId }, data: { raw }, select: { id: true } });
  });
  await record(db, projectId, rev, "applied", invalidated.length, actor);
  return { outcome: "applied", affectedScenes: rev.affectedScenes, invalidatedShotIds: invalidated, ...base };
}
