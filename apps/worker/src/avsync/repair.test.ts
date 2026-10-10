import { describe, expect, it } from "vitest";
import { executeRepairs, repairClipArgs, repairDecision, repairMode, type RepairDb, type RepairJobRow } from "./repair";

describe("repair engine (W27)", () => {
  it("mode comes from SYNC_REPAIR and defaults to off", () => {
    expect(repairMode({})).toBe("off");
    expect(repairMode({ SYNC_REPAIR: "clips" })).toBe("clips");
    expect(repairMode({ SYNC_REPAIR: "ALL" })).toBe("all");
    expect(repairMode({ SYNC_REPAIR: "yes" })).toBe("off");
  });

  it("builds clip repairs: retime to the slot, hold, trim, conform", () => {
    const r = repairClipArgs({ kind: "retime_clip", shotId: "s", ratio: 1.02, toDurationUs: 5_000_000n }, "in", "out", 5.1);
    expect(r).toContain(`setpts=${(1 / 1.02).toFixed(6)}*PTS`);
    expect(r[r.indexOf("-t") + 1]).toBe("5.000");
    expect(repairClipArgs({ kind: "hold_last_frame", shotId: "s", addUs: 250_000n }, "in", "out", 4).join(" ")).toContain("tpad=stop_mode=clone:stop_duration=0.250");
    const t = repairClipArgs({ kind: "trim_tail", shotId: "s", removeUs: 400_000n }, "in", "out", 5.4);
    expect(t[t.indexOf("-t") + 1]).toBe("5.000");
    expect(repairClipArgs({ kind: "conform_frame_rate", mediaVersionId: "m", toFps: "24000/1001" }, "in", "out", 5).join(" ")).toContain("fps=24000/1001");
    expect(() => repairClipArgs({ kind: "trim_tail", shotId: "s", removeUs: 9_000_000n }, "in", "out", 5)).toThrow(/leaves nothing/);
    expect(() => repairClipArgs({ kind: "conform_frame_rate", mediaVersionId: "m", toFps: "24;rm" }, "in", "out", 5)).toThrow(/invalid/);
    expect(r).toContain("-an");
  });

  it("decides per action and mode", () => {
    const hold = { kind: "hold_last_frame", shotId: "s", addUs: 1n } as const;
    const regen = { kind: "regenerate_shot", shotId: "s", durationUs: 1n, reason: "x" } as const;
    expect(repairDecision(hold, "off", 0, 1)).toMatchObject({ skip: "wait" });
    expect(repairDecision(hold, "clips", 0, 1)).toEqual({ run: "clip" });
    expect(repairDecision(regen, "clips", 0, 1)).toMatchObject({ skip: "wait" });
    expect(repairDecision(regen, "all", 0, 1)).toEqual({ run: "regenerate" });
    expect(repairDecision(regen, "all", 1, 1)).toMatchObject({ skip: "cancel" });
    expect(repairDecision({ kind: "normalize_loudness", targetLufs: -16, truePeakDbtp: -1 }, "all", 0, 1)).toMatchObject({ skip: "cancel" });
    expect(repairDecision({ kind: "shift_audio", eventId: "e", byUs: 1n }, "all", 0, 1)).toMatchObject({ skip: "cancel", reason: expect.stringContaining("owner") });
  });

  function fake(jobs: RepairJobRow[], shots: Record<string, string | null>, priorRegens = 0) {
    const state = new Map(jobs.map((j) => [j.id, { ...j } as RepairJobRow & Record<string, unknown>]));
    const issues = new Map([["i1", { id: "i1", shotId: "s1", status: "open" }], ["i2", { id: "i2", shotId: "s2", status: "open" }], ["i3", { id: "i3", shotId: null, status: "open" }]]);
    const shotRows = new Map(Object.entries(shots).map(([id, videoKey]) => [id, { id, videoKey, status: "READY" } as Record<string, unknown>]));
    const db: RepairDb = {
      avSyncIssue: {
        findMany: async () => [...issues.values()].map((i) => ({ id: i.id, shotId: i.shotId })),
        updateMany: async ({ where, data }) => {
          const i = issues.get(where.id as string)!;
          if (!(where.status as { in: string[] }).in.includes(i.status)) return { count: 0 };
          Object.assign(i, data); return { count: 1 };
        },
      },
      repairJob: {
        findMany: async () => [...state.values()].filter((j) => j.status === "planned"),
        count: async () => priorRegens,
        updateMany: async ({ where, data }) => {
          const j = state.get(where.id as string)!;
          const allowed = typeof where.status === "string" ? [where.status] : (where.status as { in: string[] }).in;
          if (!allowed.includes(j.status)) return { count: 0 };
          Object.assign(j, data); return { count: 1 };
        },
      },
      shot: {
        findUnique: async ({ where }: { where: { id: string } }) => (shotRows.get(where.id) as { id: string; videoKey: string | null }) ?? null,
        update: async ({ where, data }) => { Object.assign(shotRows.get(where.id)!, data); return {}; },
      } as RepairDb["shot"],
    };
    const calls: string[][] = [];
    const deps = {
      download: async () => {}, upload: async (_s: string, k: string) => { calls.push(["upload", k]); },
      ffmpeg: async (a: string[]) => { calls.push(a); }, probe: async () => 5, version: async () => "v-1",
    };
    return { db, deps, state, issues, shotRows, calls };
  }

  it("repairs clips, queues regenerations, cancels the rest", async () => {
    const f = fake([
      { id: "j1aaaaaaaa", issueId: "i1", status: "planned", action: { kind: "hold_last_frame", shotId: "s1", addUs: 200_000n } },
      { id: "j2", issueId: "i2", status: "planned", action: { kind: "regenerate_shot", shotId: "s2", durationUs: 5_000_000n, reason: "frozen" } },
      { id: "j3", issueId: "i3", status: "planned", action: { kind: "normalize_loudness", targetLufs: -16, truePeakDbtp: -1 } },
    ], { s1: "projects/p/shots/s1/clip.mp4", s2: "projects/p/shots/s2/clip.mp4" });
    const out = await executeRepairs(f.db, f.deps, { projectId: "p", reportId: "r", mode: "all", maxRegens: 1 });
    expect(out).toEqual({ clips: 1, regenerating: 1, cancelled: 1, waiting: 0, failed: 0 });
    expect(f.shotRows.get("s1")!.videoKey).toBe("projects/p/shots/s1/repair-j1aaaaaa.mp4");
    expect(f.state.get("j1aaaaaaaa")).toMatchObject({ status: "succeeded", resultMediaVersionId: "v-1" });
    expect(f.issues.get("i1")!.status).toBe("resolved");
    expect(f.shotRows.get("s2")).toMatchObject({ status: "PENDING", videoKey: null });
    expect(f.issues.get("i2")!.status).toBe("repairing");
    expect(f.state.get("j3")).toMatchObject({ status: "cancelled" });
  });

  it("clips mode leaves regenerations planned; a shot regenerated before is not regenerated again", async () => {
    const jobs = (): RepairJobRow[] => [{ id: "j2", issueId: "i2", status: "planned", action: { kind: "regenerate_shot", shotId: "s2", durationUs: 1n, reason: "x" } }];
    const a = fake(jobs(), { s2: "k" });
    expect(await executeRepairs(a.db, a.deps, { projectId: "p", reportId: "r", mode: "clips" })).toMatchObject({ waiting: 1, regenerating: 0 });
    expect(a.state.get("j2")!.status).toBe("planned");
    const b = fake(jobs(), { s2: "k" }, 1);
    expect(await executeRepairs(b.db, b.deps, { projectId: "p", reportId: "r", mode: "all", maxRegens: 1 })).toMatchObject({ cancelled: 1 });
  });

  it("a clip repair that fails is recorded and the shot keeps its clip", async () => {
    const f = fake([{ id: "j1", issueId: "i1", status: "planned", action: { kind: "trim_tail", shotId: "s1", removeUs: 9_000_000n } }], { s1: "orig" });
    expect(await executeRepairs(f.db, f.deps, { projectId: "p", reportId: "r", mode: "clips" })).toMatchObject({ failed: 1 });
    expect(f.state.get("j1")).toMatchObject({ status: "failed", error: expect.stringContaining("leaves nothing") });
    expect(f.shotRows.get("s1")!.videoKey).toBe("orig");
  });
});
