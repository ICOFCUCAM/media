import { describe, expect, it } from "vitest";
import type { MediaFacts } from "@cineforge/shared";
import { checkTimeline, type SyncDb } from "./run";
import type { EventRow, TimelineRow } from "./load";

const timeline: TimelineRow = { id: "tl1", projectId: "p1", fpsNum: 24, fpsDen: 1, sampleRate: 48000, durationUs: 4_000_000n, status: "draft", syncPolicyId: "cinematic", syncPolicyVersion: 1 };
const ev = (id: string, kind: string, startUs: bigint, endUs: bigint, refId: string | null, parent: string | null = null): EventRow => ({
  id, kind, startUs, endUs, refType: kind === "shot" ? "shot" : kind === "scene" ? "scene" : null, refId, parentEventId: parent,
  anchorEventId: null, anchorOffsetUs: null, anchorMode: null, payload: {},
});

function db(clipKey: string | null): { db: SyncDb; downloads: string[] } {
  const downloads: string[] = [];
  return {
    downloads,
    db: {
      productionTimeline: { findUnique: async () => timeline },
      timelineEvent: { findMany: async () => [ev("sc1", "scene", 0n, 4_000_000n, "scene-1"), ev("sh1", "shot", 0n, 4_000_000n, "shot-1", "sc1")] },
      audioEvent: { findMany: async () => [] },
      shot: { findMany: async () => [{ id: "shot-1", videoKey: clipKey }] },
      videoGeneration: { findFirst: async () => ({ id: "vg1" }) },
    },
  };
}

const facts = (durationUs: bigint) => async (t: { eventKey: string; generationRef?: string | null }): Promise<MediaFacts> => ({
  eventKey: t.eventKey, kind: "video", generationRef: t.generationRef ?? null, sha256: "a".repeat(64), durationUs, frameRate: { num: 24, den: 1 }, conformRecorded: false,
} as MediaFacts);

describe("the A/V sync check as a pipeline step (W18; §39–40)", () => {
  it("measures every shot clip of the timeline and judges it against the plan", async () => {
    const { db: d, downloads } = db("clips/shot-1.mp4");
    const ok = await checkTimeline(d, async (k) => { downloads.push(k); }, "tl1", facts(4_000_000n) as never);
    expect(downloads).toEqual(["clips/shot-1.mp4"]);
    expect(ok!.report.policy).toBe("cinematic@1");
    const short = await checkTimeline(db("clips/shot-1.mp4").db, async () => {}, "tl1", facts(2_000_000n) as never);
    expect(short!.report.passed).toBe(false);
    expect(short!.report.issues.length).toBeGreaterThan(0);
  });

  it("a shot without its clip is reported, and an unknown timeline is no result", async () => {
    const missing = await checkTimeline(db(null).db, async () => {}, "tl1", facts(4_000_000n) as never);
    expect(missing!.report.passed).toBe(false);
    const none = { ...db(null).db, productionTimeline: { findUnique: async () => null } };
    expect(await checkTimeline(none, async () => {}, "nope")).toBeNull();
  });
});
