import { describe, expect, it } from "vitest";
import { speechLedgerRows } from "./ledger";
import type { SpokenCue } from "./film";

const cue = (over: Partial<SpokenCue>): SpokenCue => ({
  lineId: null, characterId: null, voice: "built-in", startMs: 0, durationMs: 1000, audioKey: null,
  engine: "fal-minimax", engineVersion: "speech-02-hd", voiceId: null, preset: "Deep_Voice_Man", segments: 1, ...over,
});

describe("speech ledger (Part 4 §149)", () => {
  it("each spoken part is one row on the Master Clock, with its voice and engine", () => {
    const rows = speechLedgerRows({ projectId: "p", sceneId: "s2", sceneStartSec: 12.5, language: "en", trackKey: "scenes/s2/audio/voice/j.wav" }, [
      cue({ startMs: 0, durationMs: 4000, segments: 2 }),
      cue({ lineId: "l1", characterId: "maya", voice: "cloned", voiceId: "v-maya", preset: null, startMs: 4250, durationMs: 1500, audioKey: "scenes/s2/audio/lines/l1.wav" }),
      cue({ startMs: 6000, durationMs: 0 }),
    ], new Date(0));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "narration", dialogueLineId: null, voiceId: "builtin:Deep_Voice_Man", requestedStartUs: 12_500_000n, requestedEndUs: 16_500_000n, meta: { segments: 2 } });
    expect(rows[1]).toMatchObject({
      kind: "dialogue", dialogueLineId: "l1", voiceId: "v-maya", provider: "fal-minimax", modelId: "speech-02-hd",
      requestedStartUs: 16_750_000n, requestedEndUs: 18_250_000n, outcome: "ACCEPTED", outcomeCode: "SPOKEN", policy: "voice-engine",
      meta: { characterId: "maya", voice: "cloned", audioKey: "scenes/s2/audio/lines/l1.wav" },
    });
  });
});
