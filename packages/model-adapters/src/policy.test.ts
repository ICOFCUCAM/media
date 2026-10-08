import { describe, it, expect } from "vitest";
import { isModelAllowed, allowedModels, resolveModel } from "./policy";

describe("model routing policy (C5)", () => {
  it("primary model is available to every tier", () => {
    for (const tier of ["FREE", "CREATOR", "STUDIO", "ENTERPRISE"] as const) {
      expect(isModelAllowed("wan-2.1", tier)).toBe(true);
    }
  });

  it("premium model is gated to Studio/Enterprise", () => {
    expect(isModelAllowed("hunyuan", "FREE")).toBe(false);
    expect(isModelAllowed("hunyuan", "CREATOR")).toBe(false);
    expect(isModelAllowed("hunyuan", "STUDIO")).toBe(true);
    expect(isModelAllowed("hunyuan", "ENTERPRISE")).toBe(true);
  });

  it("lists allowed models per tier", () => {
    expect(allowedModels("FREE")).toEqual(["wan-2.1"]);
    expect(allowedModels("STUDIO")).toContain("hunyuan");
  });

  it("resolveModel falls back to primary when not allowed, and says so", () => {
    expect(resolveModel("hunyuan", "FREE")).toEqual({
      modelId: "wan-2.1", substituted: true, requested: "hunyuan", reason: "MODEL_NOT_ALLOWED_FOR_TIER",
    });
    expect(resolveModel("hunyuan", "STUDIO")).toEqual({ modelId: "hunyuan", substituted: false, requested: "hunyuan" });
    expect(resolveModel("unknown-model", "ENTERPRISE")).toMatchObject({ modelId: "wan-2.1", substituted: true, reason: "MODEL_UNKNOWN" });
  });
});
