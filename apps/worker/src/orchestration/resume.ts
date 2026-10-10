/**
 * Resume a paused production (W23; docs/24 §C8, migration 0055). The video
 * worker pauses a film whose spend passes its budget ceiling; the owner then
 * presses Resume, which only sets `projects.resume_requested_at`. The poller
 * claims the request here, raises the estimate to cover what is left —
 * measured from the shots already made, not guessed — and re-enqueues the
 * film's "resume" job: finished shots cost nothing, the rest generate.
 */
import { DEFAULT_BUDGET_MARGIN } from "@cineforge/shared";

/** GPU time a shot costs when none has finished yet (a full-length Wan shot, ms). */
export const DEFAULT_SHOT_GPU_MS = 330_000;

/**
 * The new estimate (pure): what is spent plus what the pending shots will
 * cost at the average of the finished ones. Never lower than the old one.
 */
export function resumeEstimateMs(a: { estimatedMs: number | null; spentMs: number; readyGpuMs: number[]; pendingShots: number }): number {
  const done = a.readyGpuMs.filter((n) => n > 0);
  const perShot = done.length ? done.reduce((s, n) => s + n, 0) / done.length : DEFAULT_SHOT_GPU_MS;
  const needed = Math.ceil(a.spentMs + a.pendingShots * perShot);
  return Math.max(a.estimatedMs ?? 0, needed);
}

export interface ResumeProject {
  id: string;
  status: string;
  estimatedMs: number | null;
  spentMs: number;
  resumeRequestedAt: Date | null;
  user: { creditsMs: number; tier: string };
}

export interface ResumeDb {
  project: {
    findMany(a: unknown): Promise<ResumeProject[]>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  shot: { findMany(a: unknown): Promise<{ status: string; gpuMs: number | null }[]> };
}

export type ResumeOutcome = "resumed" | "not_paused" | "not_planned" | "no_credits" | "lost_claim";

/** One poller tick: answer every resume request (a few at a time). */
export async function claimResumeRequests(
  db: ResumeDb,
  enqueue: (projectId: string) => Promise<void>,
): Promise<{ id: string; outcome: ResumeOutcome; estimatedMs?: number }[]> {
  const asked = await db.project.findMany({
    where: { resumeRequestedAt: { not: null } }, take: 5,
    select: { id: true, status: true, estimatedMs: true, spentMs: true, resumeRequestedAt: true, user: { select: { creditsMs: true, tier: true } } },
  });
  const out: { id: string; outcome: ResumeOutcome; estimatedMs?: number }[] = [];
  for (const p of asked) {
    // The claim clears the request; a request made again later is a new one.
    const clear = { id: p.id, resumeRequestedAt: p.resumeRequestedAt };
    if (p.status !== "PAUSED" && p.status !== "FAILED") {
      await db.project.updateMany({ where: clear, data: { resumeRequestedAt: null } });
      out.push({ id: p.id, outcome: "not_paused" });
      continue;
    }
    const shots = await db.shot.findMany({ where: { scene: { projectId: p.id } }, select: { status: true, gpuMs: true } });
    if (!shots.length) {
      // Never planned: there is nothing to resume, the owner starts it again.
      await db.project.updateMany({ where: clear, data: { resumeRequestedAt: null } });
      out.push({ id: p.id, outcome: "not_planned" });
      continue;
    }
    if (p.user.tier !== "ENTERPRISE" && p.user.creditsMs <= 0) {
      await db.project.updateMany({ where: clear, data: { resumeRequestedAt: null, errorMessage: "Out of credits — top up to resume" } });
      out.push({ id: p.id, outcome: "no_credits" });
      continue;
    }
    const estimatedMs = resumeEstimateMs({
      estimatedMs: p.estimatedMs, spentMs: p.spentMs,
      readyGpuMs: shots.filter((s) => s.status === "READY").map((s) => s.gpuMs ?? 0),
      pendingShots: shots.filter((s) => s.status !== "READY").length,
    });
    const claimed = await db.project.updateMany({
      where: { ...clear, status: p.status },
      data: { resumeRequestedAt: null, status: "GENERATING", estimatedMs, errorMessage: null },
    });
    if (claimed.count !== 1) {
      out.push({ id: p.id, outcome: "lost_claim" });
      continue;
    }
    await enqueue(p.id);
    out.push({ id: p.id, outcome: "resumed", estimatedMs });
  }
  return out;
}

/** The ceiling the new estimate gives (for the log line). */
export const resumeCeilingMs = (estimatedMs: number) => Math.round(estimatedMs * DEFAULT_BUDGET_MARGIN);
