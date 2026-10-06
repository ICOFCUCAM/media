import { describe, expect, it } from "vitest";
import { MasterClock } from "../clock/master-clock";
import { buildTimelineDraft } from "../timeline/build";
import { validateDurations } from "./duration-validator";
import { syncPolicy } from "./policy";
import type { MediaFacts, SyncInput } from "./types";

const clock = new MasterClock({ fps: "24" });

function input(media: MediaFacts[], dialogueMs = 800, dialogueStartMs = 1000): SyncInput {
  const d = buildTimelineDraft({
    clock,
    scenes: [{ id: "s1", index: 0, shots: [{ id: "a", index: 0, durationSec: 5 }],
      dialogue: [{ id: "d1", index: 0, text: "x", startMs: dialogueStartMs, audioDurationMs: dialogueMs }] }],
  });
  return { timelineVersionId: "t", durationUs: d.durationUs, fps: clock.fps, events: d.events, audio: d.audio, media, policy: syncPolicy("cinematic") };
}

const video = (us: bigint): MediaFacts => ({ eventKey: "shot:a", kind: "video", durationUs: us });

describe("AudioVideoDurationValidator", () => {
  it("passes matching media", () => {
    expect(validateDurations(input([video(5_000_000n), { eventKey: "dialogue:d1", kind: "audio", durationUs: 800_000n }]))).toEqual([]);
  });

  it("missing video is a blocker with a regeneration", () => {
    expect(validateDurations(input([]))[0]).toMatchObject({ check: "missing_media", severity: "blocker", repair: { kind: "regenerate_shot", shotId: "a" } });
  });

  it("the Wan frame cap: 1.5625 s clip in a 5 s shot → regenerate", () => {
    const i = validateDurations(input([video(1_562_500n)]))[0]!;
    expect(i).toMatchObject({ check: "duration", severity: "blocker", repair: { kind: "regenerate_shot", durationUs: 5_000_000n } });
    expect(i.message).toContain("1.563s for a 5.000s shot");
  });

  it("small deviations get the safe repair", () => {
    expect(validateDurations(input([video(4_900_000n)]))[0]!.repair).toMatchObject({ kind: "retime_clip", toDurationUs: 5_000_000n });
    expect(validateDurations(input([video(5_250_000n)]))[0]!.repair).toEqual({ kind: "trim_tail", shotId: "a", removeUs: 250_000n });
  });

  it("speech past the picture is never cut: hold briefly, else regenerate the tail with the dialogue timing", () => {
    // Line starts at 4.5 s and lasts 0.8 s → 0.3 s past a 5 s scene.
    const hold = validateDurations(input([video(5_000_000n)], 800, 4500)).find((x) => x.eventId === "dialogue:d1")!;
    expect(hold).toMatchObject({ check: "duration", severity: "error", repair: { kind: "hold_last_frame", addUs: 300_000n } });
    // 42 s narration on 35 s of picture is the §AW.11 test 1 shape; here 3 s past.
    const regen = validateDurations(input([video(5_000_000n)], 3500, 4500)).find((x) => x.eventId === "dialogue:d1")!;
    expect(regen).toMatchObject({ severity: "blocker", repair: { kind: "regenerate_tail", constraint: "approved_dialogue_timing" } });
    expect(regen.message).toContain("speech is never cut");
  });

  it("flags measured audio that differs from its placement, and padded silence", () => {
    const issues = validateDurations(input([video(5_000_000n), { eventKey: "dialogue:d1", kind: "audio", durationUs: 1_300_000n, leadingUs: 400_000n }]));
    expect(issues.map((x) => x.check).sort()).toEqual(["duration", "silence"]);
  });
});
