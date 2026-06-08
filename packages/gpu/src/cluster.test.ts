import { describe, it, expect } from "vitest";
import { GpuClusterRouter, parseClusterFromEnv, type GpuWorkerSpec } from "./cluster";

const workers: GpuWorkerSpec[] = [
  { id: "wan-a40", modelId: "wan-2.1", gpuType: "A40", baseUrl: "http://a40" },
  { id: "wan-a100", modelId: "wan-2.1", gpuType: "A100", baseUrl: "http://a100" },
  { id: "hun-h100", modelId: "hunyuan", gpuType: "H100", baseUrl: "http://h100" },
];

describe("GpuClusterRouter (C5)", () => {
  const r = new GpuClusterRouter(workers);

  it("lists workers/urls for a model", () => {
    expect(r.workersFor("wan-2.1")).toHaveLength(2);
    expect(r.baseUrlsFor("hunyuan")).toEqual(["http://h100"]);
  });

  it("prefers the faster GPU when load is equal", () => {
    expect(r.pick("wan-2.1")?.id).toBe("wan-a100");
  });

  it("routes by throughput-normalized load", () => {
    // a40 load 1 (score 1.0) vs a100 load 2 (score 0.8) -> a100 wins
    const load = new Map([["wan-a40", 1], ["wan-a100", 2]]);
    expect(r.pick("wan-2.1", { load })?.id).toBe("wan-a100");
    // now a100 heavily loaded -> a40 wins
    expect(r.pick("wan-2.1", { load: new Map([["wan-a40", 1], ["wan-a100", 10]]) })?.id).toBe("wan-a40");
  });

  it("skips unhealthy workers and returns null when none serve the model", () => {
    expect(r.pick("wan-2.1", { healthy: (id) => id !== "wan-a100" })?.id).toBe("wan-a40");
    expect(r.pick("nope")).toBeNull();
    expect(r.pick("wan-2.1", { healthy: () => false })).toBeNull();
  });
});

describe("parseClusterFromEnv", () => {
  it("builds A40 workers from comma-separated URLs", () => {
    const w = parseClusterFromEnv({ WAN_GPU_URLS: "http://a, http://b", HUNYUAN_GPU_URL: "http://h" });
    expect(w.filter((x) => x.modelId === "wan-2.1")).toHaveLength(2);
    expect(w.find((x) => x.modelId === "hunyuan")?.baseUrl).toBe("http://h");
  });

  it("honors explicit GPU_CLUSTER JSON", () => {
    const spec = [{ id: "x", modelId: "wan-2.1", gpuType: "H100", baseUrl: "http://x" }];
    expect(parseClusterFromEnv({ GPU_CLUSTER: JSON.stringify(spec) })).toEqual(spec);
  });
});
