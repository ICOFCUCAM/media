import { describe, expect, it } from "vitest";
import { shouldPauseForBudget } from "@cineforge/shared";
import { claimResumeRequests, DEFAULT_SHOT_GPU_MS, resumeEstimateMs, type ResumeDb, type ResumeProject } from "./resume";

const at = new Date("2026-10-10T10:00:00Z");
const paused: ResumeProject = { id: "p1", status: "PAUSED", estimatedMs: 400_000, spentMs: 664_000, resumeRequestedAt: at, user: { creditsMs: 5_000_000, tier: "PRO" } };

function fakeDb(rows: ResumeProject[], shots: { status: string; gpuMs: number | null }[]) {
  const state = new Map(rows.map((r) => [r.id, { ...r }]));
  const writes: Record<string, unknown>[] = [];
  const db: ResumeDb = {
    project: {
      findMany: async () => [...state.values()].filter((r) => r.resumeRequestedAt),
      updateMany: async ({ where, data }) => {
        const r = state.get(where.id as string);
        if (!r || r.resumeRequestedAt !== where.resumeRequestedAt) return { count: 0 };
        if (where.status && r.status !== where.status) return { count: 0 };
        Object.assign(r, data);
        writes.push({ id: r.id, ...data });
        return { count: 1 };
      },
    },
    shot: { findMany: async () => shots },
  };
  return { db, writes, state };
}

describe("resume a paused production (W23)", () => {
  it("re-estimates from the finished shots: spent + pending × their average", () => {
    expect(resumeEstimateMs({ estimatedMs: 400_000, spentMs: 664_000, readyGpuMs: [330_000, 334_000], pendingShots: 3 })).toBe(664_000 + 3 * 332_000);
    // No finished shot yet: a full-length shot's default.
    expect(resumeEstimateMs({ estimatedMs: null, spentMs: 0, readyGpuMs: [], pendingShots: 2 })).toBe(2 * DEFAULT_SHOT_GPU_MS);
    // Never lowers the estimate.
    expect(resumeEstimateMs({ estimatedMs: 9_000_000, spentMs: 10, readyGpuMs: [1000], pendingShots: 1 })).toBe(9_000_000);
  });

  it("the new estimate does not pause again at once, and leaves room for the pending shots", () => {
    const e = resumeEstimateMs({ estimatedMs: 400_000, spentMs: 664_000, readyGpuMs: [332_000, 332_000], pendingShots: 3 });
    expect(shouldPauseForBudget(e, 664_000)).toBe(false);
    expect(shouldPauseForBudget(e, 664_000 + 3 * 332_000)).toBe(false);
  });

  it("claims a request on a paused film: GENERATING, new estimate, request cleared, resume job enqueued", async () => {
    const { db, state } = fakeDb([paused], [{ status: "READY", gpuMs: 332_000 }, { status: "READY", gpuMs: 332_000 }, { status: "FAILED", gpuMs: null }, { status: "QUEUED", gpuMs: null }]);
    const queued: string[] = [];
    const out = await claimResumeRequests(db, async (id) => { queued.push(id); });
    expect(out).toEqual([{ id: "p1", outcome: "resumed", estimatedMs: 664_000 + 2 * 332_000 }]);
    expect(queued).toEqual(["p1"]);
    const p = state.get("p1")!;
    expect(p.status).toBe("GENERATING");
    expect(p.resumeRequestedAt).toBeNull();
    expect((p as unknown as { errorMessage: unknown }).errorMessage).toBeNull();
  });

  it("a film that is not paused or failed: the request is cleared, nothing runs", async () => {
    const { db, state } = fakeDb([{ ...paused, status: "READY" }], [{ status: "READY", gpuMs: 1 }]);
    const queued: string[] = [];
    expect(await claimResumeRequests(db, async (id) => { queued.push(id); })).toEqual([{ id: "p1", outcome: "not_paused" }]);
    expect(queued).toEqual([]);
    expect(state.get("p1")!.resumeRequestedAt).toBeNull();
    expect(state.get("p1")!.status).toBe("READY");
  });

  it("a failed film never planned is not resumed", async () => {
    const { db } = fakeDb([{ ...paused, status: "FAILED" }], []);
    expect(await claimResumeRequests(db, async () => {})).toEqual([{ id: "p1", outcome: "not_planned" }]);
  });

  it("no credits: stays paused with the reason; enterprise is not gated", async () => {
    const broke = fakeDb([{ ...paused, user: { creditsMs: 0, tier: "PRO" } }], [{ status: "QUEUED", gpuMs: null }]);
    expect(await claimResumeRequests(broke.db, async () => {})).toEqual([{ id: "p1", outcome: "no_credits" }]);
    expect(broke.state.get("p1")!.status).toBe("PAUSED");
    expect((broke.state.get("p1") as unknown as { errorMessage: string }).errorMessage).toContain("top up");
    const ent = fakeDb([{ ...paused, user: { creditsMs: 0, tier: "ENTERPRISE" } }], [{ status: "QUEUED", gpuMs: null }]);
    expect((await claimResumeRequests(ent.db, async () => {}))[0]!.outcome).toBe("resumed");
  });

  it("a second worker loses the claim and enqueues nothing", async () => {
    const { db, state } = fakeDb([paused], [{ status: "QUEUED", gpuMs: null }]);
    const real = db.project.findMany;
    db.project.findMany = async (a) => {
      const rows = (await real(a)).map((r) => ({ ...r }));
      state.get("p1")!.resumeRequestedAt = new Date(at.getTime() + 1); // the other worker claimed, the owner asked again
      return rows;
    };
    const queued: string[] = [];
    expect(await claimResumeRequests(db, async (id) => { queued.push(id); })).toEqual([{ id: "p1", outcome: "lost_claim" }]);
    expect(queued).toEqual([]);
  });
});
