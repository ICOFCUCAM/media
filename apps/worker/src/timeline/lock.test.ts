import { describe, expect, it } from "vitest";
import { applyCut, approveLockedTimeline, cutFromTimeline, lockRendered, type LockDb } from "./lock";
import { loadProjectSource } from "./store";

const us = (s: number) => BigInt(Math.round(s * 1e6));
const events = [
  { kind: "scene", refId: "B", startUs: us(4), endUs: us(7) },
  { kind: "shot", refId: "b1", startUs: us(4), endUs: us(7) },
  { kind: "scene", refId: "A", startUs: us(0), endUs: us(4) },
  { kind: "shot", refId: "a2", startUs: us(2.5), endUs: us(4) },
  { kind: "shot", refId: "a1", startUs: us(0), endUs: us(2.5) },
  { kind: "dialogue", refId: "d1", startUs: us(0.5), endUs: us(2) },
];
const shotScene = new Map([["a1", "A"], ["a2", "A"], ["b1", "B"]]);

describe("film lock → approved timeline → render (W19)", () => {
  it("the timeline decides the order of scenes and shots and how long each shot plays", () => {
    const cut = cutFromTimeline(events, shotScene);
    expect(cut).toEqual({
      scenes: [{ sceneId: "A", shots: [{ shotId: "a1", sec: 2.5 }, { shotId: "a2", sec: 1.5 }] }, { sceneId: "B", shots: [{ shotId: "b1", sec: 3 }] }],
      durationSec: 7,
    });
    expect(() => cutFromTimeline([{ kind: "shot", refId: "zz", startUs: 0n, endUs: 1n }], shotScene)).toThrow(/not in the film/);
  });

  it("the render's assets follow the cut; a shot without a clip refuses to render", () => {
    const assets = [
      { sceneId: "A", index: 0, shotKeys: ["x"], musicKey: "m.wav" },
      { sceneId: "B", index: 1, shotKeys: ["y"] },
    ];
    const clips = new Map<string, string | null>([["a1", "a1.mp4"], ["a2", "a2.mp4"], ["b1", "b1.mp4"]]);
    const out = applyCut(assets, cutFromTimeline(events, shotScene), clips);
    expect(out.map((a) => [a.sceneId, a.shotKeys, a.shotCutSec])).toEqual([["A", ["a1.mp4", "a2.mp4"], [2.5, 1.5]], ["B", ["b1.mp4"], [3]]]);
    expect(out[0]).toMatchObject({ musicKey: "m.wav" });
    expect(() => applyCut(assets, cutFromTimeline(events, shotScene), new Map([["a1", "a1.mp4"]]))).toThrow(/has no clip/);
  });

  it("a lock is rendered once: by an approved or delivered timeline approved after it", () => {
    const lockedAt = new Date("2026-10-09T10:00:00Z");
    expect(lockRendered(lockedAt, [])).toBe(false);
    expect(lockRendered(lockedAt, [{ status: "frozen", approvedAt: new Date("2026-10-09T09:00:00Z") }])).toBe(false); // an earlier lock
    expect(lockRendered(lockedAt, [{ status: "frozen", approvedAt: new Date("2026-10-09T10:05:00Z") }])).toBe(true);
    expect(lockRendered(lockedAt, [{ status: "approved", approvedAt: new Date("2026-10-09T10:01:00Z") }])).toBe(true);
  });

  it("approving builds and saves the timeline from the locked scenes, supersedes older approvals, approves the new one", async () => {
    const calls: unknown[] = [];
    const db: LockDb = {
      scene: { findMany: async () => [{
        id: "A", index: 0, dialogue: [], audioTracks: [],
        shots: [{ id: "a1", index: 0, durationSec: 5, cutSec: 3.25 }, { id: "a2", index: 1, durationSec: 2, cutSec: null }],
      }] },
      productionTimeline: {
        findFirst: async () => ({ id: "t1", version: 1 }),
        create: async ({ data }) => { calls.push(["create", data.status]); return { id: "t2", version: 2 }; },
        updateMany: async (a) => { calls.push(["updateMany", a.where, a.data]); return { count: 1 }; },
        update: async (a) => { calls.push(["update", a.where, a.data]); return {}; },
      },
      timelineEvent: { createMany: async ({ data }) => ({ count: data.length }) },
      audioEvent: { createMany: async ({ data }) => ({ count: data.length }) },
      $transaction: async (fn) => fn(db),
    };
    // The editor's cut (W13) is the shot's length on the timeline.
    expect((await loadProjectSource(db, "p"))[0]!.shots.map((s) => s.durationSec)).toEqual([3.25, 2]);
    expect(await approveLockedTimeline(db, "p", "cinematic")).toEqual({ approved: true, timelineId: "t2", version: 2 });
    expect(calls).toEqual([
      ["create", "draft"],
      ["updateMany", { projectId: "p", status: "approved", id: { not: "t2" } }, { status: "superseded" }],
      ["update", { id: "t2" }, { status: "approved" }],
    ]);
  });
});
