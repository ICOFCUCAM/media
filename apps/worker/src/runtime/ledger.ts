/**
 * The video generation ledger (migration 0029, docs/38 §AU.16 / §AV.5): one
 * row per GPU attempt with what Cineforge asked for, the runtime's timing
 * report as received and Cineforge's classification.
 *
 * Best effort by design: the ledger records production, it must never break
 * it. A missing table (migration not applied yet) is noted once; any other
 * write error is logged and the shot carries on.
 */
import { createHash } from "node:crypto";
import { canonicalJson, type ShotRequest, type ShotResult } from "@cineforge/model-adapters";
import { frameRate, secondsToUs } from "@cineforge/shared";
import { isMissingTable } from "../timeline/store";
import { NATIVE_FPS, timingSummary, type TimingGateResult } from "./timing-gate";

export interface LedgerDb {
  videoGeneration: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

let tablesMissing = false;

/** sha256 of the request as sent (minus the job context) — provenance key. */
export function requestSha256(request: ShotRequest): string {
  const { job: _job, ...payload } = request;
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function videoGenerationRow(input: {
  projectId: string;
  shotId: string;
  modelId: string;
  modelVersion?: string | null;
  request: ShotRequest;
  result: ShotResult;
  gate: TimingGateResult;
}): Record<string, unknown> {
  const { request, result, gate } = input;
  const fps = frameRate(request.fps ?? NATIVE_FPS[input.modelId] ?? 24);
  const d = gate.decision;
  return {
    projectId: input.projectId,
    shotId: input.shotId,
    attempt: d.attempt,
    modelId: input.modelId,
    modelVersion: input.modelVersion ?? null,
    runtime: "diffusers",
    workflowId: "cineforge.video-shot",
    workflowVersion: 1,
    graphSha256: requestSha256(request),
    requestedDurationUs: secondsToUs(request.durationSec),
    requestedFpsNum: fps.num,
    requestedFpsDen: fps.den,
    timingConstraints: { allowedConform: [], mode: gate.mode },
    timingReport: (result.timing ?? null) as object | null,
    actualDurationUs: d.actualDurationUs,
    outcome: d.outcome,
    outcomeCode: d.code,
    policy: d.policy,
    decision: timingSummary(gate),
    gpuMs: result.gpuMs,
  };
}

export async function recordVideoGeneration(db: LedgerDb, row: Record<string, unknown>): Promise<"recorded" | "skipped" | "error"> {
  if (tablesMissing) return "skipped";
  try {
    await db.videoGeneration.create({ data: row });
    return "recorded";
  } catch (e) {
    if (isMissingTable(e)) {
      tablesMissing = true;
      console.warn('{"event":"runtime.ledger","note":"video_generations not migrated (0029); ledger off until restart"}');
      return "skipped";
    }
    console.warn(JSON.stringify({ event: "runtime.ledger", error: e instanceof Error ? e.message : String(e) }));
    return "error";
  }
}

/** Test hook. */
export function _resetLedgerState(): void {
  tablesMissing = false;
}
