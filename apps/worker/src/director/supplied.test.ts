import { describe, expect, it } from "vitest";
import { fixturePackage, FIXTURE_CONSTRAINTS, PlanInvalidError } from "@cineforge/movie";
import { suppliedPlan } from "./supplied";

describe("a plan supplied instead of the Director (docs/76)", () => {
  it("a valid package is used as written, recorded with its author", () => {
    const plan = suppliedPlan(fixturePackage(), "operator: Claude", FIXTURE_CONSTRAINTS);
    expect(plan).toMatchObject({ provider: "supplied", model: "operator: Claude", revised: false, fixedIssues: [] });
    expect(plan.pkg).toEqual(fixturePackage());
    expect(suppliedPlan(fixturePackage(), null, FIXTURE_CONSTRAINTS).model).toBe("supplied");
  });

  it("an invalid package fails with its issues; nothing is repaired or invented", () => {
    expect(() => suppliedPlan({ scenes: [] }, "x", FIXTURE_CONSTRAINTS)).toThrow(PlanInvalidError);
    const tooLong = fixturePackage();
    tooLong.scenes = [...tooLong.scenes, ...tooLong.scenes, ...tooLong.scenes];
    try {
      suppliedPlan(tooLong, "x", FIXTURE_CONSTRAINTS);
      throw new Error("expected a failure");
    } catch (e) {
      expect(e).toBeInstanceOf(PlanInvalidError);
      expect((e as PlanInvalidError).issues.length).toBeGreaterThan(0);
    }
  });
});
