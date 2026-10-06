import { describe, expect, it } from "vitest";
import { MasterClock } from "../clock/master-clock";
import { buildTimelineDraft } from "../timeline/build";
import { analyzeSync, ENGINE_CHECKS } from "./engine";
import { syncPolicy } from "./policy";
import type { MediaFacts, SyncInput } from "./types";

const clock = new MasterClock({ fps: "24" });
const draft = buildTimelineDraft({
  clock,
  scenes: [{ id: "s1", index: 0, shots: [{ id: "a", index: 0, durationSec: 5 }, { id: "b", index: 1, durationSec: 5 }],
    dialogue: [{ id: "d1", index: 0, text: "x", startMs: 1000, audioDurationMs: 2000 }] }],
});
const good = (key: string, us: bigint): MediaFacts => ({ eventKey: key, kind: "video", durationUs: us, frameRate: { num: 24, den: 1 }, sha256: "a".repeat(64), generationRef: `video_generations:${key}` });
const input = (media: MediaFacts[]): SyncInput => ({ timelineVersionId: "t1", durationUs: draft.durationUs, fps: clock.fps, events: draft.events, audio: draft.audio, media, policy: syncPolicy("cinematic") });

describe("AVSyncEngine", () => {
  it("passes a synchronized, traceable timeline", () => {
    const { report, plan } = analyzeSync(input([good("shot:a", 5_000_000n), good("shot:b", 5_000_000n)]));
    expect(report).toMatchObject({ timelineVersionId: "t1", policy: "cinematic@1", passed: true, issues: [] });
    expect(report.checks).toEqual(ENGINE_CHECKS);
    expect(report.toolVersions.engine).toBe("cineforge.avsync@1");
    expect(plan.repairs).toEqual([]);
  });

  it("fails with ordered issues and one plan when media is wrong", () => {
    const { report, plan } = analyzeSync(input([
      good("shot:a", 1_562_500n),                                           // Wan frame cap
      { ...good("shot:b", 5_000_000n), sha256: null, frameRate: { num: 16, den: 1 } }, // untraceable + implicit conform
    ]));
    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => `${i.check}:${i.eventId}`)).toEqual([
      "duration:shot:a", "frame_rate:shot:b", "provenance:shot:b",
    ]);
    expect(plan.repairs.map((r) => r.action.kind)).toEqual(["regenerate_shot"]);
    expect(plan.humanReview.map((h) => h.reason)).toEqual(["conform without a media version", "untraceable media cannot be mastered"]);
  });

  it("can run a subset of checks", () => {
    const { report } = analyzeSync(input([good("shot:a", 1_562_500n)]), { checks: ["provenance"] });
    expect(report.passed).toBe(true);
    expect(report.checks).toEqual(["provenance"]);
  });
});
