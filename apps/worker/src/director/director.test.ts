import { describe, expect, it } from "vitest";
import { IntelligenceError, PlanInvalidError, validateFilmPackage } from "@cineforge/movie";
import { planShotCount } from "@cineforge/shared";
import { planningConstraints, toProductionFailure } from "./director.service";
import { stubPackage } from "./stub";

describe("planning constraints keep the plan inside the estimate", () => {
  it.each([10, 30, 60, 180, 600])("%is film: scene count matches the estimate, shots never exceed it", (sec) => {
    const c = planningConstraints(sec);
    expect(c.sceneCount * c.maxShotsPerScene).toBe(planShotCount(sec));
    expect(c.maxShotSec).toBe(5);
    expect(Math.abs(c.sceneSec * c.sceneCount - sec)).toBeLessThanOrEqual(c.sceneCount);
  });
});

describe("local stand-in plan (DIRECTOR_ALLOW_STUB=1 only)", () => {
  it.each([10, 30, 60, 180, 600])("is valid Film IR for a %is film", (sec) => {
    const c = planningConstraints(sec);
    const r = validateFilmPackage(stubPackage("a test film", c), c);
    expect(r.ok ? [] : r.issues).toEqual([]);
  });
});

describe("planning failures are reported in production vocabulary", () => {
  it("maps each failure", () => {
    expect(toProductionFailure(new PlanInvalidError([{ stage: "references", code: "UNKNOWN_REFERENCE", path: "scenes[0]", message: "x" }]))?.code)
      .toBe("DIRECTOR_OUTPUT_INVALID");
    expect(toProductionFailure(new IntelligenceError("REFUSED", "no"))?.code).toBe("DIRECTOR_REFUSED");
    expect(toProductionFailure(new IntelligenceError("TRUNCATED", "max"))?.code).toBe("DIRECTOR_OUTPUT_INVALID");
    expect(toProductionFailure(new IntelligenceError("PROVIDER_UNAVAILABLE", "none"))?.code).toBe("DIRECTOR_UNAVAILABLE");
    expect(toProductionFailure(new Error("db down"))).toBeNull();
  });
});
