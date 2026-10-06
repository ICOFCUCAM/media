/**
 * RepairPlanner (docs/38 §AU.7, §AU.12): converts sync issues into a bounded
 * plan of specific repairs. It plans; the repair engine (Phase 9) executes.
 *
 * Rules
 *  - blockers first, then errors; warnings are planned only when they carry a
 *    cheap repair (no regeneration); info is never acted on
 *  - one action per shot: several regenerations of the same shot merge into
 *    one covering all of them (earliest start, longest tail); a regeneration
 *    supersedes a retime / hold / trim of the same shot
 *  - low confidence (< 0.6) is never repaired automatically → human review
 *  - a shot that has used its repair budget (policy.repair.maxAttempts) goes
 *    to human review instead of another attempt
 *  - regenerations reuse the same timeline version and need a fresh gateway
 *    authorization (§AX.5 rule 4) — the plan says so; it never substitutes a
 *    model or workflow
 */
import type { Us } from "../clock/time";
import type { SyncPolicy } from "./policy";
import type { RepairAction, Severity, SyncIssue } from "./types";

export interface PlannedRepair {
  action: RepairAction;
  /** Indexes into the issues array this action addresses. */
  issues: number[];
  automatic: boolean;
  /** Regenerations go back through the gateway for a new authorization. */
  requiresAuthorization: boolean;
  severity: Severity;
}

export interface RepairPlan {
  repairs: PlannedRepair[];
  humanReview: Array<{ issues: number[]; reason: string }>;
  untouched: number[];
}

const RANK: Record<Severity, number> = { blocker: 0, error: 1, warning: 2, info: 3 };
const REGEN = new Set(["regenerate_tail", "regenerate_shot"]);
const shotOf = (a: RepairAction): string | null => ("shotId" in a ? a.shotId : null);

export function planRepairs(issues: SyncIssue[], policy: SyncPolicy, attemptsByShot: Record<string, number> = {}): RepairPlan {
  const plan: RepairPlan = { repairs: [], humanReview: [], untouched: [] };
  const order = issues.map((_, i) => i).sort((a, b) => RANK[issues[a]!.severity] - RANK[issues[b]!.severity]);
  const byShot = new Map<string, PlannedRepair>();

  for (const i of order) {
    const issue = issues[i]!;
    const action = issue.repair;
    if (issue.severity === "info" || !action) {
      plan.untouched.push(i);
      continue;
    }
    if (action.kind === "human_review") {
      plan.humanReview.push({ issues: [i], reason: action.reason });
      continue;
    }
    if (issue.confidence < 0.6) {
      plan.humanReview.push({ issues: [i], reason: `low confidence (${issue.confidence}) — ${issue.message}` });
      continue;
    }
    if (issue.severity === "warning" && REGEN.has(action.kind)) {
      plan.untouched.push(i);
      continue;
    }
    const shot = shotOf(action);
    if (shot && REGEN.has(action.kind) && (attemptsByShot[shot] ?? 0) >= policy.repair.maxAttempts) {
      plan.humanReview.push({ issues: [i], reason: `shot ${shot} has used its ${policy.repair.maxAttempts} repair attempts` });
      continue;
    }
    const existing = shot ? byShot.get(shot) : undefined;
    if (!existing || !shot) {
      const p: PlannedRepair = { action, issues: [i], automatic: true, requiresAuthorization: REGEN.has(action.kind), severity: issue.severity };
      plan.repairs.push(p);
      if (shot) byShot.set(shot, p);
      continue;
    }
    existing.issues.push(i);
    existing.action = merge(existing.action, action);
    existing.requiresAuthorization = REGEN.has(existing.action.kind);
  }
  return plan;
}

function merge(a: RepairAction, b: RepairAction): RepairAction {
  const ra = REGEN.has(a.kind);
  const rb = REGEN.has(b.kind);
  if (ra && !rb) return a;
  if (rb && !ra) return b;
  if (a.kind === "regenerate_shot") return a;
  if (b.kind === "regenerate_shot") return b;
  if (a.kind === "regenerate_tail" && b.kind === "regenerate_tail") {
    const aEnd: Us = a.fromUs + a.durationUs;
    const bEnd: Us = b.fromUs + b.durationUs;
    const fromUs = a.fromUs < b.fromUs ? a.fromUs : b.fromUs;
    const end = aEnd > bEnd ? aEnd : bEnd;
    return { ...a, fromUs, durationUs: end - fromUs, constraint: a.constraint === "approved_dialogue_timing" || b.constraint === "approved_dialogue_timing" ? "approved_dialogue_timing" : a.constraint };
  }
  return a; // both cheap: the higher-severity one (seen first) wins
}
