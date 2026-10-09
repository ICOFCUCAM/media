import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_CONSTRAINTS,
  fixturePackage,
  IntelligenceRouter,
  validateFilmPackage,
  type DecisionRecord,
  type IntelligenceProvider,
  type StructuredRequest,
} from "@cineforge/movie";
import { benchCases } from "./cases";
import { benchmarkCorpus, corpusConstraints, corpusCounts } from "./corpus";
import { adherenceOf, parsePrices, runPlanningBenchmark, type BenchBrief } from "./live";
import { checkPromptLock, promptFingerprints, refreshLock, scorePrompt, type PromptLock } from "./prompts";
import { judgeCase, regressions, runOfflineBenchmark } from "./run";

const json = <T>(f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")) as T;

describe("corpus (Part 1 §50.1)", () => {
  it("is 100 scenes, 50 characters and 30 locations, every film valid", () => {
    const films = benchmarkCorpus();
    expect(corpusCounts(films)).toMatchObject({ films: 10, scenes: 100, characters: 50, locations: 30 });
    for (const f of films) expect(validateFilmPackage(f, corpusConstraints()).ok).toBe(true);
  });

  it("has 20 labelled defects in each of continuity, dialogue and cinematography, plus controls", () => {
    const cases = benchCases();
    const by = (s: string) => cases.filter((c) => c.suite === s);
    for (const s of ["continuity", "dialogue", "cinematography"]) expect(by(s).length).toBeGreaterThanOrEqual(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.some((c) => !c.expect.length)).toBe(true);
  });
});

describe("offline benchmark (Part 1 §50.2)", () => {
  const report = runOfflineBenchmark();

  it("does not regress below the committed baseline", () => {
    expect(regressions(report, json<Record<string, number>>("baseline.json"))).toEqual([]);
    expect(report.cases.filter((c) => !c.passed).map((c) => `${c.id}: ${c.detected.join(",")}`)).toEqual([]);
  });

  it("reports what it cannot measure offline as null, not as a score", () => {
    expect(report.metrics).toMatchObject({ visualQuality: null, audioQuality: null, costUsd: null });
  });

  it("a missed defect and a false alarm both fail a case", () => {
    expect(judgeCase(["CROSSES_LINE"], [])).toEqual({ passed: false, unexpected: [] });
    expect(judgeCase([], ["SIZE_REPEAT"])).toEqual({ passed: false, unexpected: ["SIZE_REPEAT"] });
    expect(judgeCase(["A"], ["A", "B"])).toEqual({ passed: true, unexpected: ["B"] });
    expect(regressions({ ...report, score: 0.5 }, { score: 0.9 })).toEqual(["score 0.5 < baseline 0.9"]);
  });
});

describe("prompt change control (DOS-49.2)", () => {
  it("the committed lock matches every registered prompt", () => {
    expect(checkPromptLock(json<PromptLock>("prompts.lock.json"))).toEqual([]);
  });

  it("an edited prompt without a version bump fails; a bump needs a lock refresh", () => {
    const cur = promptFingerprints();
    const lock = refreshLock(null, cur);
    const edited = cur.map((p, i) => (i === 0 ? { ...p, sha256: "0".repeat(64) } : p));
    expect(checkPromptLock(lock, edited)[0]).toMatch(/changed but its version did not/);
    const bumped = cur.map((p, i) => (i === 0 ? { ...p, version: p.version + 1, sha256: "1".repeat(64) } : p));
    expect(checkPromptLock(lock, bumped)[0]).toMatch(/refresh the lock/);
  });

  it("a refresh keeps scores of unchanged prompts and clears changed ones", () => {
    const cur = promptFingerprints();
    const scored = scorePrompt(refreshLock(null, cur), cur[0]!.id, cur[0]!.version, 0.9, "m", new Date(0));
    expect(refreshLock(scored, cur).prompts[0]).toMatchObject({ score: 0.9, model: "m" });
    const bumped = cur.map((p, i) => (i === 0 ? { ...p, version: p.version + 1, sha256: "f".repeat(64) } : p));
    expect(refreshLock(scored, bumped).prompts[0]).toMatchObject({ score: null, scoredAt: null });
  });
});

class Scripted implements IntelligenceProvider {
  readonly id = "fake";
  constructor(private readonly outputs: unknown[]) {}
  configured() { return true; }
  async generateStructured(_req: StructuredRequest, model: string) {
    return { output: this.outputs.shift(), provider: "fake", model, usage: { inputTokens: 1000, outputTokens: 4000 }, latencyMs: 5 };
  }
}

describe("live planning benchmark (scored with a scripted provider)", () => {
  const brief: BenchBrief = { id: "harbour", brief: "A courier crosses a harbour.", constraints: FIXTURE_CONSTRAINTS, mustMention: ["harbour", "courier", "zeppelin"] };
  const env = { INTELLIGENCE_ROUTES: "film_plan=fake:m1;film_plan_revision=fake:m1" };

  it("scores validity, first pass, adherence, consistency and cost", async () => {
    const r = await runPlanningBenchmark((on: (d: DecisionRecord) => void) => new IntelligenceRouter([new Scripted([fixturePackage()])], env, on), [brief], parsePrices("m1=3:15"));
    expect(r.cases[0]).toMatchObject({ valid: true, firstPassValid: true, revised: false, adherence: 0.6667, inputTokens: 1000, outputTokens: 4000, costUsd: 0.063 });
    expect(r.metrics).toMatchObject({ validRate: 1, firstPassRate: 1, characterConsistency: 1, costUsd: 0.063 });
    expect(r.promptId).toBe("director.master");
    expect(r.model).toBe("m1");
  });

  it("a plan that needed revision scores lower; an invalid plan scores zero for validity", async () => {
    const bad = { ...fixturePackage(), scenes: fixturePackage().scenes.slice(0, 1) };
    const revised = await runPlanningBenchmark((on) => new IntelligenceRouter([new Scripted([bad, fixturePackage()])], env, on), [brief]);
    expect(revised.cases[0]).toMatchObject({ valid: true, firstPassValid: false, revised: true, costUsd: null });
    expect(revised.cases[0]!.issues).toContain("SCENE_COUNT");
    const failed = await runPlanningBenchmark((on) => new IntelligenceRouter([new Scripted([bad, bad])], env, on), [brief]);
    expect(failed.cases[0]).toMatchObject({ valid: false, adherence: 0 });
    expect(failed.score).toBeLessThan(revised.score);
  });

  it("prices come from configuration only", () => {
    expect(parsePrices(undefined)).toEqual({});
    expect(() => parsePrices("m1=cheap")).toThrow(/model=input:output/);
    expect(adherenceOf({ a: "The HARBOUR" }, ["harbour", "moon"])).toBe(0.5);
  });
});
