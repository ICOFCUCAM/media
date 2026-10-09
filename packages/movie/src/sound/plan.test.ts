import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import { placeCue, sceneSoundPlan } from "./plan";

describe("the sound plan (Part 1 §18)", () => {
  it("each scene gets an ambience bed from its plan, place and hour — never music or voices", () => {
    const p = sceneSoundPlan(mayaCoatFixture(), 0)!;
    expect(p.sceneId).toBe("scene_10");
    expect(p.ambience!.prompt).toMatch(/^Ambient soundscape, no music, no voices, no speech: rain on stone/);
    expect(p.ambience!.prompt).toContain("night");
    expect(p.ambience!.seconds).toBeGreaterThanOrEqual(5);
    expect(p.ambience!.seconds).toBeLessThanOrEqual(30);
  });

  it("an effect is anchored to the shot whose action it belongs to; others are spread through the scene", () => {
    const pkg = mayaCoatFixture();
    const sc = pkg.scenes[1]!;
    sc.shots[2]!.action = "Ewan slams the warehouse door behind him";
    sc.audio.sfx = ["door slam", "distant thunder"];
    const p = sceneSoundPlan(pkg, 1)!;
    const start2 = sc.shots[0]!.durationSec + sc.shots[1]!.durationSec;
    expect(p.sfx[0]).toMatchObject({ cue: "door slam", shotIndex: sc.shots[2]!.index, anchor: "shot_action", atSec: start2 + 0.4 });
    expect(p.sfx[0]!.prompt).toMatch(/^Sound effect, isolated, no music, no voices: door slam/);
    expect(p.sfx[1]).toMatchObject({ cue: "distant thunder", shotIndex: null, anchor: "spread" });
    expect(p.sfx[1]!.atSec).toBeCloseTo((p.plannedSec * 2) / 3, 1);
  });

  it("caps effects per scene and skips empty cues; a missing scene has no plan", () => {
    const pkg = mayaCoatFixture();
    pkg.scenes[0]!.audio.sfx = ["a1", " ", "a2", "a3", "a4", "a5"];
    expect(sceneSoundPlan(pkg, 0, { maxSfxPerScene: 2 })!.sfx.map((s) => s.cue)).toEqual(["a1", "a2"]);
    expect(sceneSoundPlan(pkg, 99)).toBeNull();
  });

  it("a cue lands where its shot lands in the rendered scene, and never runs past the end", () => {
    expect(placeCue(6, 12, 18)).toBe(9);
    expect(placeCue(11, 12, 12, 3)).toBe(9);
    expect(placeCue(2, 0, 10)).toBe(0);
  });
});
