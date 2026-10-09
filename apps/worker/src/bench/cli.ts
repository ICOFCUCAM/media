/**
 * Evaluation runs on the worker (DirectorOS Part 1 §50; W10), recorded in
 * benchmark_runs (migration 0043):
 *
 *   pnpm --filter @cineforge/worker bench:record                       offline engine benchmark → benchmark_runs
 *   pnpm --filter @cineforge/worker bench:live [--briefs railway,orbit] [--out live.json] [--no-record]
 *                                                                      live planning benchmark (paid) → the prompt's score
 *   pnpm --filter @cineforge/worker sync:calibrate [--out cal.json] [--no-record]
 *                                                                      sync instrument calibration
 *
 * Recording needs DATABASE_URL. `bench:live` uses the configured intelligence
 * routes (INTELLIGENCE_ROUTES / ANTHROPIC_MODEL) exactly as production does,
 * and BENCH_PRICES for cost. Its JSON report feeds `bench score` in
 * @cineforge/bench, which writes the score into prompts.lock.json.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnthropicProvider, IntelligenceRouter, OpenAIProvider } from "@cineforge/movie";
import { BENCH_BRIEFS, formatOffline, parsePrices, runOfflineBenchmark, runPlanningBenchmark } from "@cineforge/bench";
import { calibrate, formatCalibration } from "./calibration";
import { recordBenchmarkRun, type EvaluationDb } from "./record";

const flag = (name: string) => process.argv.includes(`--${name}`);
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function db(): Promise<EvaluationDb | null> {
  if (flag("no-record")) return null;
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not set: the run is printed but not recorded (pass --no-record to silence)");
    return null;
  }
  return (await import("@cineforge/db")).prisma as unknown as EvaluationDb;
}

async function main(): Promise<number> {
  const cmd = process.argv[2];
  const out = arg("out");

  if (cmd === "offline") {
    const r = runOfflineBenchmark();
    console.log(formatOffline(r));
    const status = r.cases.every((c) => c.passed) ? "pass" : "fail";
    const d = await db();
    if (d) console.log(`recorded benchmark_runs ${await recordBenchmarkRun(d, { suite: "offline", status, score: r.score, metrics: { ...r.metrics, corpus: r.corpus, suites: r.suites }, cases: r.cases })}`);
    if (out) await writeFile(out, JSON.stringify(r, null, 2));
    return status === "pass" ? 0 : 1;
  }

  if (cmd === "live") {
    const ids = arg("briefs")?.split(",").map((s) => s.trim());
    const briefs = ids ? BENCH_BRIEFS.filter((b) => ids.includes(b.id)) : BENCH_BRIEFS;
    if (!briefs.length) throw new Error(`no such briefs (have ${BENCH_BRIEFS.map((b) => b.id).join(", ")})`);
    const probe = new IntelligenceRouter([new AnthropicProvider(process.env), new OpenAIProvider(process.env)], process.env);
    if (!probe.available("film_plan")) {
      console.error("no planning provider is configured for film_plan (ANTHROPIC_API_KEY or INTELLIGENCE_ROUTES)");
      return 3;
    }
    const r = await runPlanningBenchmark(
      (onDecision) => new IntelligenceRouter([new AnthropicProvider(process.env), new OpenAIProvider(process.env)], process.env, onDecision),
      briefs,
      parsePrices(process.env.BENCH_PRICES),
    );
    for (const c of r.cases) {
      console.log(`${c.valid ? "valid  " : "INVALID"} ${c.id.padEnd(11)} first-pass ${c.firstPassValid ? "yes" : "no "} adherence ${c.adherence} continuity ${c.continuity ?? "-"} ${(c.latencyMs / 1000).toFixed(1)}s${c.costUsd !== null ? ` $${c.costUsd}` : ""}${c.error ? ` — ${c.error}` : ""}`);
    }
    console.log(`${r.promptId}@${r.promptVersion} on ${r.provider}:${r.model} — score ${r.score} ${JSON.stringify(r.metrics)}`);
    const status = r.metrics.validRate === 1 ? "pass" : "fail";
    const d = await db();
    if (d) {
      const id = await recordBenchmarkRun(d, {
        suite: "live_planning", status, score: r.score, promptId: r.promptId, promptVersion: r.promptVersion, provider: r.provider, model: r.model, metrics: r.metrics, cases: r.cases,
      });
      console.log(`recorded benchmark_runs ${id}`);
    }
    if (out) await writeFile(out, JSON.stringify(r, null, 2));
    return status === "pass" ? 0 : 1;
  }

  if (cmd === "calibrate") {
    const dir = await mkdtemp(join(tmpdir(), "cf-sync-cal-"));
    try {
      const r = await calibrate(dir);
      console.log(formatCalibration(r));
      const status = r.unresolvable.length ? "fail" : "pass";
      const d = await db();
      if (d) console.log(`recorded benchmark_runs ${await recordBenchmarkRun(d, { suite: "sync_calibration", status, score: null, metrics: { tool: r.tool, stats: r.stats }, cases: r.verdicts })}`);
      if (out) await writeFile(out, JSON.stringify({ ...r, samples: r.samples }, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), 2));
      return status === "pass" ? 0 : 1;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  console.error("usage: cli.ts offline | live | calibrate");
  return 2;
}

main()
  .then(async (code) => {
    if (process.env.DATABASE_URL) await (await import("@cineforge/db")).prisma.$disconnect().catch(() => undefined);
    process.exit(code);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
