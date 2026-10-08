import { describe, expect, it } from "vitest";
import { IntelligenceError, IntelligenceRouter, type IntelligenceProvider, type StructuredRequest } from "@cineforge/movie";
import { translateLines, TranslationError } from "./translate";

function router(reply: unknown | Error, configured = true) {
  const calls: StructuredRequest[] = [];
  const p: IntelligenceProvider = {
    id: "anthropic",
    configured: () => configured,
    async generateStructured(req) {
      calls.push(req);
      if (reply instanceof Error) throw reply;
      return { output: reply, provider: "anthropic", model: "m", usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
    },
  };
  return { r: new IntelligenceRouter([p], {}), calls };
}

describe("translation never passes English off as the target language (DOS-75)", () => {
  it("English needs no model", async () => {
    expect(await translateLines(["Hello"], "en", { router: router({}, false).r })).toEqual(["Hello"]);
  });

  it("no model configured → TranslationError", async () => {
    await expect(translateLines(["Hello"], "fr", { router: router({}, false).r })).rejects.toBeInstanceOf(TranslationError);
  });

  it("an empty line in the reply fails the language instead of keeping English", async () => {
    await expect(translateLines(["Hello", "Goodbye"], "fr", { router: router({ lines: ["Bonjour", ""] }).r }))
      .rejects.toMatchObject({ lang: "fr", reason: "1 of 2 lines came back empty" });
  });

  it("provider errors become TranslationError", async () => {
    await expect(translateLines(["Hello"], "de", { router: router(new IntelligenceError("PROVIDER_ERROR", "overloaded")).r }))
      .rejects.toMatchObject({ lang: "de" });
  });

  it("goes through the router with the registered prompt", async () => {
    const { r, calls } = router({ lines: ["Bonjour", "Au revoir"] });
    expect(await translateLines(["Hello", "Goodbye"], "fr", { router: r })).toEqual(["Bonjour", "Au revoir"]);
    expect(calls[0]).toMatchObject({ task: "translation", promptId: "translate.lines", promptVersion: 1 });
    expect(calls[0]!.user).toContain("French (fr)");
  });
});
