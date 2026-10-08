/**
 * Records the gaps a production ran with (DirectorOS DOS-75; migration 0031).
 *
 * Every degradation is logged as a JSON event AND written to
 * `production_degradations`, where the project owner sees it. Until 0031 is
 * applied the table write is skipped with one log line, but the event log still
 * carries every gap — nothing is dropped silently.
 */
import type { Degradation } from "@cineforge/shared";
import { isMissingTable } from "../timeline/store";

export interface DegradationDb {
  productionDegradation: { createMany(args: { data: Record<string, unknown>[] }): Promise<unknown> };
}

let tableMissing = false;

export async function recordDegradations(
  db: DegradationDb,
  projectId: string,
  degradations: Degradation[],
): Promise<"recorded" | "logged" | "none"> {
  if (!degradations.length) return "none";
  for (const d of degradations) {
    console.warn(JSON.stringify({ event: "production.degradation", projectId, ...d }));
  }
  if (tableMissing) return "logged";
  try {
    await db.productionDegradation.createMany({
      data: degradations.map((d) => ({
        projectId,
        code: d.code,
        severity: d.severity,
        scope: d.scope,
        refId: d.refId ?? null,
        message: d.message.slice(0, 500),
        detail: d.detail ?? undefined,
      })),
    });
    return "recorded";
  } catch (e) {
    if (isMissingTable(e)) {
      tableMissing = true;
      console.warn('{"event":"production.degradation","note":"production_degradations not migrated (0031); logging only until restart"}');
      return "logged";
    }
    console.error(JSON.stringify({ event: "production.degradation", error: e instanceof Error ? e.message : String(e) }));
    return "logged";
  }
}

/** Test hook. */
export function _resetRecorderState(): void {
  tableMissing = false;
}
