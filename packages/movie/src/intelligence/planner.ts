/**
 * One-Pass Intelligence / Multi-Pass Execution (DirectorOS Part 2 §85, §93,
 * §99): plan the whole film in ONE master call, validate it, and — only if the
 * validator found issues — make ONE surgical revision call that fixes exactly
 * them. Then stop: a plan that still fails is reported (DIRECTOR_OUTPUT_INVALID),
 * never padded or partially executed (DOS-74).
 */
import { filmPackageJsonSchema } from "../ir/json-schema";
import type { FilmPackage } from "../ir/schema";
import { formatIssues, validateFilmPackage, type Issue, type ProductionConstraints } from "../ir/validate";
import { PROMPTS, renderPlanRequest, renderRevisionRequest } from "./prompts";
import type { IntelligenceRouter } from "./router";

export class PlanInvalidError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`the plan failed validation after one revision (${issues.length} issues)`);
    this.name = "PlanInvalidError";
  }
}

export interface PlanResult {
  pkg: FilmPackage;
  /** True when the first plan needed the surgical revision. */
  revised: boolean;
  /** Issues the revision fixed (empty when the first plan was valid). */
  fixedIssues: Issue[];
  provider: string;
  model: string;
}

/** Output budget for a plan: generous, streamed (long films produce long packages). */
export function planMaxTokens(sceneCount: number): number {
  return Math.min(128_000, 12_000 + sceneCount * 2_500);
}

/** "Planned 6 scenes with 3 characters: <logline>" — the decision log's why. */
export function summarizePlan(o: unknown): string | null {
  const p = o as { film?: { title?: string; logline?: string }; cast?: unknown[]; scenes?: unknown[] } | null;
  if (!p?.scenes) return null;
  return `Planned "${p.film?.title ?? "untitled"}" in ${p.scenes.length} scenes with ${p.cast?.length ?? 0} characters: ${p.film?.logline ?? ""}`;
}

export async function planFilm(
  router: IntelligenceRouter,
  brief: string,
  constraints: ProductionConstraints,
  ctx: { projectId?: string | null } = {},
): Promise<PlanResult> {
  const schema = filmPackageJsonSchema();
  const maxTokens = planMaxTokens(constraints.sceneCount);
  const first = await router.call(
    {
      task: "film_plan", promptId: PROMPTS.directorMaster.id, promptVersion: PROMPTS.directorMaster.version,
      system: PROMPTS.directorMaster.system, user: renderPlanRequest(brief, constraints),
      schema, schemaName: "FilmPackage", maxTokens, effort: "high",
      summarize: summarizePlan,
    },
    ctx,
  );
  const v1 = validateFilmPackage(first.output, constraints);
  if (v1.ok) return { pkg: v1.pkg, revised: false, fixedIssues: [], provider: first.provider, model: first.model };

  const second = await router.call(
    {
      task: "film_plan_revision", promptId: PROMPTS.directorRevision.id, promptVersion: PROMPTS.directorRevision.version,
      system: PROMPTS.directorRevision.system, user: renderRevisionRequest(first.output, formatIssues(v1.issues)),
      schema, schemaName: "FilmPackage", maxTokens, effort: "high",
      summarize: (o) => `Revised the plan to fix ${v1.issues.length} issue(s) (${[...new Set(v1.issues.map((i) => i.code))].slice(0, 6).join(", ")}). ${summarizePlan(o) ?? ""}`,
    },
    ctx,
  );
  const v2 = validateFilmPackage(second.output, constraints);
  if (!v2.ok) throw new PlanInvalidError(v2.issues);
  return { pkg: v2.pkg, revised: true, fixedIssues: v1.issues, provider: second.provider, model: second.model };
}
