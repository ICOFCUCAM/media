import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import { dependents, shotDependencies } from "./dependencies";
import { reviseCanon } from "./revise";

describe("dependency edges (W8)", () => {
  const pkg = mayaCoatFixture();
  const deps = shotDependencies(pkg);

  it("every shot depends on its location, its subjects and their wardrobe", () => {
    expect(deps).toHaveLength(pkg.scenes.reduce((n, s) => n + s.shots.length, 0));
    for (const d of deps) {
      const sc = pkg.scenes[d.sceneIndex]!;
      const sh = sc.shots.find((s) => s.index === d.shotIndex)!;
      expect(d.edges).toContainEqual({ type: "location", key: sc.locationId });
      for (const id of sh.subjectIds.filter((x) => x.startsWith("char_"))) {
        expect(d.edges).toContainEqual({ type: "character", key: id });
        const w = sc.characters.find((c) => c.characterId === id)?.wardrobeId;
        if (w) expect(d.edges).toContainEqual({ type: "wardrobe", key: w });
      }
    }
  });

  it("no duplicate edges", () => {
    for (const d of deps) expect(new Set(d.edges.map((e) => `${e.type}:${e.key}`)).size).toBe(d.edges.length);
  });

  it("a wardrobe rewrite touches only shots the edges point at", () => {
    const wardrobe = "wardrobe_red_coat";
    const rev = reviseCanon(pkg, { kind: "wardrobe_description", characterId: "char_maya", wardrobeId: wardrobe, description: "a yellow raincoat" });
    const edgeShots = new Set(dependents(deps, "wardrobe", wardrobe).map((s) => `${s.sceneIndex}#${s.shotIndex}`));
    expect(rev.affectedShots.length).toBeGreaterThan(0);
    for (const s of rev.affectedShots) expect(edgeShots.has(`${s.sceneIndex}#${s.shotIndex}`)).toBe(true);
  });
});
