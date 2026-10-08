import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const { translateLines, TranslationError } = await import("./translate");

const reply = (lines: unknown) => ({ content: [{ type: "tool_use", name: "submit_translation", input: { lines } }] });

afterEach(() => {
  vi.unstubAllEnvs();
  create.mockReset();
});

describe("translation never passes English off as the target language (DOS-75)", () => {
  it("English needs no model", async () => {
    expect(await translateLines(["Hello"], "en")).toEqual(["Hello"]);
  });

  it("no model configured → TranslationError (it used to return the originals)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(translateLines(["Hello"], "fr")).rejects.toBeInstanceOf(TranslationError);
  });

  it("an empty line in the reply fails the language instead of keeping English", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    create.mockResolvedValue(reply(["Bonjour", ""]));
    await expect(translateLines(["Hello", "Goodbye"], "fr")).rejects.toMatchObject({ lang: "fr", reason: "1 of 2 lines came back empty" });
  });

  it("provider errors become TranslationError", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    create.mockRejectedValue(new Error("overloaded"));
    await expect(translateLines(["Hello"], "de")).rejects.toMatchObject({ lang: "de", reason: "overloaded" });
  });

  it("a complete reply is returned in order", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    create.mockResolvedValue(reply(["Bonjour", "Au revoir"]));
    expect(await translateLines(["Hello", "Goodbye"], "fr")).toEqual(["Bonjour", "Au revoir"]);
  });
});
