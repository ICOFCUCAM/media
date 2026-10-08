import { afterEach, describe, expect, it, vi } from "vitest";
import { moderatePrompt } from "./moderation";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("moderation reports when it did not run (DOS-75)", () => {
  it("no key → not checked", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await moderatePrompt("x")).toEqual({ allowed: true, checked: false, unchecked: "no-key" });
  });

  it("explicitly disabled → not checked", async () => {
    vi.stubEnv("PROMPT_MODERATION", "0");
    expect(await moderatePrompt("x")).toMatchObject({ checked: false, unchecked: "disabled" });
  });

  it("endpoint error → not checked (was silently 'allowed')", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect(await moderatePrompt("x")).toMatchObject({ allowed: true, checked: false, unchecked: "http-503" });
  });

  it("a real check is marked checked", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: [{ category_scores: { "sexual/minors": 0.5 } }] })));
    expect(await moderatePrompt("x")).toEqual({ allowed: false, reason: "sexual/minors", checked: true });
  });
});
