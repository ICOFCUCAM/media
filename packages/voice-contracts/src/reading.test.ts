import { describe, expect, it } from "vitest";
import { conversationSpeakers, parseConversation, readingStyle, voiceTraits, withTraits } from "./reading";

describe("reading modes and controls (Part 3 §116–117)", () => {
  it("a mode is a default style the owner's controls override; invalid controls are dropped", () => {
    expect(readingStyle("narrator", {})).toEqual({ energy: 0.4, speed: 1 });
    expect(readingStyle("presenter", { emotion: "happy", speed: 1.2 })).toEqual({ energy: 0.7, speed: 1.2, emotion: "happy" });
    expect(readingStyle("narrator", { speed: 9 })).toEqual({ energy: 0.4, speed: 1 });
  });

  it("a conversation is Name: line, continuation lines join the previous speaker", () => {
    const lines = parseConversation("Ada: Hello there.\nBen: Hi!\n  How are you?\n\nada: Fine.");
    expect(lines).toEqual([
      { speaker: "Ada", text: "Hello there." },
      { speaker: "Ben", text: "Hi! How are you?" },
      { speaker: "ada", text: "Fine." },
    ]);
    expect(conversationSpeakers(lines)).toEqual(["Ada", "Ben"]);
    expect(() => parseConversation("no speaker here")).toThrow(/Name: line/);
  });
});

describe("a character's voice traits (Part 1 §19.2)", () => {
  it("are clamped, and junk is ignored", () => {
    expect(voiceTraits({ voiceId: "x", traits: { pitch: -9, rate: 1.1, loudnessDb: 5, other: 1 } })).toEqual({ pitch: -6, rate: 1.1, loudnessDb: 3 });
    expect(voiceTraits({ traits: { pitch: "low" } })).toEqual({});
    expect(voiceTraits(null)).toEqual({});
  });

  it("rate scales every line's speed; pitch applies unless the line sets one", () => {
    expect(withTraits(undefined, {})).toBeUndefined();
    expect(withTraits({ emotion: "sad" }, { rate: 0.9, pitch: -2 })).toEqual({ emotion: "sad", speed: 0.9, pitch: -2 });
    expect(withTraits({ speed: 2, pitch: 3 }, { rate: 1.25, pitch: -2 })).toEqual({ speed: 2, pitch: 3 });
  });
});
