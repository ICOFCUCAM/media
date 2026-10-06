/**
 * The shot timing gate (docs/38 §AV.5, Phase 3): after a GPU generation,
 * Cineforge — not the runtime — classifies the measured result against what
 * it asked for.
 *
 *   RUNTIME_TIMING_POLICY=record   (default) classify and log every result;
 *                                  never blocks. Like the gateway's report
 *                                  mode, this makes mismatches visible first:
 *                                  today's Wan frame cap (WAN_MAX_FRAMES=25)
 *                                  turns every 5 s request into 1.56 s.
 *   RUNTIME_TIMING_POLICY=enforce  REQUIRES_REGENERATION → the job retries;
 *                                  FAILED → the shot fails (no retry);
 *                                  REQUIRES_REPAIR → kept, repair recorded for
 *                                  the repair engine (Phase 9).
 *
 * RUNTIME_SYNC_PROFILE selects the tolerance profile (default cinematic).
 */
import {
  classifyVideoResult,
  frameRate,
  secondsToUs,
  syncPolicy,
  usToJson,
  type OutcomeDecision,
  type SyncPolicy,
} from "@cineforge/shared";
import type { ShotRequest, ShotResult } from "@cineforge/model-adapters";

export type TimingPolicyMode = "record" | "enforce";

/** The rate each self-hosted adapter sends when the request names none. */
export const NATIVE_FPS: Record<string, number> = { "wan-2.1": 16, hunyuan: 24 };

export function timingPolicyMode(env: NodeJS.ProcessEnv = process.env): TimingPolicyMode {
  const v = (env.RUNTIME_TIMING_POLICY ?? "record").trim().toLowerCase();
  if (v !== "record" && v !== "enforce") {
    // An unknown value must never silently mean "no checks" or "block everything".
    throw new Error(`RUNTIME_TIMING_POLICY must be record or enforce, got ${JSON.stringify(v)}`);
  }
  return v;
}

export function timingProfile(env: NodeJS.ProcessEnv = process.env): SyncPolicy {
  return syncPolicy(env.RUNTIME_SYNC_PROFILE?.trim() || "cinematic");
}

export interface TimingGateResult {
  decision: OutcomeDecision;
  action: "accept" | "retry" | "fail";
  mode: TimingPolicyMode;
}

export function gateShotTiming(input: {
  modelId: string;
  request: Pick<ShotRequest, "durationSec" | "fps">;
  result: Pick<ShotResult, "timing">;
  attempt: number;
  mode?: TimingPolicyMode;
  policy?: SyncPolicy;
}): TimingGateResult {
  const mode = input.mode ?? timingPolicyMode();
  const policy = input.policy ?? timingProfile();
  const fps = input.request.fps ?? NATIVE_FPS[input.modelId] ?? 24;
  const decision = classifyVideoResult({
    timing: input.result.timing,
    request: { durationUs: secondsToUs(input.request.durationSec), fps: frameRate(fps) },
    policy,
    attempt: input.attempt,
  });
  let action: TimingGateResult["action"] = "accept";
  if (mode === "enforce") {
    if (decision.outcome === "REQUIRES_REGENERATION") action = "retry";
    if (decision.outcome === "FAILED") action = "fail";
  }
  return { decision, action, mode };
}

/** JSON-safe summary for logs and provenance (bigint → string). */
export function timingSummary(g: TimingGateResult): Record<string, unknown> {
  const d = g.decision;
  return {
    mode: g.mode,
    action: g.action,
    outcome: d.outcome,
    code: d.code,
    policy: d.policy,
    attempt: d.attempt,
    requestedDurationUs: usToJson(d.requestedDurationUs),
    actualDurationUs: d.actualDurationUs === null ? null : usToJson(d.actualDurationUs),
    deltaUs: d.deltaUs === null ? null : usToJson(d.deltaUs),
    ratio: d.ratio === null ? null : Number(d.ratio.toFixed(6)),
    repair: d.repair ? JSON.parse(JSON.stringify(d.repair, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) : null,
    message: d.message,
  };
}
