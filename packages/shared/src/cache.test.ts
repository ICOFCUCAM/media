import { describe, it, expect } from "vitest";
import { computePromptHash, computeCacheKey, deterministicSeed, type CacheKeyInput } from "./cache";
import { planSceneCount, planShotCount, planShotsPerScene } from "./planning";

const base: CacheKeyInput = {
  modelId: "wan-2.1",
  modelVersion: "wan-2.1-1.0",
  promptHash: "abc",
  seed: 123,
  width: 1280,
  height: 720,
  durationSec: 5,
  referenceKeys: ["b", "a"],
};

describe("content-addressed cache (C7)", () => {
  it("is deterministic for identical inputs", () => {
    expect(computeCacheKey(base)).toBe(computeCacheKey({ ...base }));
  });

  it("ignores reference-key ordering", () => {
    expect(computeCacheKey({ ...base, referenceKeys: ["a", "b"] })).toBe(
      computeCacheKey({ ...base, referenceKeys: ["b", "a"] }),
    );
  });

  it("changes when any generation input changes", () => {
    const k = computeCacheKey(base);
    expect(computeCacheKey({ ...base, seed: 124 })).not.toBe(k);
    expect(computeCacheKey({ ...base, modelVersion: "wan-2.1-1.1" })).not.toBe(k);
    expect(computeCacheKey({ ...base, promptHash: "def" })).not.toBe(k);
    expect(computeCacheKey({ ...base, width: 1920 })).not.toBe(k);
    expect(computeCacheKey({ ...base, loraKey: "x" })).not.toBe(k);
  });

  it("promptHash depends on prompt + negative prompt", () => {
    expect(computePromptHash({ prompt: "a" })).not.toBe(computePromptHash({ prompt: "b" }));
    expect(computePromptHash({ prompt: "a", negativePrompt: "x" })).not.toBe(
      computePromptHash({ prompt: "a", negativePrompt: "y" }),
    );
  });

  it("deterministicSeed is stable and varies by input", () => {
    expect(deterministicSeed("p", 1, 2)).toBe(deterministicSeed("p", 1, 2));
    expect(deterministicSeed("p", 1, 2)).not.toBe(deterministicSeed("p", 1, 3));
    expect(deterministicSeed("p", 1, 2)).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("planning math", () => {
  it("scales scenes/shots with duration", () => {
    expect(planSceneCount(1800)).toBe(100); // 30 min / 18s
    expect(planShotsPerScene()).toBe(4);
    expect(planShotCount(1800)).toBe(400);
  });
  it("caps very long films and floors at 1 scene", () => {
    expect(planSceneCount(0)).toBe(1);
    expect(planSceneCount(10_000_000)).toBeLessThanOrEqual(400 * 1);
  });
});
