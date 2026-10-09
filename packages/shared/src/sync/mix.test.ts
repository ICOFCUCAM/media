import { describe, expect, it } from "vitest";
import { MIX_SPECS, dbToGain, mixSpec } from "./mix";
import { PRODUCTION_PROFILES, syncPolicy } from "./policy";

describe("mix specs (Part 1 §18, §20)", () => {
  it("every production profile has one; dialogue is the anchor, so beds sit below it and sfx is never ducked", () => {
    for (const p of PRODUCTION_PROFILES) {
      const m = mixSpec(syncPolicy(p));
      expect(m).toBe(MIX_SPECS[p]);
      expect(m.musicDb).toBeLessThan(0);
      expect(m.ambienceDb).toBeLessThan(m.musicDb);
      expect(m.musicDuck.ratio).toBeGreaterThan(m.ambienceDuck.ratio);
    }
    expect(mixSpec({ id: "custom" })).toBe(MIX_SPECS.cinematic);
    expect(mixSpec(syncPolicy("broadcast")).musicDb).toBeLessThan(mixSpec(syncPolicy("cinematic")).musicDb);
  });

  it("dB converts to linear gain", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
  });
});
