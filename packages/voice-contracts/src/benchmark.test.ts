import { describe, expect, it } from "vitest";
import { BENCH_SCRIPTS, consistency, normalizeWords, summarizeEngine, wordErrorRate } from "./benchmark";

const words = (t: string) => normalizeWords(t).length;

describe("voice benchmark (Part 4 §136)", () => {
  it("covers every script type and language §136.2 names, at roughly the stated lengths", () => {
    expect(new Set(BENCH_SCRIPTS.map((s) => s.kind))).toEqual(new Set(["narration_30s", "narration_2m", "narration_10m", "emotional", "documentary", "conversational"]));
    expect(new Set(BENCH_SCRIPTS.map((s) => s.language))).toEqual(new Set(["en", "no", "fr"]));
    // ~2.6 spoken words a second (the planner's speech rate).
    const sec = (id: string) => words(BENCH_SCRIPTS.find((s) => s.id === id)!.text) / 2.6;
    expect(sec("en-narration-30s")).toBeGreaterThan(20);
    expect(sec("en-narration-30s")).toBeLessThan(40);
    expect(sec("en-narration-2m")).toBeGreaterThan(90);
    expect(sec("en-narration-2m")).toBeLessThan(150);
    expect(sec("en-narration-10m")).toBeGreaterThan(480);
    expect(sec("en-narration-10m")).toBeLessThan(720);
    expect(new Set(BENCH_SCRIPTS.map((s) => s.id)).size).toBe(BENCH_SCRIPTS.length);
  });

  it("word error rate counts substitutions, deletions and insertions against the script", () => {
    expect(wordErrorRate("The boy is missing.", "the boy is missing")).toBe(0);
    expect(wordErrorRate("The boy is missing.", "the toy is missing")).toBe(0.25);
    expect(wordErrorRate("The boy is missing.", "the boy missing")).toBe(0.25);
    expect(wordErrorRate("The boy is missing.", "the boy is not missing")).toBe(0.25);
    expect(wordErrorRate("Aujourd'hui, le garçon n'est pas là.", "aujourd'hui le garçon n'est pas là")).toBe(0);
    expect(wordErrorRate("", "")).toBe(0);
  });

  it("long-form consistency: loudness spread and pace variation across segments", () => {
    const c = consistency([
      { words: 26, durationSec: 10, integratedLufs: -16 },
      { words: 26, durationSec: 10, integratedLufs: -17.5 },
      { words: 39, durationSec: 10, integratedLufs: -16.5 },
    ]);
    expect(c.loudnessSpreadLu).toBeCloseTo(1.5);
    expect(c.paceCv).toBeGreaterThan(0.15);
    expect(consistency([{ words: 10, durationSec: 4, integratedLufs: -16 }])).toEqual({ loudnessSpreadLu: null, paceCv: null });
  });

  it("summaries use medians over the cases that worked", () => {
    const s = summarizeEngine([
      { engine: "e", script: "a", language: "en", kind: "emotional", ok: true, wer: 0.02, realTimeFactor: 0.3 },
      { engine: "e", script: "b", language: "en", kind: "documentary", ok: true, wer: 0.9, realTimeFactor: 0.4 },
      { engine: "e", script: "c", language: "en", kind: "conversational", ok: true, wer: 0.04, realTimeFactor: 0.2 },
      { engine: "e", script: "d", language: "no", kind: "narration_30s", ok: false, error: "x" },
    ]);
    expect(s).toMatchObject({ cases: 4, succeeded: 3, medianWer: 0.04, medianRealTimeFactor: 0.3, medianLoudnessSpreadLu: null });
  });
});
