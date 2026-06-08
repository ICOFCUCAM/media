import { describe, it, expect } from "vitest";
import { shouldPauseForBudget, remainingBudgetMs, budgetCeilingMs, DEFAULT_BUDGET_MARGIN } from "./budget";

describe("budget governor (C8)", () => {
  it("ceiling = estimate × margin", () => {
    expect(budgetCeilingMs(1000)).toBe(Math.round(1000 * DEFAULT_BUDGET_MARGIN));
    expect(budgetCeilingMs(1000, 1.5)).toBe(1500);
  });

  it("does not pause until spend exceeds the ceiling", () => {
    expect(shouldPauseForBudget(1000, 1000)).toBe(false); // at estimate, under ceiling
    expect(shouldPauseForBudget(1000, 1250)).toBe(false); // exactly at ceiling
    expect(shouldPauseForBudget(1000, 1251)).toBe(true); // over ceiling
  });

  it("never pauses without an estimate", () => {
    expect(shouldPauseForBudget(null, 999999)).toBe(false);
    expect(shouldPauseForBudget(0, 999999)).toBe(false);
    expect(shouldPauseForBudget(undefined, 999999)).toBe(false);
  });

  it("remaining headroom is clamped at zero", () => {
    expect(remainingBudgetMs(1000, 0)).toBe(1250);
    expect(remainingBudgetMs(1000, 1200)).toBe(50);
    expect(remainingBudgetMs(1000, 5000)).toBe(0);
    expect(remainingBudgetMs(null, 0)).toBe(0);
  });
});
