import { PlanInvalidError, validateFilmPackage, type PlanResult, type ProductionConstraints } from "@cineforge/movie";

/**
 * A plan written outside the AI Director (docs/76; migration 0064).
 *
 * `projects.supplied_plan` holds a complete Film IR package — written by an
 * operator, a script or an API client. It goes through exactly the validator
 * chain a Director plan does (schema, references, story, canon, production,
 * budget). There is no revision call and nothing is invented: an invalid
 * package fails the film with its issues, like a Director plan that is still
 * invalid after its revision.
 */
export function suppliedPlan(raw: unknown, by: string | null, constraints: ProductionConstraints): PlanResult {
  const v = validateFilmPackage(raw, constraints);
  if (!v.ok) throw new PlanInvalidError(v.issues);
  return { pkg: v.pkg, revised: false, fixedIssues: [], provider: "supplied", model: by?.trim() || "supplied" };
}
