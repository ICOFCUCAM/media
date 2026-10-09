import { describe, expect, it } from "vitest";
import { MetricsRegistry, PROVIDER_HOSTS, providerUrl, readiness } from "./index";

describe("metrics registry (Prometheus text)", () => {
  it("renders counters and gauges with sorted, escaped labels", () => {
    const m = new MetricsRegistry();
    m.inc("cineforge_jobs_total", "jobs", { queue: "video-queue", outcome: "completed" });
    m.inc("cineforge_jobs_total", "jobs", { outcome: "completed", queue: "video-queue" }, 2);
    m.set("cineforge_up", "up", 1);
    m.inc("cineforge_usage_units_total", "usage", { provider: 'we"ird\nname' });
    expect(m.render()).toBe([
      "# HELP cineforge_jobs_total jobs", "# TYPE cineforge_jobs_total counter",
      'cineforge_jobs_total{outcome="completed",queue="video-queue"} 3',
      "# HELP cineforge_up up", "# TYPE cineforge_up gauge", "cineforge_up 1",
      "# HELP cineforge_usage_units_total usage", "# TYPE cineforge_usage_units_total counter",
      'cineforge_usage_units_total{provider="we\\"ird\\nname"} 1', "",
    ].join("\n"));
  });

  it("refuses bad names, decreasing counters and type changes", () => {
    const m = new MetricsRegistry();
    expect(() => m.inc("bad-name", "x")).toThrow(/invalid metric name/);
    expect(() => m.inc("a_total", "x", {}, -1)).toThrow(/only increase/);
    m.inc("a_total", "x");
    expect(() => m.set("a_total", "x", 1)).toThrow(/is a counter/);
  });
});

describe("readiness", () => {
  it("ready only when every check answers in time", async () => {
    expect((await readiness({ a: async () => 1, b: async () => 2 })).ok).toBe(true);
    const r = await readiness({ a: async () => 1, b: async () => { throw new Error("down"); }, c: () => new Promise(() => {}) }, 50);
    expect(r.ok).toBe(false);
    expect(r.checks.b).toMatchObject({ ok: false, error: "down" });
    expect(r.checks.c?.error).toMatch(/timeout after 50 ms/);
  });
});

describe("provider hosts from the environment (docs/38 §AF)", () => {
  it("uses the configured base URL, without a trailing slash", () => {
    expect(providerUrl("openai", {})).toBe("https://api.openai.com/v1");
    expect(providerUrl("openai", { OPENAI_BASE_URL: "https://proxy.internal/openai/v1/" })).toBe("https://proxy.internal/openai/v1");
    expect(providerUrl("fal_queue", { FAL_QUEUE_URL: "http://fal-mock:8080" })).toBe("http://fal-mock:8080");
  });

  it("refuses a value that is not an absolute http(s) URL", () => {
    expect(() => providerUrl("runpod", { RUNPOD_API_URL: "api.runpod.io" })).toThrow(/RUNPOD_API_URL must be an absolute URL/);
    expect(() => providerUrl("resend", { RESEND_API_URL: "file:///etc/passwd" })).toThrow(/must be http\(s\)/);
  });

  it("every provider has an env name and an https default", () => {
    for (const h of Object.values(PROVIDER_HOSTS)) {
      expect(h.env).toMatch(/^[A-Z_]+_URL$/);
      expect(h.default.startsWith("https://")).toBe(true);
    }
  });
});
