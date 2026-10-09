/**
 * Evaluation evidence (migration 0043): benchmark runs and film acceptance
 * runs are written once and never changed. A missing table (0043 not applied)
 * is reported, never ignored — evidence that was not stored was not produced.
 */
import { isMissingTable } from "../timeline/store";

export interface BenchmarkRunRow {
  suite: "offline" | "live_planning" | "providers" | "sync_calibration";
  status: "pass" | "fail" | "incomplete";
  score: number | null;
  promptId?: string | null;
  promptVersion?: number | null;
  provider?: string | null;
  model?: string | null;
  metrics: Record<string, unknown>;
  cases: unknown[];
}

export interface EvaluationDb {
  benchmarkRun: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
  acceptanceRun: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
}

export function gitSha(env: Record<string, string | undefined> = process.env): string | null {
  const sha = env.GITHUB_SHA ?? env.SOURCE_COMMIT ?? env.RENDER_GIT_COMMIT ?? null;
  return sha && /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
}

/** JSON-safe copy (bigint → number, Infinity → null) for jsonb columns. */
export function jsonSafe<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : typeof x === "number" && !Number.isFinite(x) ? null : x)));
}

export async function recordBenchmarkRun(db: EvaluationDb, row: BenchmarkRunRow): Promise<string> {
  try {
    const r = await db.benchmarkRun.create({
      data: {
        suite: row.suite, status: row.status, score: row.score, promptId: row.promptId ?? null, promptVersion: row.promptVersion ?? null,
        provider: row.provider ?? null, model: row.model ?? null, gitSha: gitSha(), metrics: jsonSafe(row.metrics), cases: jsonSafe(row.cases),
      },
    });
    return r.id;
  } catch (e) {
    if (isMissingTable(e)) throw new Error("benchmark_runs does not exist — apply migration 0043 before recording evaluation runs");
    throw e;
  }
}
