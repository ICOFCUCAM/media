import { describe, expect, it } from "vitest";
import { fixturePackage } from "../ir/fixture";
import { applyEdits, describeEdit, EditOperation, EditRejected, editIssues, type EditOperation as Op } from "./operations";

const r = "tighter";
const codes = (ops: Op[]) => {
  try {
    applyEdits(fixturePackage(), ops);
    return [];
  } catch (e) {
    if (!(e instanceof EditRejected)) throw e;
    return e.issues.map((i) => i.code);
  }
};

describe("structured edit operations (Part 1 §21.2–21.3)", () => {
  it("the fixture is a valid film to edit", () => {
    expect(editIssues(fixturePackage())).toEqual([]);
  });

  it("CUT_SHOT removes a shot; the rest are re-cut into place, the other scene is untouched", () => {
    const out = applyEdits(fixturePackage(), [{ op: "CUT_SHOT", sceneId: "scene_01", shotIndex: 1, reason: r }]);
    expect(out.pkg.scenes[0]!.shots.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(out.shots.filter((s) => s.sceneId === "scene_01").map((s) => [s.from, s.to, s.action])).toEqual([
      [0, 0, "keep"], [1, null, "remove"], [2, 1, "recut"], [3, 2, "recut"],
    ]);
    expect(out.shots.filter((s) => s.sceneId === "scene_02").every((s) => s.action === "keep")).toBe(true);
    expect(out.afterSec).toBe(out.beforeSec - 5);
  });

  it("TRIM is a re-cut of the same clip; EXTEND needs new frames", () => {
    const out = applyEdits(fixturePackage(), [
      { op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 3, reason: r },
      { op: "EXTEND_SHOT", sceneId: "scene_02", shotIndex: 2, toSec: 6, reason: r },
    ]);
    expect(out.shots.find((s) => s.sceneId === "scene_01" && s.from === 0)).toMatchObject({ action: "recut", durationSec: 3 });
    expect(out.shots.find((s) => s.sceneId === "scene_02" && s.from === 2)).toMatchObject({ action: "regenerate", durationSec: 6 });
    expect(codes([{ op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 5, reason: r }])).toEqual(["NOT_SHORTER"]);
    expect(codes([{ op: "EXTEND_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 4, reason: r }])).toEqual(["NOT_LONGER"]);
  });

  it("SHORTEN_SCENE takes time from the last shots first, never below 2 s a shot", () => {
    const out = applyEdits(fixturePackage(), [{ op: "SHORTEN_SCENE", sceneId: "scene_01", toSec: 13, reason: r }]);
    expect(out.pkg.scenes[0]!.shots.map((s) => s.durationSec)).toEqual([5, 4, 2, 2]);
    expect(out.shots.filter((s) => s.action === "recut").map((s) => s.from)).toEqual([1, 2, 3]);
    expect(codes([{ op: "SHORTEN_SCENE", sceneId: "scene_01", toSec: 2, reason: r }])).toContain("CANNOT_SHORTEN");
  });

  it("ADD_INSERT adds a new shot to generate; numbers in later operations still mean the reviewed film", () => {
    const out = applyEdits(fixturePackage(), [
      { op: "ADD_INSERT", sceneId: "scene_01", afterShotIndex: 0, subjectId: "prop_key", action: "The key glints in Maya's palm.", durationSec: 2, reason: r },
      // Shot 3 of the reviewed film is now at position 4 — the operation still means it.
      { op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 3, toSec: 3, reason: r },
    ]);
    const sc = out.pkg.scenes[0]!;
    expect(sc.shots[1]).toMatchObject({ index: 1, size: "INSERT", subjectIds: ["prop_key"], durationSec: 2 });
    expect(sc.shots[4]!.durationSec).toBe(3);
    expect(out.shots.find((s) => s.from === null)).toMatchObject({ sceneId: "scene_01", to: 1, action: "regenerate" });
    expect(out.shots.find((s) => s.sceneId === "scene_01" && s.from === 3)).toMatchObject({ to: 4, action: "recut", durationSec: 3 });
  });

  it("a shot an earlier operation cut cannot be edited again", () => {
    expect(codes([
      { op: "CUT_SHOT", sceneId: "scene_01", shotIndex: 2, reason: r },
      { op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 2, toSec: 2, reason: r },
    ])).toEqual(["UNKNOWN_SHOT"]);
  });

  it("REMOVE_LINE drops a line and re-voices only that scene", () => {
    const out = applyEdits(fixturePackage(), [{ op: "REMOVE_LINE", sceneId: "scene_02", lineIndex: 0, reason: "repeats scene 1" }]);
    expect(out.pkg.scenes[1]!.dialogue).toHaveLength(0);
    expect(out.revoice).toEqual(["scene_02"]);
    expect(out.shots.every((s) => s.action === "keep")).toBe(true);
    expect(codes([{ op: "REMOVE_LINE", sceneId: "scene_02", lineIndex: 4, reason: r }])).toEqual(["UNKNOWN_LINE"]);
  });

  it("MOVE_SCENE reorders, keeps acts in order, and the story validator still decides", () => {
    // Moving the payoff scene before its setup breaks the story: the edit is refused with the reason.
    const bad = codes([{ op: "MOVE_SCENE", sceneId: "scene_02", afterSceneId: null, reason: r }]);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.some((c) => /SETUP|PAYOFF|ACT|REVEAL|ORDER|TIME|KNOW/i.test(c))).toBe(true);
    expect(codes([{ op: "MOVE_SCENE", sceneId: "scene_01", afterSceneId: "scene_01", reason: r }])).toEqual(["MOVE_SELF"]);
  });

  it("lines are never cut short: an edit that leaves a scene too short for its lines is refused", () => {
    const p = fixturePackage();
    p.scenes[0]!.dialogue[0]!.line = Array.from({ length: 30 }, () => "word").join(" ");
    expect(() => applyEdits(p, [{ op: "SHORTEN_SCENE", sceneId: "scene_01", toSec: 9, reason: r }])).toThrow(/never cut/);
  });

  it("names that do not exist are refused, all at once", () => {
    expect(codes([
      { op: "CUT_SHOT", sceneId: "scene_09", shotIndex: 0, reason: r },
      { op: "CUT_SHOT", sceneId: "scene_01", shotIndex: 9, reason: r },
    ])).toEqual(["UNKNOWN_SCENE", "UNKNOWN_SHOT"]);
  });

  it("the input film is never changed", () => {
    const p = fixturePackage();
    const before = JSON.stringify(p);
    applyEdits(p, [{ op: "CUT_SHOT", sceneId: "scene_01", shotIndex: 0, reason: r }, { op: "REMOVE_LINE", sceneId: "scene_01", lineIndex: 0, reason: r }]);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("operations are a closed, typed vocabulary with a description for people", () => {
    expect(EditOperation.safeParse({ op: "SPEED_UP_MUSIC", sceneId: "scene_01", reason: r }).success).toBe(false);
    expect(EditOperation.safeParse({ op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 1, reason: r }).success).toBe(false);
    expect(describeEdit({ op: "CUT_SHOT", sceneId: "scene_01", shotIndex: 2, reason: r })).toBe("Cut scene_01 shot 3");
  });
});
