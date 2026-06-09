/**
 * Pure budget-governor decision logic (docs/24 §C8). The video worker meters
 * GPU-ms per project and uses these to decide when to PAUSE a project that has
 * blown past its pre-flight estimate (with a safety margin), and the API uses
 * them to decide whether a paused project can afford to resume.
 */
export declare const DEFAULT_BUDGET_MARGIN = 1.25;
/** Hard ceiling = estimate × margin (estimates are approximate, so we allow slack). */
export declare function budgetCeilingMs(estimatedMs: number, margin?: number): number;
/** Pause once cumulative spend exceeds the ceiling. No estimate ⇒ never pause. */
export declare function shouldPauseForBudget(estimatedMs: number | null | undefined, spentMs: number, margin?: number): boolean;
/** Remaining headroom under the ceiling (never negative). */
export declare function remainingBudgetMs(estimatedMs: number | null | undefined, spentMs: number, margin?: number): number;
