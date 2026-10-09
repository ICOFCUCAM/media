import { beforeEach, describe, expect, it } from "vitest";
import { checkContinuity, mayaCoatFixture, reviseCanon } from "@cineforge/movie";
import { _resetWorldRefState, worldReferenceKeys, type WorldRefDb } from "./world-refs";
import type { ReferenceImageGenerator } from "./wardrobe-refs";
import { assembleReferencePack } from "./reference-pack";

function fakeDb(opts: { missing?: boolean } = {}) {
  const rows: Record<string, unknown>[] = [];
  const db: WorldRefDb = {
    worldReference: {
      findFirst: async (a) => {
        if (opts.missing) throw Object.assign(new Error("relation does not exist"), { code: "P2021" });
        const w = (a as { where: Record<string, string> }).where;
        const r = rows.find((x) => x.kind === w.kind && x.refKey === w.refKey && x.digest === w.digest && x.projectId === w.projectId);
        return r ? { storageKey: r.storageKey as string } : null;
      },
      create: async (a) => { rows.push(a.data); return {}; },
    },
  };
  return { db, rows };
}

function fakeImage() {
  const calls: { prompt: string; meta?: { subject: string; digest: string } }[] = [];
  const g: ReferenceImageGenerator = { id: "fal-image", generate: async (prompt, key, meta) => { calls.push({ prompt, meta }); return key; } };
  return { g, calls };
}

describe("location and prop references at render time (Part 1 §34–35)", () => {
  beforeEach(() => _resetWorldRefState());

  it("the shot's place is drawn once per depicted canon and reused; a canon change draws it again", async () => {
    const pkg = mayaCoatFixture();
    const { db, rows } = fakeDb();
    const { g, calls } = fakeImage();
    const r = checkContinuity(pkg, { sceneId: "scene_11", shotIndex: 1 });
    const a = await worldReferenceKeys(db, g, "p1", "shot-a", pkg, r);
    expect(a.gaps).toEqual([]);
    expect(a.location).toEqual([expect.stringMatching(/^projects\/p1\/world\/loc_harbour-[0-9a-f]{16}\.png$/)]);
    expect(calls[0]!.prompt).toMatch(/^Location reference, wide establishing view, no people/);
    expect(calls[0]!.meta).toEqual({ subject: "loc_harbour", digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const generated = calls.length;
    const b = await worldReferenceKeys(db, g, "p1", "shot-b", pkg, checkContinuity(pkg, { sceneId: "scene_12", shotIndex: 0 }));
    expect(b.location).toEqual(a.location);
    expect(calls.length).toBe(generated + b.props.filter((k) => !a.props.includes(k)).length);
    const { pkg: revised } = reviseCanon(pkg, { kind: "location", locationId: "loc_harbour", patch: { lighting: "harsh noon sun" } });
    const c = await worldReferenceKeys(db, g, "p1", "shot-c", revised, checkContinuity(revised, { sceneId: "scene_11", shotIndex: 1 }));
    expect(c.location[0]).not.toBe(a.location[0]);
    expect(rows.filter((x) => x.kind === "location")).toHaveLength(2);
  });

  it("without an image provider or the table, the gap is recorded — never silent", async () => {
    const pkg = mayaCoatFixture();
    const r = checkContinuity(pkg, { sceneId: "scene_11", shotIndex: 1 });
    const none = await worldReferenceKeys(fakeDb().db, null, "p1", "s", pkg, r, "image generation disabled");
    expect(none.location).toEqual([]);
    expect(none.gaps[0]).toMatchObject({ code: "WORLD_REFERENCE_UNAVAILABLE", refId: "s", detail: { kind: "location", id: "loc_harbour", reason: "image generation disabled" } });
    const missing = await worldReferenceKeys(fakeDb({ missing: true }).db, fakeImage().g, "p1", "s", pkg, r);
    expect(missing.gaps[0]!.detail).toMatchObject({ reason: "world_references not migrated (0052)" });
  });

  it("places and props join the reference pack after the people, and are listed when they do not fit", () => {
    const p = assembleReferencePack({ seed: "seed", wardrobe: ["w"], identity: ["i"], location: ["loc"], props: ["prop"], max: 4 });
    expect(p.keys).toEqual(["seed", "w", "i", "loc"]);
    expect(p.roles).toMatchObject({ loc: "location" });
    expect(p.dropped).toEqual(["prop"]);
  });
});
