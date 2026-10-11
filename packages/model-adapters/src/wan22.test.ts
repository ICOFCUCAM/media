import { describe, expect, it } from "vitest";
import { buildClusterRegistry } from "./registry";
import { estimateShotMs, MODEL_VERSIONS } from "./cost";
import { isModelAllowed, LEGACY_PRIMARY, routeVideoModel } from "./policy";

describe("Wan 2.2 (W28)", () => {
  it("registers only when its workers are configured", () => {
    expect(buildClusterRegistry({ WAN_GPU_URL: "http://a" }).has("wan-2.2")).toBe(false);
    const r = buildClusterRegistry({ WAN22_GPU_URLS: "http://b,http://c" });
    expect(r.has("wan-2.2")).toBe(true);
    const caps = r.get("wan-2.2").capabilities();
    expect(caps).toMatchObject({ id: "wan-2.2", class: "primary", supportsReferenceImage: true, supportsLora: true });
    expect(caps.resolutions).toContainEqual({ width: 1280, height: 704 });
  });

  it("is open to every tier, versioned and costed", () => {
    expect(isModelAllowed("wan-2.2", "FREE")).toBe(true);
    expect(MODEL_VERSIONS["wan-2.2"]).toMatch(/wan-2\.2/);
    expect(estimateShotMs("wan-2.2", { width: 1280, height: 720, durationSec: 5 })).toBeGreaterThan(estimateShotMs("wan-2.1", { width: 1280, height: 720, durationSec: 5 }));
  });

  it("routes legacy Wan 2.1 shots to the production model when it is up", () => {
    const up = (id: string) => id === "wan-2.2";
    expect(routeVideoModel(LEGACY_PRIMARY, { primary: "wan-2.2", available: up })).toEqual({ modelId: "wan-2.2", upgraded: true });
    // Not configured, or no primary named: as asked.
    expect(routeVideoModel(LEGACY_PRIMARY, { primary: "wan-2.2", available: () => false })).toEqual({ modelId: "wan-2.1", upgraded: false });
    expect(routeVideoModel(LEGACY_PRIMARY, { primary: "", available: up })).toEqual({ modelId: "wan-2.1", upgraded: false });
    // A shot that asked for another engine is never re-routed.
    expect(routeVideoModel("hunyuan", { primary: "wan-2.2", available: up })).toEqual({ modelId: "hunyuan", upgraded: false });
    expect(routeVideoModel("cinematic", { primary: "wan-2.2", available: up }).modelId).toBe("cinematic");
  });
});
