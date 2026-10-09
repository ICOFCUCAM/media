import { describe, expect, it } from "vitest";
import { voiceContinuity } from "./continuity";

const track = (sceneIndex: number, engine: string, cues: [string | null, "cloned" | "built-in"][]) => ({
  sceneId: `s${sceneIndex}`, sceneIndex,
  meta: { provider: "voice-engine", engine, cues: cues.map(([characterId, voice]) => ({ characterId, voice, lineId: null, startMs: 0, durationMs: 1 })) },
});

describe("voice continuity over the spoken film (§32.6)", () => {
  it("one voice per character and one stock engine: nothing to report", () => {
    expect(voiceContinuity([
      track(0, "fal-minimax", [[null, "built-in"], ["maya", "cloned"]]),
      track(1, "fal-minimax", [["maya", "cloned"], ["ewan", "built-in"]]),
    ])).toEqual([]);
  });

  it("a character whose chosen voice failed in some scenes only is flagged with the scenes", () => {
    const d = voiceContinuity([
      track(0, "fal-minimax", [["maya", "cloned"]]),
      track(1, "fal-minimax", [["maya", "built-in"]]),
      track(2, "fal-minimax", [["maya", "cloned"]]),
    ], new Map([["maya", "Maya"]]));
    expect(d).toEqual([expect.objectContaining({
      code: "AUDIO_CONTINUITY", severity: "warning", scope: "film", refId: "maya",
      message: expect.stringMatching(/^Maya speaks in their chosen voice in scene 1, 3 but in a built-in voice in scene 2/),
      detail: expect.objectContaining({ code: "VOICE_CHANGES" }),
    })]);
  });

  it("built-in voices from two engines are flagged; tracks without voice-engine metadata are ignored", () => {
    const d = voiceContinuity([
      track(0, "fal-minimax", [[null, "built-in"]]),
      track(1, "openai-tts", [[null, "built-in"]]),
      { sceneId: "old", sceneIndex: 2, meta: { generated: "stub" } },
    ]);
    expect(d.map((x) => (x.detail as { code: string }).code)).toEqual(["BUILT_IN_ENGINE_CHANGES"]);
    expect(d[0]!.message).toContain("fal-minimax (scene 1), openai-tts (scene 2)");
  });

  it("an engine change matters only when built-in voices spoke", () => {
    expect(voiceContinuity([track(0, "fal-minimax", [["maya", "cloned"]]), track(1, "openai-tts", [["maya", "cloned"]])])).toEqual([]);
  });
});
