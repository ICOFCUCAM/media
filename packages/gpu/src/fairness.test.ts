import { describe, it, expect } from "vitest";
import { tierPriority, TIER_WEIGHT, DeficitFairScheduler } from "./fairness";

describe("tier priority (C5)", () => {
  it("higher tiers dispatch first (lower number)", () => {
    expect(tierPriority("ENTERPRISE")).toBeLessThan(tierPriority("STUDIO"));
    expect(tierPriority("STUDIO")).toBeLessThan(tierPriority("CREATOR"));
    expect(tierPriority("CREATOR")).toBeLessThan(tierPriority("FREE"));
  });
});

describe("DeficitFairScheduler (C5)", () => {
  it("returns null when nothing is pending", () => {
    const s = new DeficitFairScheduler();
    expect(s.pick([])).toBeNull();
    expect(s.pick([{ id: "a", weight: 1, pending: 0 }])).toBeNull();
  });

  it("only picks tenants with pending work", () => {
    const s = new DeficitFairScheduler();
    const picks = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const p = s.pick([
        { id: "a", weight: 1, pending: 0 },
        { id: "b", weight: 1, pending: 5 },
      ]);
      if (p) picks.add(p);
    }
    expect([...picks]).toEqual(["b"]);
  });

  it("weights share fairly without starving the low tier", () => {
    const s = new DeficitFairScheduler();
    const queues = [
      { id: "ent", weight: TIER_WEIGHT.ENTERPRISE, pending: 1000 },
      { id: "free", weight: TIER_WEIGHT.FREE, pending: 1000 },
    ];
    const counts: Record<string, number> = { ent: 0, free: 0 };
    for (let i = 0; i < 260; i++) counts[s.pick(queues)!]++;

    expect(counts.ent).toBeGreaterThan(counts.free * 3); // enterprise gets the lion's share
    expect(counts.free).toBeGreaterThan(0); // but free is never starved
  });
});
