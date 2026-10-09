import { describe, expect, it } from "vitest";
import { IntelligenceError, PlanInvalidError, validateFilmPackage } from "@cineforge/movie";
import { planShotCount } from "@cineforge/shared";
import { planDegradations, planningConstraints, toProductionFailure } from "./director.service";
import { mayaCoatFixture } from "@cineforge/movie";
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

describe("plan degradations (W4): grammar advisories and model limits are recorded, not failing", () => {
  it("records cinema advisories and what a model could not take", () => {
    const pkg = mayaCoatFixture();
    pkg.scenes[0]!.shots[0]!.size = "MS"; // new place, no establishing shot
    pkg.scenes[0]!.shots[1]!.movement = "dolly";
    const wan = planDegradations(pkg, "wan-2.1");
    expect(wan.map((d) => d.code)).toEqual(["CINEMA_ADVISORY"]);
    expect(wan[0]).toMatchObject({ severity: "info", refId: "scene_10#0", detail: { code: "NO_ESTABLISHING_SHOT" } });
    const ext = planDegradations(pkg, "fal-kling");
    expect(ext.filter((d) => d.code === "PROMPT_LIMITED")).toHaveLength(12); // no negative prompt on that model
  });
});
