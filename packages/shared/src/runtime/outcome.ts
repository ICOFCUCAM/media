/**
 * Runtime outcome classification (docs/38 §AV.5, §AX.5 rule 3). Cineforge —
 * never the runtime — evaluates a result's timing report against the Master
 * Production Clock request and the production's SyncPolicy, and assigns
 * exactly one outcome:
 *
 *   ACCEPTED               within tolerance → place the media version
 *   REQUIRES_REPAIR        out of tolerance, a safe repair exists (trim the
 *                          tail from allowed handles, retime within the
 *                          ratio limit, hold the last frame briefly)
 *   REQUIRES_REGENERATION  out of tolerance, no safe repair
 *   FAILED                 invalid result (no/invalid report, a report for a
 *                          different request, wrong frame rate without a
 *                          permitted conform) or repair budget exhausted
 *
 * The generated clip never redefines the production duration.
 */
import { sameRate, type FrameRate } from "../clock/rational";
import type { Us } from "../clock/time";
import { policyRef, type SyncPolicy } from "../sync/policy";
import { parseVideoTimingReport, type ConformApplied, type VideoTimingReport } from "./timing";

export type RuntimeOutcome = "ACCEPTED" | "REQUIRES_REPAIR" | "REQUIRES_REGENERATION" | "FAILED";

export type OutcomeCode =
  | "WITHIN_TOLERANCE"
  | "TIMING_REPORT_MISSING"
  | "TIMING_REPORT_INVALID"
  | "TIMING_REPORT_MISMATCH"
  | "FRAME_RATE_MISMATCH"
  | "UNPERMITTED_CONFORM"
  | "DURATION_OUT_OF_TOLERANCE"
  | "REPAIR_BUDGET_EXHAUSTED";

export type TimingRepair =
  | { kind: "trim_tail"; removeUs: Us }
  | { kind: "retime"; ratio: number; toDurationUs: Us }
  | { kind: "hold_last_frame"; addUs: Us };

/** What Cineforge asked the runtime for (from the timeline, not the model). */
export interface VideoTimingRequest {
  durationUs: Us;
  fps: FrameRate;
  /** Conform operations the request allowed the runtime to apply. Default: none. */
  allowedConform?: ConformApplied[];
  /** Tail the plan allows to be trimmed (handles); capped by policy.repair.maxTrimUs. */
  trimHandleUs?: Us;
}

export interface OutcomeDecision {
  outcome: RuntimeOutcome;
  code: OutcomeCode;
  message: string;
  policy: string;
  attempt: number;
  requestedDurationUs: Us;
  actualDurationUs: Us | null;
  deltaUs: Us | null;
  ratio: number | null;
  repair?: TimingRepair;
  report?: VideoTimingReport;
}

const abs = (x: bigint) => (x < 0n ? -x : x);
const minBig = (a: bigint, b: bigint) => (a < b ? a : b);

export function classifyVideoResult(input: {
  /** The runtime's `timing` JSON as received (or an already parsed report). */
  timing: unknown;
  request: VideoTimingRequest;
  policy: SyncPolicy;
  /** 1 for the first generation of this shot. */
  attempt?: number;
}): OutcomeDecision {
  const { request, policy } = input;
  const attempt = input.attempt ?? 1;
  const base = { policy: policyRef(policy), attempt, requestedDurationUs: request.durationUs };
  const fail = (code: OutcomeCode, message: string, report?: VideoTimingReport): OutcomeDecision => ({
    ...base,
    outcome: "FAILED",
    code,
    message,
    actualDurationUs: report?.actualDurationUs ?? null,
    deltaUs: report ? report.actualDurationUs - request.durationUs : null,
    ratio: report ? Number(report.actualDurationUs) / Number(request.durationUs) : null,
    ...(report ? { report } : {}),
  });

  const parsed = isParsed(input.timing) ? { ok: true as const, report: input.timing } : parseVideoTimingReport(input.timing);
  if (!parsed.ok) return fail(parsed.code, parsed.message);
  const r = parsed.report;

  if (r.requestedDurationUs !== request.durationUs || !sameRate(r.requestedFrameRate, request.fps)) {
    return fail("TIMING_REPORT_MISMATCH", "the timing report describes a different request", r);
  }
  const allowed = request.allowedConform ?? [];
  if (r.conformApplied !== "none" && !allowed.includes(r.conformApplied)) {
    return fail("UNPERMITTED_CONFORM", `the runtime applied '${r.conformApplied}' without permission`, r);
  }
  if (!sameRate(r.frameRate, request.fps) && r.conformApplied === "none") {
    return fail("FRAME_RATE_MISMATCH", `produced ${r.frameRate.num}/${r.frameRate.den}, requested ${request.fps.num}/${request.fps.den}`, r);
  }

  const delta = r.actualDurationUs - request.durationUs;
  const ratio = Number(r.actualDurationUs) / Number(request.durationUs);
  const measured = { actualDurationUs: r.actualDurationUs, deltaUs: delta, ratio, report: r };
  const tol = policy.tolerances.durationUs;
  if (abs(delta) <= tol) {
    return { ...base, ...measured, outcome: "ACCEPTED", code: "WITHIN_TOLERANCE", message: `within ±${tol} µs` };
  }
  if (attempt >= policy.repair.maxAttempts) {
    return { ...base, ...measured, outcome: "FAILED", code: "REPAIR_BUDGET_EXHAUSTED", message: `attempt ${attempt} of ${policy.repair.maxAttempts} still out of tolerance` };
  }

  const repair = chooseRepair(delta, ratio, request, policy);
  const what = `${delta > 0n ? "long" : "short"} by ${abs(delta)} µs (${(ratio * 100).toFixed(2)} % of requested)`;
  if (repair) {
    return { ...base, ...measured, outcome: "REQUIRES_REPAIR", code: "DURATION_OUT_OF_TOLERANCE", message: `${what}; repair: ${repair.kind}`, repair };
  }
  return { ...base, ...measured, outcome: "REQUIRES_REGENERATION", code: "DURATION_OUT_OF_TOLERANCE", message: `${what}; no safe repair within ${policyRef(policy)}` };
}

/** The safe repair for a duration deviation, if one exists (shared with the A/V sync engine). */
export function chooseRepair(delta: Us, ratio: number, req: Pick<VideoTimingRequest, "durationUs" | "trimHandleUs">, policy: SyncPolicy): TimingRepair | undefined {
  const { maxRetimeRatio, maxTrimUs, maxHoldUs } = policy.repair;
  const retimeOk = Math.abs(1 - ratio) <= maxRetimeRatio;
  if (delta > 0n) {
    // Too long: trimming planned handles loses nothing the plan needed.
    const trimLimit = minBig(maxTrimUs, req.trimHandleUs ?? 0n);
    if (delta <= trimLimit) return { kind: "trim_tail", removeUs: delta };
    if (retimeOk) return { kind: "retime", ratio: 1 / ratio, toDurationUs: req.durationUs };
    return undefined;
  }
  // Too short: a small speed change keeps motion continuous; a brief hold is the fallback.
  if (retimeOk) return { kind: "retime", ratio: 1 / ratio, toDurationUs: req.durationUs };
  if (-delta <= maxHoldUs) return { kind: "hold_last_frame", addUs: -delta };
  return undefined;
}

function isParsed(t: unknown): t is VideoTimingReport {
  return typeof t === "object" && t !== null && typeof (t as VideoTimingReport).actualDurationUs === "bigint";
}
