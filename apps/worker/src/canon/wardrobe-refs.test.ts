import { beforeEach, describe, expect, it } from "vitest";
import { checkContinuity, mayaCoatFixture, reviseCanon } from "@cineforge/movie";
import { _resetWardrobeRefState, wardrobeReferenceKeys, type ReferenceImageGenerator, type WardrobeRefDb } from "./wardrobe-refs";

const ids = new Map([["char_maya", "row-maya"], ["char_harbourmaster", "row-ewan"]]);

function fakeDb(opts: { missing?: boolean } = {}) {
  const rows: Record<string, unknown>[] = [];
  const db: WardrobeRefDb = {
    wardrobeReference: {
      findFirst: async (a) => {
        if (opts.missing) throw Object.assign(new Error("relation does not exist"), { code: "P2021" });
        const w = (a as { where: Record<string, string> }).where;
        const r = rows.find((x) => x.characterId === w.characterId && x.wardrobeKey === w.wardrobeKey && x.digest === w.digest);
        return r ? { storageKey: r.storageKey as string } : null;
      },
      create: async (a) => { rows.push(a.data); return {}; },
    },
  };
  return { db, rows };
}

function fakeImage(): ReferenceImageGenerator & { prompts: string[] } {
  const prompts: string[] = [];
  return { id: "openai-image", prompts, generate: async (prompt, key) => { prompts.push(prompt); return key; } };
}

describe("wardrobe reference pack at render time", () => {
  beforeEach(() => _resetWardrobeRefState());

  it("generates once per depicted canon, reuses after, and a canon change produces a new reference", async () => {
    const pkg = mayaCoatFixture();
    const { db, rows } = fakeDb();
    const image = fakeImage();
    const r1 = checkContinuity(pkg, { sceneId: "scene_11", shotIndex: 1 });
    const a = await wardrobeReferenceKeys(db, image, "p1", "shot-a", pkg, r1, ids);
    expect(a.gaps).toEqual([]);
    expect(a.keys).toHaveLength(1);
    expect(a.keys[0]).toMatch(/^projects\/p1\/wardrobe\/wardrobe_red_coat-[0-9a-f]{16}\.png$/);
    expect(image.prompts[0]).toContain("Wearing long red wool coat");

    // Same canon in another scene → reused, no new image.
    const r2 = checkContinuity(pkg, { sceneId: "scene_12", shotIndex: 1 });
    const b = await wardrobeReferenceKeys(db, image, "p1", "shot-b", pkg, r2, ids);
    expect(b.keys).toEqual(a.keys);
    expect(image.prompts).toHaveLength(1);

    // Canon change → new digest → new reference (old row kept).
    const rev = reviseCanon(pkg, { kind: "wardrobe_description", characterId: "char_maya", wardrobeId: "wardrobe_red_coat", description: "long crimson coat" });
    const r3 = checkContinuity(rev.pkg, { sceneId: "scene_12", shotIndex: 1 });
    const c = await wardrobeReferenceKeys(db, image, "p1", "shot-b", rev.pkg, r3, ids);
    expect(c.keys[0]).not.toBe(a.keys[0]);
    expect(image.prompts[1]).toContain("long crimson coat");
    expect(rows).toHaveLength(2);
  });

  it("an establishing shot needs none; no provider or no table is a recorded gap, not a failure", async () => {
    const pkg = mayaCoatFixture();
    const wide = checkContinuity(pkg, { sceneId: "scene_11", shotIndex: 0 });
    expect((await wardrobeReferenceKeys(fakeDb().db, fakeImage(), "p1", "s", pkg, wide, ids)).keys).toEqual([]);

    const r = checkContinuity(pkg, { sceneId: "scene_11", shotIndex: 1 });
    const none = await wardrobeReferenceKeys(fakeDb().db, null, "p1", "s", pkg, r, ids);
    expect(none.keys).toEqual([]);
    expect(none.gaps.map((g) => [g.code, g.detail?.reason])).toEqual([["WARDROBE_REFERENCE_UNAVAILABLE", "no image provider configured"]]);

    const missing = await wardrobeReferenceKeys(fakeDb({ missing: true }).db, fakeImage(), "p1", "s", pkg, r, ids);
    expect(missing.gaps[0]!.detail?.reason).toMatch(/0034/);

    const failing: ReferenceImageGenerator = { id: "x", generate: async () => { throw new Error("rate limited"); } };
    _resetWardrobeRefState();
    const err = await wardrobeReferenceKeys(fakeDb().db, failing, "p1", "s", pkg, r, ids);
    expect(err.gaps[0]!.detail?.reason).toBe("rate limited");
  });
});
