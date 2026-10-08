import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionFailure } from "@cineforge/shared";
import { coerceDraft, draftFilm } from "./llm";

const good = {
  logline: "A courier outruns a storm.",
  synopsis: "s",
  genre: "thriller",
  tone: "tense",
  location: { name: "Harbour", kind: "CITY", description: "a rain-lashed harbour" },
  protagonist: { name: "Maya", appearance: "short red hair, yellow raincoat" },
  scenes: [{ heading: "EXT. HARBOUR - NIGHT", summary: "Maya runs.", timeOfDay: "night" }, { summary: "She arrives." }],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Director output validation (DOS-24, DOS-74)", () => {
  it("accepts a complete plan and lists only presentation fields it derived", () => {
    const d = coerceDraft(good, "brief", 2);
    expect(d.protagonist.appearance).toBe("short red hair, yellow raincoat");
    expect(d.scenes[1]!.heading).toBe("EXT. HARBOUR - NIGHT");
    expect(d.inferred).toEqual(["scenes[1].timeOfDay", "scenes[1].heading"]);
  });

  it("refuses a plan with missing essential content instead of inventing it", () => {
    const bad = { ...good, protagonist: { name: "Maya" }, scenes: [good.scenes[0]] };
    try {
      coerceDraft(bad, "brief", 2);
      throw new Error("should have failed");
    } catch (e) {
      expect(e).toBeInstanceOf(ProductionFailure);
      expect((e as ProductionFailure).code).toBe("DIRECTOR_OUTPUT_INVALID");
      expect((e as ProductionFailure).detail?.missing).toEqual(["protagonist.appearance", "scenes (1/2)", "scenes[1].summary"]);
    }
  });

  it("no planning model configured → DIRECTOR_UNAVAILABLE, never the stub film", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("DIRECTOR_ALLOW_STUB", "");
    await expect(draftFilm("a film", 2)).rejects.toMatchObject({ code: "DIRECTOR_UNAVAILABLE" });
  });

  it("the stub exists only when explicitly allowed (local runs and tests)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("DIRECTOR_ALLOW_STUB", "1");
    const d = await draftFilm("a film", 2);
    expect(d.raw).toMatchObject({ stub: true });
    expect(d.inferred).toEqual(["*"]);
  });
});
