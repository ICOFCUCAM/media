/**
 * Persist A/V sync analyses (migration 0030): one av_sync_reports row, its
 * av_sync_issues, and a 'planned' repair_jobs row per automatic repair in the
 * plan. The repair engine (Phase 9) executes planned jobs; nothing here
 * changes media. Missing tables → { saved: false, reason: "TABLES_MISSING" }.
 */
import { randomUUID } from "node:crypto";
import type { AVSyncReport, RepairAction, RepairPlan } from "@cineforge/shared";
import { isMissingTable } from "../timeline/store";

export interface AvSyncDb {
  avSyncReport: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  avSyncIssue: { createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown> };
  repairJob: { createMany(args: { data: Array<Record<string, unknown>> }): Promise<unknown> };
  $transaction<T>(fn: (tx: AvSyncDb) => Promise<T>): Promise<T>;
}

/** bigint → string so actions fit jsonb. */
export function jsonSafe<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
}

export type SaveSyncResult = { saved: true; reportId: string; issues: number; repairJobs: number } | { saved: false; reason: "TABLES_MISSING" };

export async function saveSyncAnalysis(db: AvSyncDb, report: AVSyncReport, plan: RepairPlan, scope: Record<string, unknown> = {}): Promise<SaveSyncResult> {
  const reportId = randomUUID();
  const issueIds = report.issues.map(() => randomUUID());
  try {
    return await db.$transaction(async (tx) => {
      await tx.avSyncReport.create({
        data: { id: reportId, timelineVersionId: report.timelineVersionId, scope, checks: report.checks, passed: report.passed, policy: report.policy, toolVersions: report.toolVersions },
      });
      if (report.issues.length) {
        await tx.avSyncIssue.createMany({
          data: report.issues.map((i, n) => ({
            id: issueIds[n],
            reportId,
            check: i.check,
            severity: i.severity,
            sceneId: uuidOrNull(i.sceneId),
            shotId: uuidOrNull(i.shotId),
            eventId: null,
            atUs: i.atUs,
            spanUs: i.spanUs ?? null,
            measured: i.measured,
            expected: { ...i.expected, ...(i.eventId ? { eventKey: i.eventId } : {}) },
            confidence: i.confidence,
            message: i.message,
          })),
        });
      }
      const jobs = plan.repairs.filter((r) => r.automatic).map((r) => ({
        issueId: issueIds[r.issues[0]!],
        action: jsonSafe<RepairAction>(r.action) as object,
        status: "planned",
        attempt: 1,
      }));
      if (jobs.length) await tx.repairJob.createMany({ data: jobs });
      return { saved: true as const, reportId, issues: report.issues.length, repairJobs: jobs.length };
    });
  } catch (e) {
    if (isMissingTable(e)) return { saved: false, reason: "TABLES_MISSING" };
    throw e;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOrNull(v: string | undefined): string | null {
  return v && UUID.test(v) ? v : null;
}
