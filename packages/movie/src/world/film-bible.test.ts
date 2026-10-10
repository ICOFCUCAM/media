import { describe, expect, it } from "vitest";
import { fixturePackage } from "../ir/fixture";
import { reviseCanon } from "./revise";

function film() {
  const p = fixturePackage();
  for (const sc of p.scenes) sc.shots[2]!.screenDirection = "left";
  return p;
}
const shotCount = (p: ReturnType<typeof film>) => p.scenes.reduce((n, s) => n + s.shots.length, 0);

describe("the Film Bible edited (W27)", () => {
  it("story fields change the canon and no media", () => {
    const r = reviseCanon(film(), { kind: "film_bible", patch: { logline: "A keeper hides a stranger from the storm.", themes: ["trust", "isolation"], premise: null } });
    expect(r.issues).toEqual([]);
    expect(r.pkg.film).toMatchObject({ logline: "A keeper hides a stranger from the storm.", themes: ["trust", "isolation"], premise: null });
    expect(r.affectedShots).toEqual([]);
    expect(r.audio).toEqual({ revoice: [], rescore: false, ambience: [] });
    expect(r.toVersion).not.toBe(r.fromVersion);
  });

  it("a new look regenerates the shots it changes, and was predicted", () => {
    const p = film();
    const r = reviseCanon(p, { kind: "film_bible", patch: { visualStyle: { palette: "bleached greys and one red" } } });
    expect(r.pkg.film.visualStyle).toMatchObject({ palette: "bleached greys and one red", texture: p.film.visualStyle.texture });
    expect(r.affectedShots).toHaveLength(shotCount(p));
    expect(r.predicted.shots).toHaveLength(shotCount(p));
  });

  it("a new score style recomposes the score; a new ambience redraws every bed", () => {
    const p = film();
    const r = reviseCanon(p, { kind: "film_bible", patch: { audioStyle: { score: "solo cello", ambience: "dry desert wind" } } });
    expect(r.audio.rescore).toBe(true);
    expect(r.audio.ambience).toHaveLength(p.scenes.length);
    expect(r.affectedShots).toEqual([]);
  });
});
