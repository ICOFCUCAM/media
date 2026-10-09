import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import { validateCanon } from "../ir/validate";
import { cinemaAdvisories, cinemaIssues } from "./engine";

describe("Cinematography Engine (Part 1 §11, §32.5)", () => {
  it("the Maya film keeps the line and its reverses meet", () => {
    expect(cinemaIssues(mayaCoatFixture())).toEqual([]);
  });

  it("180°: cutting straight across the line fails; a neutral shot in between is fine", () => {
    const p = mayaCoatFixture();
    p.scenes[1]!.shots[2]!.side = "B";
    p.scenes[1]!.shots[2]!.screenDirection = "right";
    expect(cinemaIssues(p).map((i) => i.code)).toContain("CROSSES_LINE");
    expect(validateCanon(p).map((i) => `${i.stage}/${i.code}`)).toContain("cinema/CROSSES_LINE");
    p.scenes[1]!.shots[1]!.side = "neutral"; // the camera crosses on a neutral shot…
    p.scenes[1]!.shots[3]!.side = "B"; // …and stays on side B after it
    expect(cinemaIssues(p).filter((i) => i.path.startsWith("scenes[1]"))).toEqual([]);
  });

  it("eyelines in a reverse must oppose", () => {
    const p = mayaCoatFixture();
    p.scenes[1]!.shots[2]!.screenDirection = "left"; // Ewan now looks the same way as Maya
    expect(cinemaIssues(p)).toEqual([expect.objectContaining({ code: "EYELINE_MISMATCH", path: "scenes[1].shots[2].screenDirection" })]);
  });

  it("grammar advisories are recorded, never failing", () => {
    const p = mayaCoatFixture();
    p.scenes[0]!.shots[0]!.size = "MS"; // a new place, no establishing shot
    p.scenes[0]!.shots.forEach((s) => { s.size = "MS"; });
    p.scenes[2]!.shots[0]!.size = "WS";
    p.scenes[2]!.shots[1]!.size = "ECU";
    const codes = cinemaAdvisories(p).map((a) => `${a.sceneId}/${a.code}`);
    expect(codes).toEqual(expect.arrayContaining(["scene_10/NO_ESTABLISHING_SHOT", "scene_10/SIZE_REPEAT", "scene_12/SIZE_JUMP"]));
    expect(cinemaIssues(p)).toEqual([]);
  });

  it("plans without side / direction (before W4) are not judged on them", () => {
    const p = mayaCoatFixture();
    p.scenes.forEach((s) => s.shots.forEach((sh) => { sh.side = null; sh.screenDirection = null; }));
    expect(cinemaIssues(p)).toEqual([]);
  });
});
