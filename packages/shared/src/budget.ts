/**
 * Pure budget-governor decision logic (docs/24 §C8). The video worker meters
 * GPU-ms per project and uses these to decide when to PAUSE a project that has
 * blown past its pre-flight estimate (with a safety margin), and the API uses
 * them to decide whether a paused project can afford to resume.
 */

export const DEFAULT_BUDGET_MARGIN = 1.25;

/** Hard ceiling = estimate × margin (estimates are approximate, so we allow slack). */
export function budgetCeilingMs(estimatedMs: number, margin = DEFAULT_BUDGET_MARGIN): number {
  return Math.round(estimatedMs * margin);
}

/** Pause once cumulative spend exceeds the ceiling. No estimate ⇒ never pause. */
export function shouldPauseForBudget(
  estimatedMs: number | null | undefined,
  spentMs: number,
  margin = DEFAULT_BUDGET_MARGIN,
): boolean {
  if (!estimatedMs || estimatedMs <= 0) return false;
  return spentMs > budgetCeilingMs(estimatedMs, margin);
}

/** Remaining headroom under the ceiling (never negative). */
export function remainingBudgetMs(
  estimatedMs: number | null | undefined,
  spentMs: number,
  margin = DEFAULT_BUDGET_MARGIN,
): number {
  if (!estimatedMs || estimatedMs <= 0) return 0;
  return Math.max(0, budgetCeilingMs(estimatedMs, margin) - spentMs);
}
