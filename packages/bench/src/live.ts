/**
 * The live planning benchmark (DirectorOS Part 1 §50.2, DOS-49.2): the master
 * prompt and the model that answers it, run on fixed briefs and scored —
 * validity, first-pass validity, adherence to the brief, story and character
 * consistency of the plan, latency and cost. Its score is the prompt version's
 * evaluation score (recorded in benchmark_runs by the worker's `bench:live`).
 *
 * Spends real money: one plan (plus at most one revision) per brief.
 */
import {
  checkFilmContinuity,
  PROMPTS,
  PlanInvalidError,
  planFilm,
  type DecisionRecord,
  type IntelligenceRouter,
  type ProductionConstraints,
} from "@cineforge/movie";

export interface BenchBrief {
  id: string;
  brief: string;
  constraints: ProductionConstraints;
  /** Words the plan must carry from the brief (case-insensitive) — adherence. */
  mustMention: string[];
}

const c = (sceneCount: number, sceneSec: number): ProductionConstraints => ({
  sceneCount, sceneSec, sceneTolerance: 0.2, maxShotsPerScene: 4, maxShotSec: 5, targetSeconds: sceneCount * sceneSec, filmTolerance: 0.15,
});

export const BENCH_BRIEFS: BenchBrief[] = [
  { id: "railway", constraints: c(4, 15), mustMention: ["railway", "station", "night", "message"],
    brief: "A woman arrives at an abandoned railway station at night and discovers that someone has left a message for her." },
  { id: "lighthouse", constraints: c(3, 15), mustMention: ["lighthouse", "bottle", "handwriting"],
    brief: "A lighthouse keeper finds a message in a bottle addressed to her, written in her own handwriting." },
  { id: "kitchen", constraints: c(3, 12), mustMention: ["kitchen", "recipe", "grandmother"],
    brief: "Two estranged brothers try to cook their late grandmother's recipe in her kitchen before the house is sold." },
  { id: "orbit", constraints: c(4, 12), mustMention: ["station", "oxygen", "engineer"],
    brief: "An engineer alone on an orbital station must choose between fixing the oxygen system and answering a distress call." },
  { id: "market", constraints: c(3, 12), mustMention: ["market", "thief", "child"],
    brief: "At a crowded night market, a child sees a thief take a stranger's wallet and has to decide whether to say anything." },
];

/** USD per million tokens, from BENCH_PRICES="model=in:out;model2=in:out" (no built-in prices: they change). */
export function parsePrices(spec: string | undefined): Record<string, { input: number; output: number }> {
  const out: Record<string, { input: number; output: number }> = {};
  for (const part of (spec ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [model, rates] = part.split("=");
    const [i, o] = (rates ?? "").split(":").map(Number);
    if (!model || !Number.isFinite(i) || !Number.isFinite(o)) throw new Error(`BENCH_PRICES: "${part}" must be model=input:output`);
    out[model.trim()] = { input: i!, output: o! };
  }
  return out;
}

export interface LiveCase {
  id: string;
  valid: boolean;
  firstPassValid: boolean;
  revised: boolean;
  /** Issue codes the first plan had (what the revision had to fix), or the final ones on failure. */
  issues: string[];
  adherence: number;
  scenes: number;
  /** Character appearances in planned shots that pass continuity. */
  continuity: number | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number | null;
  error: string | null;
}

export interface LiveReport {
  kind: "live_planning";
  promptId: string;
  promptVersion: number;
  provider: string | null;
  model: string | null;
  cases: LiveCase[];
  metrics: {
    validRate: number;
    firstPassRate: number;
    adherence: number;
    storyConsistency: number;
    characterConsistency: number;
    latencyMsMean: number;
    costUsd: number | null;
  };
  /** 0.4 valid + 0.2 first-pass valid + 0.2 adherence + 0.2 character consistency. */
  score: number;
}

export function adherenceOf(pkg: unknown, words: string[]): number {
  if (!words.length) return 1;
  const text = JSON.stringify(pkg).toLowerCase();
  return words.filter((w) => text.includes(w.toLowerCase())).length / words.length;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r4 = (x: number) => +x.toFixed(4);

export async function runPlanningBenchmark(
  routerFor: (onDecision: (d: DecisionRecord) => void) => IntelligenceRouter,
  briefs: BenchBrief[] = BENCH_BRIEFS,
  prices: Record<string, { input: number; output: number }> = {},
): Promise<LiveReport> {
  const cases: LiveCase[] = [];
  let provider: string | null = null;
  let model: string | null = null;
  for (const b of briefs) {
    const decisions: DecisionRecord[] = [];
    const router = routerFor((d) => { decisions.push(d); });
    const t0 = Date.now();
    let row: Omit<LiveCase, "inputTokens" | "outputTokens" | "latencyMs" | "costUsd">;
    try {
      const plan = await planFilm(router, b.brief, b.constraints);
      provider = plan.provider;
      model = plan.model;
      const shots = checkFilmContinuity(plan.pkg);
      const appearances = shots.flatMap((s) => {
        const scene = plan.pkg.scenes.find((x) => x.id === s.sceneId)!;
        const shot = scene.shots.find((x) => x.index === s.shotIndex)!;
        return shot.subjectIds.filter((id) => id.startsWith("char_")).map((id) => !s.result.violations.some((v) => v.subjectId === id));
      });
      row = {
        id: b.id, valid: true, firstPassValid: !plan.revised, revised: plan.revised, issues: [...new Set(plan.fixedIssues.map((i) => i.code))],
        adherence: r4(adherenceOf(plan.pkg, b.mustMention)), scenes: plan.pkg.scenes.length,
        continuity: appearances.length ? r4(appearances.filter(Boolean).length / appearances.length) : null, error: null,
      };
    } catch (e) {
      row = {
        id: b.id, valid: false, firstPassValid: false, revised: e instanceof PlanInvalidError, scenes: 0, adherence: 0, continuity: null,
        issues: e instanceof PlanInvalidError ? [...new Set(e.issues.map((i) => i.code))] : [],
        error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
      };
    }
    const inputTokens = decisions.reduce((n, d) => n + (d.inputTokens ?? 0), 0);
    const outputTokens = decisions.reduce((n, d) => n + (d.outputTokens ?? 0), 0);
    const price = decisions.find((d) => d.model && prices[d.model])?.model;
    const costUsd = price ? r4((inputTokens * prices[price]!.input + outputTokens * prices[price]!.output) / 1e6) : null;
    model ??= decisions.find((d) => d.model)?.model ?? null;
    provider ??= decisions.find((d) => d.provider)?.provider ?? null;
    cases.push({ ...row, inputTokens, outputTokens, latencyMs: Date.now() - t0, costUsd });
  }
  const valid = cases.filter((x) => x.valid);
  const metrics = {
    validRate: r4(valid.length / cases.length),
    firstPassRate: r4(cases.filter((x) => x.firstPassValid).length / cases.length),
    adherence: r4(mean(cases.map((x) => x.adherence))),
    // A first plan free of story/canon/reference issues (production budget issues are not story).
    storyConsistency: r4(cases.filter((x) => x.valid && !x.issues.some(isStoryCode)).length / cases.length),
    characterConsistency: r4(mean(valid.map((x) => x.continuity ?? 0))),
    latencyMsMean: Math.round(mean(cases.map((x) => x.latencyMs))),
    costUsd: cases.every((x) => x.costUsd !== null) ? r4(cases.reduce((a, x) => a + x.costUsd!, 0)) : null,
  };
  return {
    kind: "live_planning",
    promptId: PROMPTS.directorMaster.id,
    promptVersion: PROMPTS.directorMaster.version,
    provider, model, cases, metrics,
    score: r4(0.4 * metrics.validRate + 0.2 * metrics.firstPassRate + 0.2 * metrics.adherence + 0.2 * metrics.characterConsistency),
  };
}

/** Validator codes from the production/budget stages — everything else is story, canon or reference. */
const PRODUCTION_CODES = new Set(["SCENE_COUNT", "TOO_MANY_SHOTS", "SHOT_ORDER", "SHOT_TOO_LONG", "SPEECH_TOO_LONG", "SCENE_LENGTH", "FILM_LENGTH"]);
export const isStoryCode = (code: string) => !PRODUCTION_CODES.has(code);
