import { describe, expect, it } from "vitest";
import type { AVSyncReport, RepairPlan } from "@cineforge/shared";
import { saveSyncAnalysis, type AvSyncDb } from "./store";

const SHOT = "11111111-1111-4111-8111-111111111111";
const report: AVSyncReport = {
  timelineVersionId: "t1", policy: "cinematic@1", checks: ["duration", "provenance"], passed: false, toolVersions: { engine: "cineforge.avsync@1" },
  issues: [
    { check: "duration", severity: "blocker", shotId: SHOT, eventId: `shot:${SHOT}`, atUs: 0n, spanUs: 3_437_500n, measured: { durationUs: 1_562_500 }, expected: { durationUs: 5_000_000 }, confidence: 1, message: "short",
      repair: { kind: "regenerate_shot", shotId: SHOT, durationUs: 5_000_000n, reason: "short" } },
    { check: "provenance", severity: "error", eventId: "shot:x", atUs: 0n, measured: {}, expected: {}, confidence: 1, message: "untraceable" },
  ],
};
const plan: RepairPlan = {
  repairs: [{ action: report.issues[0]!.repair!, issues: [0], automatic: true, requiresAuthorization: true, severity: "blocker" }],
  humanReview: [{ issues: [1], reason: "untraceable" }],
  untouched: [],
};

function fake(missing = false) {
  const rows: Record<string, Array<Record<string, unknown>>> = { report: [], issue: [], job: [] };
  const db: AvSyncDb = {
    avSyncReport: { create: async ({ data }) => { if (missing) throw Object.assign(new Error("x"), { code: "P2021" }); rows.report!.push(data); } },
    avSyncIssue: { createMany: async ({ data }) => { rows.issue!.push(...data); } },
    repairJob: { createMany: async ({ data }) => { rows.job!.push(...data); } },
    $transaction: (fn) => fn(db),
  };
  return { db, rows };
}

describe("sync analysis store", () => {
  it("writes the report, its issues and one planned job per automatic repair", async () => {
    const { db, rows } = fake();
    const r = await saveSyncAnalysis(db, report, plan, { shotIds: [SHOT] });
    expect(r).toMatchObject({ saved: true, issues: 2, repairJobs: 1 });
    expect(rows.report![0]).toMatchObject({ timelineVersionId: "t1", passed: false, policy: "cinematic@1", scope: { shotIds: [SHOT] } });
    expect(rows.issue![0]).toMatchObject({ check: "duration", shotId: SHOT, atUs: 0n, expected: { durationUs: 5_000_000, eventKey: `shot:${SHOT}` } });
    expect(rows.issue![1]!.shotId).toBeNull();
    expect(rows.job![0]).toEqual({ issueId: rows.issue![0]!.id, action: { kind: "regenerate_shot", shotId: SHOT, durationUs: "5000000", reason: "short" }, status: "planned", attempt: 1 });
  });

  it("reports missing tables instead of failing", async () => {
    expect(await saveSyncAnalysis(fake(true).db, report, plan)).toEqual({ saved: false, reason: "TABLES_MISSING" });
  });
});
