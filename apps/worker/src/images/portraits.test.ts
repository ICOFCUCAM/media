import { describe, expect, it } from "vitest";
import { drawPortraits, portraitPrompt, type PortraitCard, type PortraitDb } from "./portraits";
import type { ImageProvider } from "./providers";

const card: PortraitCard = {
  id: "c1", projectId: "lib", name: "Kito", appearance: "a small red fox with a white chest", age: 8, heightCm: 60, hair: null, eyes: "amber",
  clothing: "a blue scarf", animationStyle: "3d_family", design: { proportions: "big head, short legs", palette: "#d9480f, #ffffff, #1c7ed6" },
};

function fakeDb(rows: PortraitCard[]) {
  const status = new Map(rows.map((r) => [r.id, "requested"]));
  const writes: Record<string, unknown>[] = [];
  const ledger: Record<string, unknown>[] = [];
  const db: PortraitDb = {
    character: {
      findMany: async () => rows.filter((r) => status.get(r.id) === "requested"),
      updateMany: async ({ where, data }) => {
        const id = where.id as string;
        if (where.portraitStatus && status.get(id) !== where.portraitStatus) return { count: 0 };
        if (data.portraitStatus) status.set(id, data.portraitStatus as string);
        writes.push({ id, ...data });
        return { count: 1 };
      },
    },
    imageGeneration: { create: async ({ data }) => { ledger.push(data); return { id: "g" }; } },
  };
  return { db, writes, ledger, status };
}

describe("Character Card portraits (W21)", () => {
  it("the prompt is the card: look, eyes, clothing, design, style; one character, no text", () => {
    const p = portraitPrompt(card);
    for (const s of ["Kito", "small red fox", "Eyes: amber", "blue scarf", "big head, short legs", "#d9480f", "3d family animation style"]) expect(p).toContain(s);
    expect(p).toContain("One character only");
    expect(portraitPrompt({ ...card, animationStyle: null })).toContain("photorealistic cinematic portrait");
  });

  it("claims a request, draws it under the card's project, records the still, marks it ready", async () => {
    const { db, writes, ledger, status } = fakeDb([card]);
    const seen: string[] = [];
    const provider: ImageProvider = {
      id: "fal-flux", model: "fal-ai/flux/dev", seeds: true,
      generate: async (prompt, key) => { seen.push(key); return { key, provider: "fal-flux", model: "fal-ai/flux/dev", seed: 1, sha256: "a".repeat(64), promptSha256: "b".repeat(64), width: 1024, height: 1024 }; },
    };
    expect(await drawPortraits(db, provider, 7)).toEqual({ drawn: 1, failed: 0 });
    expect(seen).toEqual(["projects/lib/characters/c1/portrait-7.png"]);
    expect(status.get("c1")).toBe("ready");
    expect(writes.at(-1)).toMatchObject({ portraitKey: "projects/lib/characters/c1/portrait-7.png", portraitStatus: "ready" });
    expect(ledger[0]).toMatchObject({ purpose: "portrait", subject: "c1", provider: "fal-flux" });
  });

  it("no provider, or a provider error, fails the request with the reason — never a fake portrait", async () => {
    const none = fakeDb([card]);
    expect(await drawPortraits(none.db, null)).toEqual({ drawn: 0, failed: 1 });
    expect(none.writes.at(-1)).toMatchObject({ portraitStatus: "failed", portraitError: "No image provider is configured." });
    const broken = fakeDb([card]);
    const provider = { id: "x", model: null, seeds: false, generate: async () => { throw new Error("quota exceeded"); } } as ImageProvider;
    expect(await drawPortraits(broken.db, provider)).toEqual({ drawn: 0, failed: 1 });
    expect(broken.writes.at(-1)).toMatchObject({ portraitStatus: "failed", portraitError: "quota exceeded" });
  });
});
