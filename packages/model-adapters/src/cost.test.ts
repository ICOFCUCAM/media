import { describe, it, expect } from "vitest";
import { estimateShotMs, estimateFilmMs, MODEL_VERSIONS } from "./cost";

describe("cost estimator (C8)", () => {
  it("scales shot cost with resolution and duration", () => {
    const ref = estimateShotMs("wan-2.1", { width: 832, height: 480, durationSec: 5 });
    // double the pixels -> ~double the cost
    expect(estimateShotMs("wan-2.1", { width: 1664, height: 480, durationSec: 5 })).toBeCloseTo(ref * 2, -2);
    // double the duration -> exactly double the cost
    expect(estimateShotMs("wan-2.1", { width: 832, height: 480, durationSec: 10 })).toBe(ref * 2);
  });

  it("hunyuan (premium) costs more than wan at the same target", () => {
    const dims = { width: 1280, height: 720, durationSec: 5 };
    expect(estimateShotMs("hunyuan", dims)).toBeGreaterThan(estimateShotMs("wan-2.1", dims));
  });

  it("unknown model falls back to wan baseline", () => {
    const dims = { width: 832, height: 480, durationSec: 5 };
    expect(estimateShotMs("does-not-exist", dims)).toBe(estimateShotMs("wan-2.1", dims));
  });

  it("film estimate aggregates shots + audio + render overhead", () => {
    const ms = estimateFilmMs("wan-2.1", { shotCount: 400, sceneCount: 100, width: 1280, height: 720 });
    const perShot = estimateShotMs("wan-2.1", { width: 1280, height: 720, durationSec: 5 });
    expect(ms).toBeGreaterThan(400 * perShot); // includes audio + render
  });

  it("exposes pinned model versions for provenance", () => {
    expect(MODEL_VERSIONS["wan-2.1"]).toBeTruthy();
    expect(MODEL_VERSIONS["hunyuan"]).toBeTruthy();
  });
});
