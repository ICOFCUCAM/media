import { describe, expect, it } from "vitest";
import { applyEdits, fixturePackage, type EditOperation } from "@cineforge/movie";
import { withCut } from "../ffmpeg/render-engine";
import { planApply, processEditorialReview, type ReviewDeps, type SceneRowRef } from "./editorial";

const pkg = fixturePackage();
const rows: SceneRowRef[] = pkg.scenes.map((sc, i) => ({
  id: `row-${sc.id}`, index: i, key: sc.id, lockedAt: null,
  shots: sc.shots.map((h) => ({ id: `${sc.id}-s${h.index}`, index: h.index, source: "image" })),
}));
const r = "tighter";

describe("the Editor's edits reach the rows exactly (W13)", () => {
  it("cut, trim, insert and remove-line become deletes, re-cuts, a new shot and a re-voice — nothing else", () => {
    const ops: EditOperation[] = [
      { op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 3, reason: r },
      { op: "CUT_SHOT", sceneId: "scene_01", shotIndex: 2, reason: r },
      { op: "ADD_INSERT", sceneId: "scene_02", afterShotIndex: 0, subjectId: "prop_key", action: "The key.", durationSec: 2, reason: r },
      { op: "REMOVE_LINE", sceneId: "scene_02", lineIndex: 0, reason: "repeats" },
    ];
    const plan = planApply(applyEdits(pkg, ops), rows);
    expect(plan.remove).toEqual(["scene_01-s2"]);
    expect(plan.shots).toEqual([
      { shotId: "scene_01-s0", sceneId: "row-scene_01", to: 0, durationSec: 3, mode: "recut" },
      { shotId: "scene_01-s3", sceneId: "row-scene_01", to: 2, durationSec: 4, mode: "recut" },
      { shotId: "scene_02-s1", sceneId: "row-scene_02", to: 2, durationSec: 5, mode: "recut" },
      { shotId: "scene_02-s2", sceneId: "row-scene_02", to: 3, durationSec: 4, mode: "recut" },
      { shotId: "scene_02-s3", sceneId: "row-scene_02", to: 4, durationSec: 4, mode: "recut" },
    ]);
    expect(plan.create).toEqual([{ sceneId: "row-scene_02", sceneKey: "scene_02", to: 1, durationSec: 2, source: "image" }]);
    expect(plan.revoice).toEqual(["row-scene_02"]);
    expect(plan.sceneIndex).toEqual([]);
    expect(plan.touched.sort()).toEqual(["row-scene_01", "row-scene_02"]);
  });

  it("an extension regenerates that shot only", () => {
    const plan = planApply(applyEdits(pkg, [{ op: "EXTEND_SHOT", sceneId: "scene_02", shotIndex: 3, toSec: 5, reason: r }]), rows);
    expect(plan.shots).toEqual([{ shotId: "scene_02-s3", sceneId: "row-scene_02", to: 3, durationSec: 5, mode: "regenerate" }]);
    expect(plan.touched).toEqual(["row-scene_02"]);
  });

  it("the render trims a clip to the editor's cut, and leaves uncut clips whole", () => {
    const args = ["-i", "raw.mp4", "-c:v", "libx264", "out.mp4"];
    expect(withCut(args, 3)).toEqual(["-i", "raw.mp4", "-c:v", "libx264", "-t", "3.000", "out.mp4"]);
    expect(withCut(args, null)).toBe(args);
  });
});

describe("editorial review runner", () => {
  const base = (over: Partial<ReviewDeps> = {}) => {
    const saved: Parameters<ReviewDeps["save"]>[1][] = [];
    const d: ReviewDeps = {
      claim: async () => true,
      loadPackage: async () => ({ pkg, maxShotSec: 5 }),
      available: () => true,
      review: async () => ({
        summary: "Tighter opening.", findings: [{ question: "opening", verdict: "needs_work", note: "slow" }], dropped: [],
        proposals: [{ op: { op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 3, reason: r }, description: "Trim scene_01 shot 1 to 3s",
          effect: { shots: [], revoice: [], reordered: false, deltaSec: -2, regenerate: 0, recut: 1, remove: 0 } }],
        provider: "anthropic", model: "m",
      }),
      save: async (_id, o) => { saved.push(o); },
      ...over,
    };
    return { d, saved };
  };

  it("stores findings and numbered proposals against the cut it reviewed", async () => {
    const t = base();
    expect(await processEditorialReview({ id: "r1", projectId: "p1", instruction: "faster opening" }, t.d)).toBe("ready");
    expect(t.saved[0]).toMatchObject({ status: "ready", summary: "Tighter opening.", proposals: [{ position: 0, description: "Trim scene_01 shot 1 to 3s" }] });
    expect(t.saved[0]!.canonVersion).toMatch(/\S/);
  });

  it("fails with the reason when there is no plan or no model — never guesses", async () => {
    const a = base({ loadPackage: async () => null });
    expect(await processEditorialReview({ id: "r1", projectId: "p1", instruction: null }, a.d)).toBe("failed");
    expect(a.saved[0]!.error).toMatch(/no planned film/);
    const b = base({ available: () => false });
    expect(await processEditorialReview({ id: "r1", projectId: "p1", instruction: null }, b.d)).toBe("failed");
    expect(b.saved[0]!.error).toMatch(/No editing model/);
  });

  it("skips a review another worker claimed", async () => {
    const t = base({ claim: async () => false });
    expect(await processEditorialReview({ id: "r1", projectId: "p1", instruction: null }, t.d)).toBe("skipped");
    expect(t.saved).toEqual([]);
  });
});
