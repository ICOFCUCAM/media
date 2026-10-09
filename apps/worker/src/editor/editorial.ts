/**
 * The Editor Agent in the worker (DirectorOS W13; Part 1 §21, §46).
 *
 *   review  pending → reviewing → ready: the Editor reviews the cut (or answers
 *           one request) and its dry-run proposals are stored for the owner.
 *   apply   apply_requested → applying → applied | failed: the approved
 *           proposals are applied TOGETHER to the Film IR (applyEdits), checked
 *           again, and reach the rows exactly as their effects say —
 *             recut       the same clip, a new length (shots.cut_sec) or place
 *             regenerate  a lengthened shot, or a new insert, is generated
 *             remove      the shot row is deleted (its clips stay as versions)
 *             revoice     the scene's lines are rewritten and re-voiced
 *           then the film is resumed: only those shots generate, and the
 *           master renders again as a new version.
 * Locked films and scenes are refused, never half-edited.
 */
import {
  applyEdits,
  canonVersion,
  compileFilm,
  EditOperation,
  EditRejected,
  FilmPackage as FilmPackageSchema,
  reviewFilm,
  type EditResult,
  type FilmPackage,
  type IntelligenceRouter,
} from "@cineforge/movie";
import { MODEL_VERSIONS } from "@cineforge/model-adapters";
import { outputDimensions } from "@cineforge/shared";
import { constraintsFor, productionOf, renderStyleFor, type ProductionRow } from "../director/production";
import { shotGenerationFields } from "../director/rows";
import { snapshotScenes, writeShotDependencies, type PlanHistoryDb } from "../versions/plan";

/* ── The plan: what the applied edits do to the rows (pure) ───────────── */

export interface SceneRowRef {
  id: string;
  index: number;
  key: string;
  lockedAt: Date | null;
  shots: { id: string; index: number; source: string }[];
}

export interface ApplyPlan {
  /** Shot rows to delete (cut). */
  remove: string[];
  /** Final scene order: row id → new index (only scenes that moved). */
  sceneIndex: { sceneId: string; to: number }[];
  /** Existing shots: new index, and a new cut length or a regeneration. */
  shots: { shotId: string; sceneId: string; to: number; durationSec: number; mode: "place" | "recut" | "regenerate" }[];
  /** New shots to create and generate. */
  create: { sceneId: string; sceneKey: string; to: number; durationSec: number; source: string }[];
  /** Scenes whose lines are rewritten and re-voiced. */
  revoice: string[];
  /** Scenes the edit touches (for locks and snapshots). */
  touched: string[];
}

export class EditApplyError extends Error {}

export function planApply(result: EditResult, rows: SceneRowRef[]): ApplyPlan {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const plan: ApplyPlan = { remove: [], sceneIndex: [], shots: [], create: [], revoice: [], touched: [] };
  const touched = new Set<string>();
  for (const e of result.shots) {
    const row = byKey.get(e.sceneId);
    if (!row) throw new EditApplyError(`${e.sceneId} has no scene row`);
    if (e.action === "keep") continue;
    touched.add(row.id);
    if (e.from === null) {
      // A neighbour's source: an image-led scene starts its insert from a still too.
      plan.create.push({ sceneId: row.id, sceneKey: e.sceneId, to: e.to!, durationSec: e.durationSec!, source: row.shots[0]?.source ?? "text" });
      continue;
    }
    const shot = row.shots.find((s) => s.index === e.from);
    if (!shot) throw new EditApplyError(`${e.sceneId} shot ${e.from} has no row`);
    if (e.action === "remove") plan.remove.push(shot.id);
    else {
      plan.shots.push({
        shotId: shot.id, sceneId: row.id, to: e.to!, durationSec: e.durationSec!,
        mode: e.action === "regenerate" ? "regenerate" : "recut",
      });
    }
  }
  if (result.reordered) {
    for (const sc of result.pkg.scenes) {
      const row = byKey.get(sc.id)!;
      if (row.index !== sc.index) {
        plan.sceneIndex.push({ sceneId: row.id, to: sc.index });
        touched.add(row.id);
      }
    }
  }
  for (const key of result.revoice) {
    const row = byKey.get(key);
    if (!row) throw new EditApplyError(`${key} has no scene row`);
    plan.revoice.push(row.id);
    touched.add(row.id);
  }
  plan.touched = [...touched];
  return plan;
}

/* ── Review ───────────────────────────────────────────────────────────── */

export interface ReviewRow {
  id: string;
  projectId: string;
  instruction: string | null;
}

export interface ReviewDeps {
  claim(id: string): Promise<boolean>;
  loadPackage(projectId: string): Promise<{ pkg: FilmPackage; maxShotSec: number } | null>;
  available(): boolean;
  review(pkg: FilmPackage, instruction: string | null, projectId: string, maxShotSec: number): ReturnType<typeof reviewFilm>;
  save(id: string, out: {
    status: "ready" | "failed"; canonVersion?: string; summary?: string; findings?: unknown[]; dropped?: unknown[]; error?: string;
    proposals?: { position: number; op: EditOperation; description: string; effect: unknown }[];
  }): Promise<void>;
}

export async function processEditorialReview(row: ReviewRow, deps: ReviewDeps): Promise<"ready" | "failed" | "skipped"> {
  if (!(await deps.claim(row.id))) return "skipped";
  const loaded = await deps.loadPackage(row.projectId);
  if (!loaded) {
    await deps.save(row.id, { status: "failed", error: "There is no planned film to edit yet." });
    return "failed";
  }
  if (!deps.available()) {
    await deps.save(row.id, { status: "failed", error: "No editing model is configured (the editorial task has no available provider)." });
    return "failed";
  }
  try {
    const r = await deps.review(loaded.pkg, row.instruction, row.projectId, loaded.maxShotSec);
    await deps.save(row.id, {
      status: "ready", canonVersion: canonVersion(loaded.pkg), summary: r.summary, findings: r.findings, dropped: r.dropped,
      proposals: r.proposals.map((p, i) => ({ position: i, op: p.op, description: p.description, effect: p.effect })),
    });
    return "ready";
  } catch (e) {
    await deps.save(row.id, { status: "failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 1000) });
    return "failed";
  }
}

/* ── Apply (Prisma) ───────────────────────────────────────────────────── */

type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- the Prisma client and its transaction

export interface AppliedEdit {
  outcome: "applied" | "failed";
  error?: string;
  toVersion?: string;
  regenerate: number;
  recut: number;
  removed: number;
  revoiced: number;
}

/** Apply a review's approved proposals; the caller resumes the film when it is applied. */
export async function applyEditorialReview(db: Db, reviewId: string): Promise<AppliedEdit> {
  const none = { regenerate: 0, recut: 0, removed: 0, revoiced: 0 };
  const review = await db.editorialReview.findUnique({
    where: { id: reviewId },
    select: { projectId: true, canonVersion: true, proposals: { where: { status: "approved" }, orderBy: { position: "asc" }, select: { id: true, op: true } } },
  });
  if (!review) return { outcome: "failed", error: "review not found", ...none };
  const fail = async (error: string): Promise<AppliedEdit> => {
    await db.editProposal.updateMany({ where: { reviewId, status: "approved" }, data: { status: "failed" } });
    await db.editorialReview.update({ where: { id: reviewId }, data: { status: "failed", error: error.slice(0, 1000) } });
    return { outcome: "failed", error, ...none };
  };
  const projectId: string = review.projectId;
  const sp = await db.screenplay.findUnique({ where: { projectId }, select: { raw: true } });
  const stored = (sp?.raw ?? {}) as Record<string, unknown>;
  const parsed = FilmPackageSchema.safeParse(stored.package);
  if (!parsed.success) return fail("The film has no readable plan to edit.");
  const pkg = parsed.data;
  // The cut changed since the review (a canon edit, a re-plan): its numbers may no longer mean the same shots.
  if (review.canonVersion && canonVersion(pkg) !== review.canonVersion) {
    return fail("The film changed after this review; ask the Editor again.");
  }
  const ops = review.proposals.map((p: { op: unknown }) => EditOperation.parse(p.op));
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      modelId: true, resolution: true, aspectRatio: true, lockedAt: true, targetSeconds: true,
      kind: true, medium: true, animationStyle: true, episodes: true, seriesId: true, episodeNumber: true,
    },
  });
  if (project.lockedAt) return fail("The film is locked: unlock it to edit it.");
  const spec = productionOf(project as ProductionRow);
  let result: EditResult;
  try {
    result = applyEdits(pkg, ops, { maxShotSec: constraintsFor(project.targetSeconds, spec).maxShotSec });
  } catch (e) {
    if (e instanceof EditRejected) return fail(`The approved edits together are not possible: ${e.issues.map((i) => i.message).slice(0, 4).join("; ")}`);
    throw e;
  }

  const rows: SceneRowRef[] = (await db.scene.findMany({
    where: { projectId },
    orderBy: { index: "asc" },
    select: { id: true, index: true, lockedAt: true, shots: { orderBy: { index: "asc" }, select: { id: true, index: true, source: true } } },
  })).map((r: Omit<SceneRowRef, "key">) => ({ ...r, key: pkg.scenes[r.index]?.id ?? `#${r.index}` }));
  const plan = planApply(result, rows);
  const locked = rows.filter((r) => r.lockedAt && plan.touched.includes(r.id));
  if (locked.length) return fail(`${locked.map((r) => r.key).join(", ")} ${locked.length === 1 ? "is" : "are"} locked: unlock to edit.`);

  const compiled = compileFilm(result.pkg, { modelId: project.modelId, render: renderStyleFor(spec) });
  const [width, height] = outputDimensions(project.resolution, project.aspectRatio);
  const keying = { projectId, modelId: project.modelId, modelVersion: MODEL_VERSIONS[project.modelId] ?? "unknown", width, height };
  const byName = new Map<string, string>((await db.character.findMany({ where: { projectId }, select: { id: true, name: true } })).map((c: { id: string; name: string }) => [c.name, c.id]));
  const charId = new Map(compiled.characters.filter((c) => byName.has(c.name)).map((c) => [c.key, byName.get(c.name)!]));
  const compiledScene = new Map(compiled.scenes.map((s) => [s.key, s]));
  const sceneKey = new Map(rows.map((r) => [r.id, r.key]));
  const fromVersion = canonVersion(pkg);
  const toVersion = canonVersion(result.pkg);
  const history = db as PlanHistoryDb;
  await snapshotScenes(history, projectId, { ids: plan.touched }, "editorial", fromVersion);

  const changed: string[] = [];
  await db.$transaction(async (tx: Db) => {
    if (plan.remove.length) await tx.shot.deleteMany({ where: { id: { in: plan.remove } } });
    // Unique (project, index) and (scene, index): park moved rows on negative indexes first.
    for (const s of plan.sceneIndex) await tx.scene.update({ where: { id: s.sceneId }, data: { index: -1000 - s.to }, select: { id: true } });
    for (const s of plan.sceneIndex) await tx.scene.update({ where: { id: s.sceneId }, data: { index: s.to }, select: { id: true } });
    for (const s of plan.shots) await tx.shot.update({ where: { id: s.shotId }, data: { index: -1000 - s.to }, select: { id: true } });
    for (const s of plan.shots) {
      const key = sceneKey.get(s.sceneId)!;
      const sc = compiledScene.get(key)!;
      const sh = sc.shots.find((x) => x.index === s.to)!;
      const data = s.mode === "regenerate"
        ? { index: s.to, ...shotGenerationFields(keying, sc.index, sh, charId), cameraPlan: sh.cameraPlan, durationSec: s.durationSec, cutSec: null,
            status: "PENDING", videoKey: null, thumbnailKey: null, qcScore: null, attempts: 0 }
        : { index: s.to, durationSec: s.durationSec, cutSec: s.durationSec };
      await tx.shot.update({ where: { id: s.shotId }, data, select: { id: true } });
      changed.push(s.shotId);
    }
    for (const c of plan.create) {
      const sc = compiledScene.get(c.sceneKey)!;
      const sh = sc.shots.find((x) => x.index === c.to)!;
      const row = await tx.shot.create({
        data: {
          sceneId: c.sceneId, index: c.to, ...shotGenerationFields(keying, sc.index, sh, charId), source: c.source,
          durationSec: c.durationSec, cameraPlan: sh.cameraPlan, cameraType: sh.cameraType, cameraMovement: sh.cameraMovement,
          modelId: project.modelId, modelVersion: MODEL_VERSIONS[project.modelId] ?? null,
        },
        select: { id: true },
      });
      changed.push(row.id);
    }
    for (const sceneId of plan.revoice) {
      const sc = compiledScene.get(sceneKey.get(sceneId)!)!;
      await tx.dialogueLine.deleteMany({ where: { sceneId } });
      if (sc.dialogue.length) {
        await tx.dialogueLine.createMany({
          data: sc.dialogue.map((d) => ({ sceneId, index: d.index, characterId: charId.get(d.characterKey)!, text: d.text, emotion: d.emotion })),
        });
      }
      // The spoken track no longer matches its lines: the resume voices the scene again.
      await tx.audioTrack.deleteMany({ where: { sceneId, kind: "VOICE" } });
      await tx.scene.update({ where: { id: sceneId }, data: { dialogue: sc.dialogueText }, select: { id: true } });
    }
    const raw = { ...stored, irVersion: result.pkg.irVersion, canonVersion: toVersion, package: result.pkg, editedFrom: fromVersion, editedBy: reviewId };
    await tx.screenplay.update({ where: { projectId }, data: { raw }, select: { id: true } });
    await tx.editProposal.updateMany({ where: { reviewId, status: "approved" }, data: { status: "applied" } });
    await tx.editorialReview.update({ where: { id: reviewId }, data: { status: "applied", appliedVersion: toVersion, appliedAt: new Date() } });
  });

  const after: { id: string; index: number; shots: { id: string; index: number }[] }[] = await db.scene.findMany({
    where: { projectId }, select: { id: true, index: true, shots: { select: { id: true, index: true } } },
  });
  const byIndex = new Map(after.map((r) => [r.index, new Map(r.shots.map((sh) => [sh.index, sh.id]))]));
  await writeShotDependencies(history, projectId, result.pkg, (si, hi) => byIndex.get(si)?.get(hi), toVersion, new Set(changed));
  const count = (m: string) => plan.shots.filter((s) => s.mode === m).length;
  return {
    outcome: "applied", toVersion,
    regenerate: count("regenerate") + plan.create.length, recut: count("recut"), removed: plan.remove.length, revoiced: plan.revoice.length,
  };
}

/** The router call a review makes (separated so tests can stand in for it). */
export function editorialReview(router: IntelligenceRouter) {
  return (pkg: FilmPackage, instruction: string | null, projectId: string, maxShotSec: number) =>
    reviewFilm(router, pkg, { instruction, projectId, maxShotSec });
}
