/**
 * Benchmark commands (DirectorOS Part 1 §50):
 *
 *   pnpm --filter @cineforge/bench bench offline [--out report.json]   run the offline benchmark, fail on regression
 *   pnpm --filter @cineforge/bench bench baseline                      accept the current offline scores as the baseline
 *   pnpm --filter @cineforge/bench bench lock                          refresh prompts.lock.json after a prompt version bump
 *   pnpm --filter @cineforge/bench bench score <live-report.json>      record a live planning score for the prompt version it ran
 *
 * The live planning benchmark itself runs where the provider keys are:
 * `pnpm --filter @cineforge/worker bench:live` (records to benchmark_runs).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkPromptLock, refreshLock, scorePrompt, type PromptLock } from "./prompts";
import { formatOffline, regressions, runOfflineBenchmark } from "./run";
import type { LiveReport } from "./live";

const root = (f: string) => fileURLToPath(new URL(`../${f}`, import.meta.url));
const LOCK = root("prompts.lock.json");
const BASELINE = root("baseline.json");

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const [cmd, arg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const outAt = process.argv.indexOf("--out");
  if (cmd === "offline" || !cmd) {
    const report = runOfflineBenchmark();
    console.log(formatOffline(report));
    if (outAt > 0) await writeFile(process.argv[outAt + 1]!, JSON.stringify(report, null, 2));
    const baseline = await readJson<Record<string, number>>(BASELINE);
    const reg = baseline ? regressions(report, baseline) : ["no baseline.json"];
    const lock = await readJson<PromptLock>(LOCK);
    const lockProblems = lock ? checkPromptLock(lock) : ["no prompts.lock.json"];
    for (const r of reg) console.error(`REGRESSION ${r}`);
    for (const p of lockProblems) console.error(`PROMPT LOCK ${p}`);
    const unscored = lock?.prompts.filter((p) => p.score === null).map((p) => `${p.id}@${p.version}`) ?? [];
    if (unscored.length) console.log(`unscored prompt versions (run bench:live): ${unscored.join(", ")}`);
    return reg.length || lockProblems.length ? 1 : 0;
  }
  if (cmd === "baseline") {
    const r = runOfflineBenchmark();
    const { visualQuality: _v, audioQuality: _a, costUsd: _c, compileMsP50: _p, compileMsP95: _q, ...measured } = r.metrics;
    await writeFile(BASELINE, `${JSON.stringify({ ...measured, score: r.score }, null, 2)}\n`);
    console.log(`baseline written: score ${r.score}`);
    return 0;
  }
  if (cmd === "lock") {
    const next = refreshLock(await readJson<PromptLock>(LOCK));
    await writeFile(LOCK, `${JSON.stringify(next, null, 2)}\n`);
    console.log(next.prompts.map((p) => `${p.id}@${p.version} ${p.score === null ? "unscored" : p.score}`).join("\n"));
    return 0;
  }
  if (cmd === "score") {
    if (!arg) throw new Error("usage: bench score <live-report.json>");
    const live = await readJson<LiveReport>(arg);
    if (live?.kind !== "live_planning") throw new Error(`${arg} is not a live planning report`);
    const lock = await readJson<PromptLock>(LOCK);
    if (!lock) throw new Error("no prompts.lock.json");
    const entry = lock.prompts.find((p) => p.id === live.promptId);
    if (entry?.version !== live.promptVersion) throw new Error(`the report scored ${live.promptId}@${live.promptVersion}; the lock has v${entry?.version}`);
    await writeFile(LOCK, `${JSON.stringify(scorePrompt(lock, live.promptId, live.promptVersion, live.score, live.model), null, 2)}\n`);
    console.log(`${live.promptId}@${live.promptVersion} scored ${live.score} (${live.model})`);
    return 0;
  }
  throw new Error(`unknown command ${cmd}`);
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
