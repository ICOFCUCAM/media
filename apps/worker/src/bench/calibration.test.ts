import { describe, expect, it } from "vitest";
import { DEFAULT_SYNC_POLICIES } from "@cineforge/shared";
import { errorStats, judgeTolerances, TOLERANCE_DIMENSION, type Sample } from "./calibration";
import { jsonSafe, recordBenchmarkRun, type EvaluationDb } from "./record";

const s = (dimension: Sample["dimension"], error: number | null): Sample => ({ dimension, label: "x", truth: 0, measured: error, error });

describe("sync tolerance calibration (instrument)", () => {
  it("maps every tolerance to the measurement it depends on", () => {
    expect(Object.keys(TOLERANCE_DIMENSION).sort()).toEqual(Object.keys(DEFAULT_SYNC_POLICIES.cinematic.tolerances).sort());
  });

  it("p95 of the errors, with unmeasured samples counted", () => {
    const st = errorStats([...Array.from({ length: 19 }, () => s("onset", 2000)), s("onset", 30_000), s("offset", null)]);
    expect(st.onset).toMatchObject({ n: 20, failed: 0, p50: 2000, p95: 2000, max: 30_000 });
    expect(st.offset).toMatchObject({ n: 1, failed: 1 });
  });

  it("a tolerance below the instrument's noise is UNRESOLVABLE; 3× the noise is RESOLVED", () => {
    const st = errorStats([s("video_duration", 0), s("onset", 30_000), s("offset", 5000), s("av_offset", 20_000), s("loudness", 0.1)]);
    const v = judgeTolerances(st, [DEFAULT_SYNC_POLICIES.broadcast]);
    const of = (t: string) => v.find((x) => x.tolerance === t)!;
    expect(of("durationUs").verdict).toBe("RESOLVED");
    expect(of("dialogueEndUs")).toMatchObject({ verdict: "RESOLVED", minimumResolved: 15_000 });
    expect(of("dialogueStartUs")).toMatchObject({ verdict: "MARGINAL", noiseP95: 30_000, minimumResolved: 90_000 });
    expect(of("lipSyncLeadUs")).toMatchObject({ verdict: "MARGINAL" });
    expect(of("sfxUs")).toMatchObject({ verdict: "MARGINAL" });
    expect(of("loudnessLu")).toMatchObject({ verdict: "RESOLVED", minimumResolved: 0.3 });
    const noisy = judgeTolerances(errorStats([s("av_offset", 60_000)]), [DEFAULT_SYNC_POLICIES.broadcast]);
    expect(noisy.find((x) => x.tolerance === "lipSyncLeadUs")?.verdict).toBe("UNRESOLVABLE");
  });

  it("a dimension that could not be measured can resolve nothing", () => {
    const v = judgeTolerances(errorStats([s("loudness", null)]), [DEFAULT_SYNC_POLICIES.cinematic]);
    expect(v.find((x) => x.tolerance === "loudnessLu")).toMatchObject({ verdict: "UNRESOLVABLE", noiseP95: Number.POSITIVE_INFINITY });
  });
});

describe("evaluation evidence", () => {
  it("records a run once, with the commit, JSON-safe", async () => {
    const rows: Record<string, unknown>[] = [];
    const db = {
      benchmarkRun: { create: async ({ data }: { data: Record<string, unknown> }) => { rows.push(data); return { id: "r1" }; } },
      acceptanceRun: { create: async () => ({ id: "a" }) },
    } as EvaluationDb;
    const prev = process.env.GITHUB_SHA;
    process.env.GITHUB_SHA = "abcdef1";
    try {
      expect(await recordBenchmarkRun(db, { suite: "sync_calibration", status: "pass", score: null, metrics: { p95: 5n, inf: Infinity }, cases: [] })).toBe("r1");
    } finally {
      if (prev === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = prev;
    }
    expect(rows[0]).toMatchObject({ suite: "sync_calibration", gitSha: "abcdef1", metrics: { p95: 5, inf: null } });
    expect(jsonSafe({ a: [1n] })).toEqual({ a: [1] });
  });

  it("a missing table is an error, never a silent skip", async () => {
    const db = {
      benchmarkRun: { create: async () => { throw Object.assign(new Error('relation "benchmark_runs" does not exist'), { code: "P2021" }); } },
      acceptanceRun: { create: async () => ({ id: "a" }) },
    } as EvaluationDb;
    await expect(recordBenchmarkRun(db, { suite: "offline", status: "pass", score: 1, metrics: {}, cases: [] })).rejects.toThrow(/apply migration 0043/);
  });
});
