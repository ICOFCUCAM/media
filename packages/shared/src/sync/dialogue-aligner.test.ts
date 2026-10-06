/** Includes docs/38 §AW.11 regression test 4 — dialogue/video mismatch. */
import { describe, expect, it } from "vitest";
import { MasterClock } from "../clock/master-clock";
import { buildTimelineDraft, type DraftEvent } from "../timeline/build";
import { alignDialogue } from "./dialogue-aligner";
import { syncPolicy } from "./policy";
import type { SyncInput } from "./types";

const clock = new MasterClock({ fps: "24" });

function input(line: { startMs: number; ms: number; characterId?: string }, speaking: DraftEvent[] = []): SyncInput {
  const d = buildTimelineDraft({
    clock,
    scenes: [{ id: "s1", index: 0, shots: [{ id: "17", index: 0, durationSec: 6 }, { id: "18", index: 1, durationSec: 4 }],
      dialogue: [{ id: "d1", index: 0, text: "x", startMs: line.startMs, audioDurationMs: line.ms, characterId: line.characterId ?? "mara" }] }],
  });
  return { timelineVersionId: "t", durationUs: d.durationUs, fps: clock.fps, events: [...d.events, ...speaking], audio: d.audio, media: [], policy: syncPolicy("cinematic") };
}

const speakingSeg = (startUs: bigint, endUs: bigint, characterId = "mara"): DraftEvent =>
  ({ key: `act:${startUs}`, kind: "action", startUs, endUs, payload: { speaking: true, characterId, source: "analysis" } });

describe("DialogueAligner", () => {
  it("accepts a line inside its speaking segment", () => {
    expect(alignDialogue(input({ startMs: 1000, ms: 2000 }, [speakingSeg(1_000_000n, 3_200_000n)]))).toEqual([]);
  });

  it("regression test 4: dialogue outside the visual speaking segment → issue + repair plan, never silently accepted", () => {
    // Speaking motion 1.0–3.0 s; the line starts 420 ms late and runs to 4.62 s.
    const [i] = alignDialogue(input({ startMs: 1420, ms: 3200 }, [speakingSeg(1_000_000n, 3_000_000n)]));
    expect(i).toMatchObject({
      check: "dialogue_alignment", shotId: "17", severity: "blocker",
      measured: { onsetOffsetUs: 420_000, overrunUs: 1_620_000 },
      repair: { kind: "regenerate_tail", shotId: "17", fromUs: 1_420_000n, constraint: "approved_dialogue_timing" },
    });
    expect(i!.message).toBe(
      "Shot 17: dialogue begins 0.420s after the expected speaking motion; dialogue exceeds the visual speaking segment by 1.620s. " +
      "Recommended repair: regenerate the final 4.580s of the shot using the approved dialogue timing constraint.",
    );
    expect(i!.confidence).toBeGreaterThan(0.8);
  });

  it("without speaking analysis, the shot is the segment (lower confidence)", () => {
    const [i] = alignDialogue(input({ startMs: 5000, ms: 2000 }));
    expect(i).toMatchObject({ measured: { overrunUs: 1_000_000 }, confidence: 0.7 });
    expect(i!.message).toContain("exceeds the visual shot by 1.000s");
  });

  it("sound leading picture is held to the tighter lead window", () => {
    // 100 ms early: outside cinematic's 45 ms lead; 100 ms late would be inside its 125 ms lag.
    expect(alignDialogue(input({ startMs: 900, ms: 1000 }, [speakingSeg(1_000_000n, 3_000_000n)]))).toHaveLength(1);
    expect(alignDialogue(input({ startMs: 1100, ms: 1000 }, [speakingSeg(1_000_000n, 3_000_000n)]))).toHaveLength(0);
  });

  it("the wrong character speaking goes to human review", () => {
    const [i] = alignDialogue(input({ startMs: 1000, ms: 1000 }, [speakingSeg(1_000_000n, 3_000_000n, "jon")]));
    expect(i).toMatchObject({ repair: { kind: "human_review" } });
    expect(i!.message).toContain("only jon visibly speak");
  });
});
