/**
 * The offline benchmark (DirectorOS Part 1 §50.2): every engine CineForge owns
 * — validator chain, World State / Continuity Engine, Cinematography Engine,
 * Prompt Compiler, segmenter, voice judge and router — run over the corpus and
 * the labelled cases, scored. Deterministic, free, run in CI on every change.
 *
 * What it cannot measure (visual and audio quality of generated media, money,
 * provider latency) is reported as null here and measured by the live runs:
 * `providers:live`, the planning benchmark (./live.ts) and the film acceptance
 * test.
 */
import { checkFilmContinuity, compileFor, compileGeneration, sizeWords, validateFilmPackage } from "@cineforge/movie";
import { benchCases, SUITES, type Suite } from "./cases";
import { benchmarkCorpus, corpusConstraints, corpusCounts } from "./corpus";

export interface CaseResult {
  id: string;
  suite: Suite;
  description: string;
  expect: string[];
  detected: string[];
  passed: boolean;
  /** Codes reported beyond the expected ones (for a control, every one is a false positive). */
  unexpected: string[];
}

export interface SuiteScore {
  suite: Suite;
  cases: number;
  passed: number;
  controls: number;
  falsePositives: number;
  score: number;
}

export interface OfflineMetrics {
  /** Corpus films that pass the whole validator chain unchanged (no false alarms on good films). */
  storyConsistency: number;
  /** Character appearances whose shot passes continuity AND whose compiled prompt carries identity and the scene's wardrobe. */
  characterConsistency: number;
  /** Shots whose compiled prompt carries the framing, place, time, action and every subject. */
  promptAdherence: number;
  continuity: number;
  dialogue: number;
  cinematography: number;
  voice: number;
  /** Live-only measures — null offline (see providers:live, bench live, film acceptance). */
  visualQuality: null;
  audioQuality: null;
  costUsd: null;
  /** Engine latency: compiling one shot (canon → model prompt), ms. */
  compileMsP50: number;
  compileMsP95: number;
}

export interface OfflineReport {
  kind: "offline";
  corpus: ReturnType<typeof corpusCounts>;
  cases: CaseResult[];
  suites: SuiteScore[];
  metrics: OfflineMetrics;
  /** Mean of the seven measured metrics, 0..1. */
  score: number;
  durationMs: number;
}

export function judgeCase(expect: string[], detected: string[]): { passed: boolean; unexpected: string[] } {
  const unexpected = detected.filter((c) => !expect.includes(c));
  return { passed: expect.length ? expect.every((c) => detected.includes(c)) : detected.length === 0, unexpected };
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};
const ratio = (a: number, b: number) => (b ? +(a / b).toFixed(4) : 0);

export function runOfflineBenchmark(): OfflineReport {
  const t0 = performance.now();
  const films = benchmarkCorpus();

  // Story: good films must pass untouched.
  const clean = films.filter((f) => validateFilmPackage(f, corpusConstraints()).ok).length;

  // Character consistency and prompt adherence over every shot of the corpus.
  let appearances = 0, consistent = 0, shots = 0, adherent = 0;
  const compileMs: number[] = [];
  for (const pkg of films) {
    const continuity = new Map(checkFilmContinuity(pkg).map((x) => [`${x.sceneId}#${x.shotIndex}`, x.result]));
    for (const scene of pkg.scenes) {
      const loc = pkg.locations.find((l) => l.id === scene.locationId)!;
      for (const shot of scene.shots) {
        const s = performance.now();
        const out = compileFor("wan-2.1", compileGeneration(pkg, scene.id, shot.index));
        compileMs.push(performance.now() - s);
        const p = out.prompt;
        shots++;
        const names = shot.subjectIds.map((id) => pkg.cast.find((c) => c.id === id)?.name ?? pkg.props.find((x) => x.id === id)?.name ?? pkg.locations.find((l) => l.id === id)?.name ?? id);
        if (p.includes(sizeWords(shot.size)) && p.includes(loc.name) && p.includes(scene.timeOfDay) && p.includes(shot.action) && names.every((n) => p.includes(n))) adherent++;
        for (const id of shot.subjectIds.filter((x) => x.startsWith("char_"))) {
          appearances++;
          const c = pkg.cast.find((x) => x.id === id)!;
          const w = c.wardrobe.find((x) => x.id === scene.characters.find((y) => y.characterId === id)?.wardrobeId);
          const ok = continuity.get(`${scene.id}#${shot.index}`)?.violations.length === 0;
          if (ok && w && p.includes(c.identity.face) && p.includes(c.identity.hair) && p.includes(w.description)) consistent++;
        }
      }
    }
  }

  const cases: CaseResult[] = benchCases().map((c) => {
    let detected: string[];
    try {
      detected = c.detect();
    } catch (e) {
      detected = [`ENGINE_THREW: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`];
    }
    return { id: c.id, suite: c.suite, description: c.description, expect: c.expect, detected, ...judgeCase(c.expect, detected) };
  });
  const suites: SuiteScore[] = SUITES.map((suite) => {
    const xs = cases.filter((c) => c.suite === suite);
    const controls = xs.filter((c) => !c.expect.length);
    const passed = xs.filter((c) => c.passed).length;
    return { suite, cases: xs.length, passed, controls: controls.length, falsePositives: controls.filter((c) => !c.passed).length, score: ratio(passed, xs.length) };
  });
  const suite = (s: Suite) => suites.find((x) => x.suite === s)!.score;

  const metrics: OfflineMetrics = {
    storyConsistency: ratio(clean, films.length),
    characterConsistency: ratio(consistent, appearances),
    promptAdherence: ratio(adherent, shots),
    continuity: suite("continuity"),
    dialogue: suite("dialogue"),
    cinematography: suite("cinematography"),
    voice: suite("voice"),
    visualQuality: null,
    audioQuality: null,
    costUsd: null,
    compileMsP50: +quantile(compileMs, 0.5).toFixed(3),
    compileMsP95: +quantile(compileMs, 0.95).toFixed(3),
  };
  const measured = [metrics.storyConsistency, metrics.characterConsistency, metrics.promptAdherence, metrics.continuity, metrics.dialogue, metrics.cinematography, metrics.voice];
  return {
    kind: "offline",
    corpus: corpusCounts(films),
    cases,
    suites,
    metrics,
    score: +(measured.reduce((a, b) => a + b, 0) / measured.length).toFixed(4),
    durationMs: Math.round(performance.now() - t0),
  };
}

/** Metrics that fell below the baseline (a regression), with by how much. */
export function regressions(report: OfflineReport, baseline: Partial<Record<keyof OfflineMetrics | "score", number>>): string[] {
  const out: string[] = [];
  for (const [k, min] of Object.entries(baseline)) {
    if (typeof min !== "number" || k.startsWith("compileMs")) continue;
    const v = k === "score" ? report.score : (report.metrics as unknown as Record<string, number | null>)[k];
    if (typeof v === "number" && v < min) out.push(`${k} ${v} < baseline ${min}`);
  }
  return out;
}

export function formatOffline(r: OfflineReport): string {
  const m = r.metrics;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return [
    `corpus: ${r.corpus.films} films, ${r.corpus.scenes} scenes, ${r.corpus.characters} characters, ${r.corpus.locations} locations, ${r.corpus.shots} shots`,
    ...r.suites.map((s) => `${s.suite.padEnd(15)} ${s.passed}/${s.cases} (${s.controls} controls, ${s.falsePositives} false positives)`),
    `story consistency      ${pct(m.storyConsistency)}`,
    `character consistency  ${pct(m.characterConsistency)}`,
    `prompt adherence       ${pct(m.promptAdherence)}`,
    `compile latency        p50 ${m.compileMsP50} ms, p95 ${m.compileMsP95} ms`,
    `visual/audio quality, cost: live runs only`,
    ...r.cases.filter((c) => !c.passed).map((c) => `FAILED ${c.id} ${c.description}: expected [${c.expect.join(", ")}] got [${c.detected.join(", ")}]`),
    `BENCHMARK_SCORE: ${r.score}`,
  ].join("\n");
}
