import { describe, expect, it } from "vitest";
import { avatarReply, speakable, talkRequest, TALK_HISTORY, TALK_MAX_CHARS } from "./talk";
import { IntelligenceRouter } from "./router";
import type { IntelligenceProvider, StructuredRequest } from "./types";

class Fake implements IntelligenceProvider {
  readonly id = "anthropic";
  calls: StructuredRequest[] = [];
  constructor(private readonly out: unknown) {}
  configured() { return true; }
  async generateStructured(req: StructuredRequest, model: string) {
    this.calls.push(req);
    return { output: this.out, provider: this.id, model, usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
  }
}

describe("the avatar's side of a conversation (W26; Part 3 §111, §117)", () => {
  it("sends the persona, the language and only the recent lines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 ? "avatar" : "user") as "user" | "avatar", text: `line ${i}` }));
    const r = JSON.parse(talkRequest("A patient chemistry teacher.", "en", lines));
    expect(r.persona).toBe("A patient chemistry teacher.");
    expect(r.conversation).toHaveLength(TALK_HISTORY);
    expect(r.conversation.at(-1)).toEqual({ who: "you", said: "line 19" });
    expect(r.conversation[0]).toEqual({ who: "person", said: "line 8" });
  });

  it("replies as spoken words: markup removed, cut at a sentence within the limit", () => {
    expect(speakable("**Well**, the sky is _blue_ because   air scatters light.")).toBe("Well, the sky is blue because air scatters light.");
    const long = "Light scatters off the air. ".repeat(40);
    const s = speakable(long);
    expect(s.length).toBeLessThanOrEqual(TALK_MAX_CHARS);
    expect(s.endsWith(".")).toBe(true);
  });

  it("asks the router as a conversation task and returns the reply", async () => {
    const fake = new Fake({ reply: "Because sunlight scatters off the air itself." });
    const r = await avatarReply(new IntelligenceRouter([fake], {}), "A teacher.", "en", [{ role: "user", text: "Why is the sky blue?" }]);
    expect(r).toBe("Because sunlight scatters off the air itself.");
    expect(fake.calls[0]!.task).toBe("conversation");
    await expect(avatarReply(new IntelligenceRouter([new Fake({ reply: "  " })], {}), "A teacher.", "en", [])).rejects.toThrow(/nothing to say/);
  });
});
