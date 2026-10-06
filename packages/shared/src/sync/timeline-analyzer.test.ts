import { describe, expect, it } from "vitest";
import { MasterClock } from "../clock/master-clock";
import { buildTimelineDraft } from "../timeline/build";
import { syncPolicy } from "./policy";
import { analyzeTimeline } from "./timeline-analyzer";
import type { SyncInput } from "./types";

const clock = new MasterClock({ fps: "24" });

function input(): SyncInput {
  const d = buildTimelineDraft({
    clock,
    scenes: [{ id: "s1", index: 0, shots: [{ id: "a", index: 0, durationSec: 3 }, { id: "b", index: 1, durationSec: 3 }],
      dialogue: [{ id: "d1", index: 0, text: "hi", startMs: 3500, audioDurationMs: 800 }] }],
  });
  return { timelineVersionId: "t1", durationUs: d.durationUs, fps: clock.fps, events: d.events, audio: d.audio, media: [], policy: syncPolicy("cinematic") };
}

describe("TimelineAnalyzer", () => {
  it("a freshly built timeline is structurally clean", () => {
    expect(analyzeTimeline(input())).toEqual([]);
  });

  it("flags a re-timed shot's dependent dialogue instead of keeping it in place (§AU.11)", () => {
    const i = input();
    // Shot a was regenerated 0.5 s shorter; shot b moves up, d1 (anchored to b) did not.
    const a = i.events.find((e) => e.key === "shot:a")!;
    const b = i.events.find((e) => e.key === "shot:b")!;
    a.endUs = 2_500_000n;
    b.startUs = 2_500_000n;
    b.endUs = 5_500_000n;
    const issues = analyzeTimeline(i);
    const d = issues.find((x) => x.eventId === "dialogue:d1")!;
    expect(d).toMatchObject({ check: "dialogue_alignment", severity: "blocker", repair: { kind: "shift_audio", byUs: -500_000n } });
    expect(d.message).toContain("0.500s later than its anchor shot:b");
  });

  it("finds gaps, overlaps, misaligned picture and events outside the timeline", () => {
    const i = input();
    i.events.find((e) => e.key === "shot:b")!.startUs = 3_041_666n; // one-frame gap
    i.events.push({ key: "sub:1", kind: "subtitle", startUs: 10_000n, endUs: 500_000n });
    i.events.push({ key: "sfx:1", kind: "sfx", startUs: 5_000_000n, endUs: 9_000_000n, parentKey: "scene:s1" });
    i.events.push({ key: "music:1", kind: "music_cue", startUs: 0n, endUs: 1_000n, anchor: { key: "shot:zzz", offsetUs: 0n, mode: "start" } });
    const kinds = analyzeTimeline(i).map((x) => `${x.check}:${x.eventId}`);
    expect(kinds).toEqual(expect.arrayContaining([
      "transitions:shot:b", "frame_rate:sub:1", "duration:sfx:1", "sfx_cue:sfx:1", "music_cue:music:1",
    ]));
  });
});
