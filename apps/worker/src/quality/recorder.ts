/**
 * Gate results → quality_gate_results (migration 0035; append-only). Tolerated
 * until the table exists: the JSON log line is always written.
 */
import { isMissingTable } from "../timeline/store";
import type { GateResult } from "./gates";

export interface GateDb {
  qualityGateResult: { createMany(a: { data: Record<string, unknown>[] }): Promise<unknown> };
}

let tableMissing = false;
/** Test hook. */
export function _resetGateRecorder(): void {
  tableMissing = false;
}

export async function recordGates(
  db: GateDb,
  projectId: string,
  scope: "shot" | "film",
  refId: string,
  results: GateResult[],
  attempt = 1,
): Promise<"recorded" | "logged"> {
  for (const r of results) {
    console.log(JSON.stringify({ event: "quality.gate", projectId, scope, refId, attempt, gate: r.gate, outcome: r.outcome, findings: r.findings.map((f) => f.code) }));
  }
  if (tableMissing || !results.length) return "logged";
  try {
    await db.qualityGateResult.createMany({
      data: results.map((r) => ({ projectId, scope, refId, gate: r.gate, outcome: r.outcome, findings: r.findings, attempt })),
    });
    return "recorded";
  } catch (e) {
    if (isMissingTable(e)) {
      tableMissing = true;
      console.warn('{"event":"quality.gate","note":"quality_gate_results not migrated (0035); logging only until restart"}');
    } else {
      console.error(JSON.stringify({ event: "quality.gate", error: e instanceof Error ? e.message : String(e) }));
    }
    return "logged";
  }
}
