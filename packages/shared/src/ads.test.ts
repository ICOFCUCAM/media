import { describe, it, expect } from "vitest";
import { AD_PRESETS, adPreset } from "./ads";

describe("ad presets", () => {
  it("looks presets up by id and exposes valid aspect/duration", () => {
    const tt = adPreset("tiktok-reels");
    expect(tt?.aspect).toBe("9:16");
    expect(tt?.durationSec).toBe(30);
    expect(adPreset("nope")).toBeUndefined();
  });

  it("every preset has a sane shape", () => {
    for (const p of AD_PRESETS) {
      expect(["16:9", "9:16", "1:1"]).toContain(p.aspect);
      expect(p.durationSec).toBeGreaterThan(0);
      expect(typeof p.cta).toBe("boolean");
    }
  });
});
