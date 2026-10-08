import { beforeEach, describe, expect, it, vi } from "vitest";
import { degradation } from "@cineforge/shared";
import { _resetRecorderState, recordDegradations } from "./recorder";
import { _resetPublisherState, currentRegistry, publishCapabilities, readGpuCaps, rememberGpuCaps } from "./capabilities";

const missing = Object.assign(new Error('relation "public.production_degradations" does not exist'), { code: "P2021" });

class MemCache {
  m = new Map<string, string>();
  async get(k: string) { return this.m.get(k) ?? null; }
  async set(k: string, v: string) { this.m.set(k, v); return "OK"; }
}

beforeEach(() => {
  _resetRecorderState();
  _resetPublisherState();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("recordDegradations", () => {
  const d = degradation("TRACK_MISSING", "film", "No music track.");

  it("writes rows and logs every gap", async () => {
    const createMany = vi.fn(async () => ({ count: 1 }));
    expect(await recordDegradations({ productionDegradation: { createMany } }, "p1", [d])).toBe("recorded");
    expect(createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ projectId: "p1", code: "TRACK_MISSING", severity: "major" })] });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"event":"production.degradation"'));
  });

  it("before 0031 is applied it still logs, and stops retrying the table", async () => {
    const createMany = vi.fn(async () => { throw missing; });
    const db = { productionDegradation: { createMany } };
    expect(await recordDegradations(db, "p1", [d])).toBe("logged");
    expect(await recordDegradations(db, "p1", [d])).toBe("logged");
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it("nothing to record is a no-op", async () => {
    expect(await recordDegradations({ productionDegradation: { createMany: vi.fn() } }, "p1", [])).toBe("none");
  });
});

describe("capability publishing", () => {
  it("GPU reports are cached with their verification time and drive the registry", async () => {
    const cache = new MemCache();
    await rememberGpuCaps(cache, "wan-2.1", { execution: "real", realExecution: true, maxResolution: [832, 480], supportsLora: true },
      new Date("2026-10-08T00:00:00Z"));
    const gpu = await readGpuCaps(cache, ["wan-2.1", "hunyuan"]);
    expect(gpu.hunyuan).toBeNull();
    const reg = currentRegistry({}, gpu);
    const video = reg.find((c) => c.capability === "video_generation")!;
    expect(video.realExecution).toBe(true);
    expect(video.supports).toEqual(["480p"]);
    expect(video.note).toContain("GPU verified 2026-10-08T00:00:00.000Z");
  });

  it("an unverified GPU is not reported as working", () => {
    const video = currentRegistry({}, { "wan-2.1": null }).find((c) => c.capability === "video_generation")!;
    expect(video.realExecution).toBe(false);
    expect(video.status).toBe("unavailable");
  });

  it("upserts every capability; skips quietly-but-logged before 0031", async () => {
    const upsert = vi.fn(async () => ({}));
    const reg = currentRegistry({}, {});
    expect(await publishCapabilities({ systemCapability: { upsert } }, reg, "worker-1")).toBe("published");
    expect(upsert).toHaveBeenCalledTimes(reg.length);
    const failing = { systemCapability: { upsert: vi.fn(async () => { throw missing; }) } };
    expect(await publishCapabilities(failing, reg, "worker-1")).toBe("skipped");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("not migrated (0031)"));
  });
});
