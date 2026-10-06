import { describe, expect, it } from "vitest";
import { syncPolicy } from "./policy";
import { planRepairs } from "./repair-planner";
import type { SyncIssue } from "./types";

const base = { atUs: 0n, measured: {}, expected: {}, message: "m" };
const policy = syncPolicy("cinematic");

describe("RepairPlanner", () => {
  it("merges repairs per shot, blockers first; a regeneration supersedes a retime", () => {
    const issues: SyncIssue[] = [
      { ...base, check: "duration", severity: "warning", confidence: 1, repair: { kind: "retime_clip", shotId: "17", ratio: 1.01, toDurationUs: 5_000_000n } },
      { ...base, check: "dialogue_alignment", severity: "blocker", confidence: 0.9, repair: { kind: "regenerate_tail", shotId: "17", fromUs: 3_000_000n, durationUs: 2_000_000n, constraint: "approved_dialogue_timing" } },
      { ...base, check: "dialogue_alignment", severity: "error", confidence: 0.9, repair: { kind: "regenerate_tail", shotId: "17", fromUs: 1_420_000n, durationUs: 1_000_000n, constraint: "approved_duration" } },
      { ...base, check: "loudness", severity: "warning", confidence: 1, repair: { kind: "normalize_loudness", targetLufs: -16, truePeakDbtp: -1 } },
      { ...base, check: "frame_rate", severity: "info", confidence: 1 },
    ];
    const plan = planRepairs(issues, policy);
    expect(plan.repairs).toHaveLength(2);
    expect(plan.repairs[0]).toMatchObject({
      issues: [1, 2, 0], requiresAuthorization: true, severity: "blocker",
      action: { kind: "regenerate_tail", shotId: "17", fromUs: 1_420_000n, durationUs: 3_580_000n, constraint: "approved_dialogue_timing" },
    });
    expect(plan.repairs[1]!.action.kind).toBe("normalize_loudness");
    expect(plan.untouched).toEqual([4]);
  });

  it("low confidence and exhausted budgets go to a person, not another attempt", () => {
    const issues: SyncIssue[] = [
      { ...base, check: "lip_sync", severity: "error", confidence: 0.4, repair: { kind: "regenerate_shot", shotId: "3", durationUs: 1n, reason: "x" } },
      { ...base, check: "duration", severity: "blocker", confidence: 1, repair: { kind: "regenerate_shot", shotId: "4", durationUs: 1n, reason: "x" } },
      { ...base, check: "provenance", severity: "error", confidence: 1, repair: { kind: "human_review", reason: "unknown model" } },
    ];
    const plan = planRepairs(issues, policy, { "4": 3 });
    expect(plan.repairs).toEqual([]);
    expect(plan.humanReview.map((h) => h.reason)).toEqual(["shot 4 has used its 3 repair attempts", "low confidence (0.4) — m", "unknown model"]);
  });

  it("warnings never trigger a regeneration on their own", () => {
    const plan = planRepairs([{ ...base, check: "duration", severity: "warning", confidence: 1, repair: { kind: "regenerate_shot", shotId: "1", durationUs: 1n, reason: "x" } }], policy);
    expect(plan.repairs).toEqual([]);
    expect(plan.untouched).toEqual([0]);
  });
});
