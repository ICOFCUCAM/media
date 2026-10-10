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
import { PROMPTS, renderPlanRequest, renderRevisionRequest, type PlanProduction } from "./prompts";
import type { IntelligenceRouter } from "./router";
import { applyCast } from "./cast";
import { clampStrings } from "./schema-compat";

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

/**
 * What CineForge settles itself before validating a plan: over-long text is
 * trimmed, and a one-scene production keeps no setups (a payoff needs a later
 * scene, so any setup would fail PAYOFF_BEFORE_SETUP; nothing references setups).
 */
/**
 * Camera words a model uses for the angle that mean one of ours (pure). A
 * "drone" or "aerial" angle looks down from above; a "worm's-eye" angle is low.
 * Anything not listed is left for the validator.
 */
const ANGLE_ALIASES: Record<string, string> = {
  drone: "overhead", aerial: "overhead", birds_eye: "overhead", "bird's_eye": "overhead", top_down: "overhead", top: "overhead",
  worms_eye: "low", "worm's_eye": "low", low_angle: "low", high_angle: "high", eye_level: "eye", eyelevel: "eye", dutch_angle: "dutch", canted: "dutch",
};
const SIZE_ALIASES: Record<string, string> = {
  ELS: "EWS", XWS: "EWS", EXTREME_WIDE: "EWS", LS: "WS", WIDE: "WS", FS: "WS", MEDIUM: "MS", MWS: "MS", MCS: "MCU", CLOSE: "CU", CLOSEUP: "CU", XCU: "ECU", ECS: "ECU",
};
const key = (v: string) => v.trim().toLowerCase().replace(/[\s-]+/g, "_");

function normalizeShots(out: Record<string, unknown>): void {
  for (const sc of Array.isArray(out.scenes) ? (out.scenes as Record<string, unknown>[]) : []) {
    for (const sh of Array.isArray(sc?.shots) ? (sc.shots as Record<string, unknown>[]) : []) {
      if (!sh || typeof sh !== "object") continue;
      if (typeof sh.angle === "string") {
        const a = ANGLE_ALIASES[key(sh.angle)];
        if (a) {
          // A "drone" angle names a movement too: keep it as the move when the shot gave none.
          if (key(sh.angle) === "drone" && (sh.movement == null || sh.movement === "static")) sh.movement = "drone";
          sh.angle = a;
        } else sh.angle = key(sh.angle);
      }
      if (typeof sh.size === "string") sh.size = SIZE_ALIASES[key(sh.size).toUpperCase()] ?? sh.size.trim().toUpperCase();
    }
  }
}

export function normalizePlan(output: unknown, schema: Record<string, unknown>, constraints: ProductionConstraints): unknown {
  const out = clampStrings(output, schema);
  if (out && typeof out === "object") normalizeShots(out as Record<string, unknown>);
  if (constraints.sceneCount === 1 && out && typeof out === "object" && Array.isArray((out as { setups?: unknown }).setups)) {
    return { ...(out as Record<string, unknown>), setups: [] };
  }
  return out;
}

export async function planFilm(
  router: IntelligenceRouter,
  brief: string,
  constraints: ProductionConstraints,
  ctx: { projectId?: string | null; production?: PlanProduction } = {},
): Promise<PlanResult> {
  const schema = filmPackageJsonSchema();
  const maxTokens = planMaxTokens(constraints.sceneCount);
  const first = await router.call(
    {
      task: "film_plan", promptId: PROMPTS.directorMaster.id, promptVersion: PROMPTS.directorMaster.version,
      system: PROMPTS.directorMaster.system, user: renderPlanRequest(brief, constraints, ctx.production),
      schema, schemaName: "FilmPackage", maxTokens, effort: "high",
      summarize: summarizePlan,
    },
    ctx,
  );
  // Text a little over its length limit is trimmed, not failed (unconstrained output can overrun).
  const draft = normalizePlan(first.output, schema, constraints);
  const v1 = validateFilmPackage(draft, constraints);
  // A cast character's identity is CineForge's, not the model's (W12): restored after validation.
  const cast = ctx.production?.cast ?? [];
  if (v1.ok) return { pkg: applyCast(v1.pkg, cast), revised: false, fixedIssues: [], provider: first.provider, model: first.model };

  const second = await router.call(
    {
      task: "film_plan_revision", promptId: PROMPTS.directorRevision.id, promptVersion: PROMPTS.directorRevision.version,
      system: PROMPTS.directorRevision.system, user: renderRevisionRequest(draft, formatIssues(v1.issues)),
      schema, schemaName: "FilmPackage", maxTokens, effort: "high",
      summarize: (o) => `Revised the plan to fix ${v1.issues.length} issue(s): ${v1.issues.slice(0, 4).map((i) => `${i.code} ${i.path}: ${i.message}`).join("; ")}. ${summarizePlan(o) ?? ""}`,
    },
    ctx,
  );
  const v2 = validateFilmPackage(normalizePlan(second.output, schema, constraints), constraints);
  if (!v2.ok) throw new PlanInvalidError(v2.issues);
  return { pkg: applyCast(v2.pkg, cast), revised: true, fixedIssues: v1.issues, provider: second.provider, model: second.model };
}
