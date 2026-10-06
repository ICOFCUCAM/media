import { describe, expect, it } from "vitest";
import { MasterClock } from "../clock/master-clock";
import { buildTimelineDraft } from "./build";
import { estimateSpeechUs } from "./speech";

const clock = new MasterClock({ fps: "24" });

describe("speech estimate (§AU.5)", () => {
  it("words × rate × emotion + interior pauses", () => {
    expect(estimateSpeechUs("one two three four five")).toBe(2_000_000n); // 150 wpm
    expect(estimateSpeechUs("one two three four five", { emotion: "urgent" })).toBe(1_600_000n);
    expect(estimateSpeechUs("Wait, what? No.")).toBe(1_200_000n + 180_000n + 350_000n);
    expect(estimateSpeechUs("   ")).toBe(0n);
  });
});

describe("timeline draft", () => {
  const scenes = [
    {
      id: "s2", index: 1,
      shots: [{ id: "c", index: 0, durationSec: 3 }],
      dialogue: [{ id: "d2", index: 0, text: "one two three four five six seven eight nine ten", startMs: 500 }],
    },
    {
      id: "s1", index: 0,
      shots: [{ id: "b", index: 1, durationSec: 2.5 }, { id: "a", index: 0, durationSec: 6.84 }],
      dialogue: [{ id: "d1", index: 0, text: "hello there", audioDurationMs: 1234 }],
      audioTracks: [{ id: "m1", kind: "MUSIC" as const, startMs: 0, durationMs: null, gainDb: -12 }],
    },
  ];
  const draft = buildTimelineDraft({ scenes, clock });

  it("places scenes and shots back to back on frame boundaries", () => {
    const shots = draft.events.filter((e) => e.kind === "shot");
    expect(shots.map((s) => s.refId)).toEqual(["a", "b", "c"]);
    expect(shots[0]).toMatchObject({ startUs: 0n, endUs: 6_833_333n });   // 6.84 s → 164 frames
    expect(shots[1]).toMatchObject({ startUs: 6_833_333n, endUs: 9_333_333n });
    expect(shots[2]).toMatchObject({ startUs: 9_333_333n, endUs: 12_333_333n });
    for (const e of draft.events.filter((x) => x.kind === "shot" || x.kind === "scene")) {
      expect(clock.isPictureAligned(e.startUs) && clock.isPictureAligned(e.endUs)).toBe(true);
    }
    expect(draft.events.find((e) => e.key === "scene:s1")).toMatchObject({ startUs: 0n, endUs: 9_333_333n });
  });

  it("places dialogue sample-accurately, measured or estimated, anchored to its shot", () => {
    const d1 = draft.events.find((e) => e.key === "dialogue:d1")!;
    expect(d1).toMatchObject({ startUs: 0n, endUs: 1_234_000n, anchor: { key: "shot:a", offsetUs: 0n, mode: "start" } });
    expect(d1.payload).toMatchObject({ durationSource: "audio" });
    const d2 = draft.events.find((e) => e.key === "dialogue:d2")!;
    expect(d2.startUs).toBe(9_833_333n); // 9.333333 s + 0.5 s — already on the 48 kHz grid (sample 472000)
    expect(d2.payload).toMatchObject({ durationSource: "estimate" });
    expect(d2.anchor).toMatchObject({ key: "shot:c" });
  });

  it("never clips: overruns are kept and reported, and the timeline covers them", () => {
    // d2: 10 words ≈ 4 s from 9.83 s → past the 12.33 s end of scene s2.
    const d2 = draft.events.find((e) => e.key === "dialogue:d2")!;
    expect(d2.endUs).toBeGreaterThan(12_333_333n);
    expect(draft.warnings.some((w) => w.includes("dialogue d2 ends"))).toBe(true);
    expect(draft.durationUs).toBeGreaterThanOrEqual(d2.endUs);
    expect(clock.isPictureAligned(draft.durationUs)).toBe(true);
  });

  it("music without a duration spans its scene", () => {
    expect(draft.audio).toEqual([expect.objectContaining({ key: "audio:m1", stem: "music", startUs: 0n, endUs: 9_333_333n, gainDb: -12 })]);
  });

  it("zero-length shots still occupy one frame", () => {
    const d = buildTimelineDraft({ scenes: [{ id: "s", index: 0, shots: [{ id: "z", index: 0, durationSec: 0 }] }], clock });
    expect(d.events.find((e) => e.kind === "shot")).toMatchObject({ startUs: 0n, endUs: 41_666n });
  });
});
