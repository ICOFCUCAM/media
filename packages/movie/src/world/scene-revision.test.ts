import { describe, expect, it } from "vitest";
import { fixturePackage } from "../ir/fixture";
import { pruneChange } from "../intelligence/interpret";
import { reviseCanon } from "./revise";

/** The fixture with clean film grammar (Maya keeps facing left), so only the revision is judged. */
function film() {
  const p = fixturePackage();
  for (const sc of p.scenes) sc.shots[2]!.screenDirection = "left";
  return p;
}

describe('multi-department scene revisions (W25; Part 1 §45 "make scene 7 darker")', () => {
  it("tone, cinematography and lighting change in one scene; only its shots regenerate", () => {
    const r = reviseCanon(film(), {
      kind: "scene_revision", sceneId: "scene_02",
      revision: {
        emotionalArc: { start: "uneasy", middle: "dread", end: "shaken" },
        lighting: "one sodium lamp, deep shadow, faces half lit",
        shots: [{ index: 1, angle: "low", movement: "handheld" }, { index: 3, size: "ECU" }],
      },
    });
    expect(r.issues).toEqual([]);
    const sc = r.pkg.scenes[1]!;
    expect(sc.emotionalArc).toEqual({ start: "uneasy", middle: "dread", end: "shaken" });
    expect(sc.shots.every((s) => s.lighting === "one sodium lamp, deep shadow, faces half lit")).toBe(true);
    expect(sc.shots[1]).toMatchObject({ angle: "low", movement: "handheld" });
    expect(new Set(r.affectedShots.map((s) => s.sceneId))).toEqual(new Set(["scene_02"]));
    expect(r.affectedShots).toHaveLength(4);
    expect(r.predicted.shots).toHaveLength(4);
    // The mood is part of the score's brief: it is composed again; no line changed, nothing is voiced again.
    expect(r.audio).toEqual({ revoice: [], rescore: true, ambience: [] });
    expect(r.pkg.scenes[0]).toEqual(film().scenes[0]);
  });

  it("music, ambience and a line: the sound departments know what to make again", () => {
    const r = reviseCanon(film(), {
      kind: "scene_revision", sceneId: "scene_01",
      revision: { music: null, ambience: "wind through rigging, distant bell", dialogue: [{ index: 0, line: "Ten minutes. Then the bridge is gone.", emotion: "grim" }] },
    });
    expect(r.issues).toEqual([]);
    expect(r.pkg.scenes[0]!.audio).toMatchObject({ music: null, ambience: "wind through rigging, distant bell" });
    expect(r.pkg.scenes[0]!.dialogue[0]).toMatchObject({ line: "Ten minutes. Then the bridge is gone.", emotion: "grim", references: ["fact_bridge_swings"] });
    expect(r.audio).toEqual({ revoice: ["scene_01"], rescore: true, ambience: ["scene_01"] });
    expect(r.affectedScenes).toContain("scene_01");
    expect(new Set(r.affectedShots.map((s) => s.sceneId))).toEqual(new Set(["scene_01"]));
  });

  it("a revision that breaks film grammar is refused like any canon change", () => {
    const r = reviseCanon(film(), { kind: "scene_revision", sceneId: "scene_01", revision: { shots: [{ index: 2, angle: "eye" }, { index: 3, angle: "eye" }] } });
    expect(r.issues).toEqual([]);
    const bad = film();
    bad.scenes[0]!.shots[1]!.side = "B"; // A → B with no neutral shot between
    expect(reviseCanon(bad, { kind: "scene_revision", sceneId: "scene_01", revision: { lighting: "dim" } }).issues.map((i) => i.code)).toContain("CROSSES_LINE");
  });

  it("an unknown shot or line is an error, not a silent no-op", () => {
    expect(() => reviseCanon(film(), { kind: "scene_revision", sceneId: "scene_01", revision: { shots: [{ index: 9, size: "CU" }] } })).toThrow(/no shot 9/);
    expect(() => reviseCanon(film(), { kind: "scene_revision", sceneId: "scene_01", revision: { dialogue: [{ index: 5, line: "x" }] } })).toThrow(/no line 5/);
  });

  it("pruning a model's revision keeps a deliberate null music and drops empty shot entries", () => {
    expect(pruneChange({
      kind: "scene_revision", sceneId: "scene_02",
      revision: { music: null, lighting: "", ambience: "", emotionalArc: null, shots: [{ index: 1, size: "", angle: "low" }, { index: 2, size: "" }], dialogue: [] },
    })).toEqual({ kind: "scene_revision", sceneId: "scene_02", revision: { music: null, shots: [{ index: 1, angle: "low" }] } });
  });
});
