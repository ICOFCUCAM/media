import { beforeEach, describe, expect, it } from "vitest";
import { compileFilm, mayaCoatFixture, type FilmPackage } from "@cineforge/movie";
import { _resetCanonState, applyCanonRevision, CanonUnavailableError, previewCanonRevision, type CanonDb } from "./revision";

const PROJECT = "11111111-1111-4111-8111-111111111111";

/** An in-memory project planned from the Maya film: every shot READY with media. */
function fakeDb(pkg: FilmPackage, opts: { revisionsTable?: boolean } = {}) {
  const compiled = compileFilm(pkg);
  const chars = compiled.characters.map((c, i) => ({ id: `char-row-${i}`, name: c.name }));
  const scenes = compiled.scenes.map((sc) => ({
    id: `scene-row-${sc.index}`,
    index: sc.index,
    statePatch: {} as unknown,
    shots: sc.shots.map((sh) => ({
      id: `shot-${sc.index}-${sh.index}`, index: sh.index, prompt: sh.prompt, cacheKey: `old-${sc.index}-${sh.index}`,
      status: "READY", videoKey: `clips/${sc.index}-${sh.index}.mp4`, thumbnailKey: "t.jpg", qcScore: 0.9, attempts: 1,
      seedImageKey: sh.index === 1 && sc.index === 1 ? `projects/${PROJECT}/seeds/shot-1-1.png` : sh.index === 1 ? "uploads/creator-seed.png" : null,
    })),
  }));
  const state = { raw: { irVersion: 1, package: pkg, plan: { provider: "anthropic" } } as Record<string, unknown>, revisions: [] as Record<string, unknown>[], scenes };
  const db: CanonDb = {
    screenplay: {
      findUnique: async () => ({ raw: state.raw }),
      update: async (a) => { state.raw = (a as { data: { raw: Record<string, unknown> } }).data.raw; return {}; },
    },
    project: { findUniqueOrThrow: async () => ({ modelId: "wan-2.1", resolution: "720p", aspectRatio: "16:9" }) },
    character: { findMany: async () => chars },
    scene: {
      findMany: async () => scenes,
      update: async (a) => {
        const { where, data } = a as { where: { id: string }; data: { statePatch: unknown } };
        scenes.find((s) => s.id === where.id)!.statePatch = data.statePatch;
        return {};
      },
    },
    shot: {
      update: async (a) => {
        const { where, data } = a as { where: { id: string }; data: Record<string, unknown> };
        const shot = scenes.flatMap((s) => s.shots).find((s) => s.id === where.id)!;
        Object.assign(shot, data);
        return {};
      },
    },
    canonRevision: {
      create: async (a) => {
        if (opts.revisionsTable === false) throw Object.assign(new Error("relation \"canon_revisions\" does not exist"), { code: "P2021" });
        state.revisions.push(a.data);
        return {};
      },
    },
    $transaction: (fn) => fn(db),
  };
  return { db, state };
}

const blueCoat = {
  kind: "scene_wardrobe" as const, sceneId: "scene_12", characterId: "char_maya",
  wardrobe: { id: "wardrobe_blue_coat", description: "long blue wool coat" },
};

describe("canon revision in production (Part 2 §62.9)", () => {
  beforeEach(() => _resetCanonState());

  it("INTEGRATION: change Maya's coat → affected shots invalidated and re-keyed, unaffected shots keep their media", async () => {
    const { db, state } = fakeDb(mayaCoatFixture());
    const r = await applyCanonRevision(db, PROJECT, blueCoat, { actor: "user:owner" });
    expect(r.outcome).toBe("applied");
    expect(r.affectedScenes).toEqual(["scene_11", "scene_12"]);
    expect(r.invalidatedShotIds).toEqual(["shot-1-1", "shot-2-1"]);

    const shots = state.scenes.flatMap((s) => s.shots);
    for (const s of shots) {
      if (r.invalidatedShotIds.includes(s.id)) {
        // Old media dropped, new generation keyed on the new canon → a new job, no stale cache hit.
        expect(s).toMatchObject({ status: "PENDING", videoKey: null, thumbnailKey: null, qcScore: null, attempts: 0 });
        expect(s.prompt).toContain("wearing long blue wool coat");
        expect(s.cacheKey).not.toMatch(/^old-/);
      } else {
        expect(s).toMatchObject({ status: "READY", videoKey: expect.stringMatching(/^clips\//), cacheKey: expect.stringMatching(/^old-/) });
      }
    }
    // A generated seed frame is stale and dropped; a creator's uploaded seed is kept.
    expect(shots.find((s) => s.id === "shot-1-1")!.seedImageKey).toBeNull();
    expect(shots.find((s) => s.id === "shot-2-1")!.seedImageKey).toBe("uploads/creator-seed.png");
    // Continuity rows carry the new wardrobe for the engine; scene 10 is untouched.
    expect(state.scenes[1]!.statePatch).toMatchObject({ characters: { Maya: { id: "char-row-0", key: "char_maya", wardrobe: "long blue wool coat" } } });
    expect(state.scenes[0]!.statePatch).toEqual({});
    // The IR is versioned; the rest of the stored plan record is kept.
    expect(state.raw).toMatchObject({ canonVersion: r.toVersion, revisedFrom: r.fromVersion, plan: { provider: "anthropic" } });
    expect((state.raw.package as FilmPackage).scenes[1]!.characters[0]!.wardrobeId).toBe("wardrobe_blue_coat");
    expect(state.revisions).toEqual([expect.objectContaining({
      projectId: PROJECT, kind: "scene_wardrobe", outcome: "applied", invalidated: 2, affectedScenes: ["scene_11", "scene_12"], actor: "user:owner",
    })]);
  });

  it("a change that breaks canon is rejected and touches nothing", async () => {
    const pkg = mayaCoatFixture();
    pkg.scenes[1]!.characters[0]!.physical = "limping";
    pkg.scenes[2]!.characters[0]!.physical = "limping";
    const { db, state } = fakeDb(pkg);
    const before = JSON.stringify(state.scenes);
    const r = await applyCanonRevision(db, PROJECT, { kind: "physical", sceneId: "scene_12", characterId: "char_maya", physical: null });
    expect(r.outcome).toBe("rejected");
    expect(r.issues.map((i) => i.code)).toEqual(["PHYSICAL_STATE_DROPPED"]);
    expect(JSON.stringify(state.scenes)).toBe(before);
    expect(state.revisions).toEqual([expect.objectContaining({ outcome: "rejected", invalidated: 0, affectedScenes: [] })]);
  });

  it("preview writes nothing; works before migration 0033; refuses projects without Film IR", async () => {
    const { db, state } = fakeDb(mayaCoatFixture(), { revisionsTable: false });
    const p = await previewCanonRevision(db, PROJECT, blueCoat);
    expect(p.affectedShots).toHaveLength(2);
    expect(state.scenes[1]!.shots[1]!.status).toBe("READY");
    const r = await applyCanonRevision(db, PROJECT, blueCoat);
    expect(r.invalidatedShotIds).toHaveLength(2);
    state.raw = { legacy: true };
    await expect(applyCanonRevision(db, PROJECT, blueCoat)).rejects.toBeInstanceOf(CanonUnavailableError);
  });
});
