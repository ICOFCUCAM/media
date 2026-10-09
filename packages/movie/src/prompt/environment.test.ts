import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import type { FilmPackage } from "../ir/schema";
import { reviseCanon } from "../world/revise";
import { previousEndState } from "../world/end-state";
import { canonicalHash, compileGeneration } from "./canonical";
import { compileFor } from "./compilers";

function withEnvironment(): FilmPackage {
  const p = mayaCoatFixture();
  p.scenes[1]!.storyTime = { ...p.scenes[1]!.storyTime!, clock: "22:10" };
  p.scenes[1]!.weather = "heavy rain";
  p.scenes[2]!.storyTime = { ...p.scenes[2]!.storyTime!, clock: "22:25" };
  const sh = p.scenes[1]!.shots.find((s) => s.index === 1)!;
  Object.assign(sh, { composition: "Maya on the left third, the harbour lights behind", depthOfField: "shallow", focus: "rack from the key to Maya's face" });
  return p;
}

describe("environment and shot record in generation (W20)", () => {
  it("clock, sun, weather and the full shot record reach the canonical request and the model prompts", () => {
    const req = compileGeneration(withEnvironment(), "scene_11", 1);
    expect(req.environment).toMatchObject({ clock: "22:10", sun: "night", weather: "heavy rain" });
    expect(req.camera).toMatchObject({ depthOfField: "shallow", focus: "rack from the key to Maya's face" });
    const video = compileFor("hunyuan", req).prompt;
    expect(video).toContain("heavy rain");
    expect(video).toContain("shallow depth of field");
    expect(compileFor("openai-image", req).prompt).toContain("Maya on the left third");
    // The weather carries into the continuing scene, which did not restate it.
    expect(compileGeneration(withEnvironment(), "scene_12", 1).environment.weather).toBe("heavy rain");
  });

  it("a plan without the new fields compiles exactly as before (no new keys, same prompts)", () => {
    const req = compileGeneration(mayaCoatFixture(), "scene_11", 1);
    expect(Object.keys(req.environment).sort()).toEqual(["description", "flashback", "lighting", "location", "locationId", "storyDay", "timeOfDay"]);
    expect(Object.keys(req.camera)).not.toContain("composition");
  });

  it("each shot knows, structurally, where the shot before it ended", () => {
    const p = withEnvironment();
    const first = (sceneId: string) => Math.min(...p.scenes.find((x) => x.id === sceneId)!.shots.map((x) => x.index));
    expect(previousEndState(p, "scene_10", first("scene_10"))).toBeNull(); // the film's first shot
    const inScene = previousEndState(p, "scene_11", 2)!; // shot 1 frames Maya
    expect(inScene).toMatchObject({ sceneId: "scene_11", shotIndex: 1, location: { id: "loc_harbour" }, light: { clock: "22:10", weather: "heavy rain" } });
    expect(inScene.characters.find((c) => c.id === "char_maya")).toMatchObject({ wardrobe: "long red wool coat" });
    // A continuing scene's first shot picks up from the last shot of the scene it continues.
    const across = previousEndState(p, "scene_12", first("scene_12"))!;
    expect(across.sceneId).toBe("scene_11");
    expect(compileGeneration(p, "scene_12", first("scene_12")).continuity.continuesFrom).toEqual(across);
  });

  it("where the previous shot ended is context, not canon: changing that shot does not invalidate this one", () => {
    const p = withEnvironment();
    const before = canonicalHash(compileGeneration(p, "scene_11", 2));
    const changed = reviseCanon(p, { kind: "scene_wardrobe", sceneId: "scene_12", characterId: "char_maya", wardrobe: { id: "wardrobe_blue_coat", description: "long blue wool coat" } }).pkg;
    const after = compileGeneration(changed, "scene_11", 2);
    expect(after.continuity.continuesFrom).not.toEqual(compileGeneration(p, "scene_11", 2).continuity.continuesFrom);
    expect(canonicalHash(after)).toBe(before);
  });
});
