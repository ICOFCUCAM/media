import { describe, expect, it } from "vitest";
import { fixturePackage, mayaCoatFixture } from "../ir/fixture";
import { reviseCanon } from "../world/revise";
import { canonicalHash, compileGeneration } from "./canonical";
import { compileFor, MODEL_PROFILES } from "./compilers";

describe("canonical media request (Part 1 §14)", () => {
  it("carries intent, camera, environment, style, continuity and sound from canon", () => {
    const r = compileGeneration(mayaCoatFixture(), "scene_11", 1);
    expect(r.shotId).toBe("scene_11_shot01");
    expect(r.visualIntent.subjects).toEqual([expect.objectContaining({ id: "char_maya", kind: "character", name: "Maya", holding: ["Sealed key"] })]);
    expect(r.visualIntent.subjects[0]!.look).toContain("wearing long red wool coat");
    expect(r.camera).toMatchObject({ size: "MS", movement: "static", lens: "35mm", side: "A", screenDirection: "left" });
    expect(r.environment).toMatchObject({ locationId: "loc_harbour", timeOfDay: "night", storyDay: 2, flashback: false });
    expect(r.continuity.requiredReferences).toEqual(expect.arrayContaining([{ kind: "wardrobe", id: "wardrobe_red_coat", characterId: "char_maya" }]));
    expect(r.audio).toEqual({ ambience: "rain on stone", music: "low strings", sfx: ["foghorn"] });
  });

  it("is deterministic, and changes exactly when the depicted canon changes", () => {
    const a = canonicalHash(compileGeneration(mayaCoatFixture(), "scene_11", 1));
    expect(canonicalHash(compileGeneration(mayaCoatFixture(), "scene_11", 1))).toBe(a);
    const blue = reviseCanon(mayaCoatFixture(), { kind: "scene_wardrobe", sceneId: "scene_12", characterId: "char_maya", wardrobe: { id: "wardrobe_blue_coat", description: "long blue wool coat" } }).pkg;
    expect(canonicalHash(compileGeneration(blue, "scene_11", 1))).not.toBe(a);
    // Ewan's shot in the same scene is unaffected by Maya's coat.
    expect(canonicalHash(compileGeneration(blue, "scene_11", 2))).toBe(canonicalHash(compileGeneration(mayaCoatFixture(), "scene_11", 2)));
  });
});

describe("model-specific compilers (Part 1 §13)", () => {
  const req = compileGeneration(fixturePackage(), "scene_01", 1);

  it("Wan: subject and action first, then place, camera move, light and look; negative prompt", () => {
    const w = compileFor("wan-2.1", req);
    expect(w.prompt.indexOf("Maya")).toBe(0);
    expect(w.prompt.indexOf("The Harbour")).toBeGreaterThan(w.prompt.indexOf("Maya"));
    expect(w.prompt).toContain("medium shot, eye-level, 35mm lens; the camera holds still");
    expect(w.negativePrompt).toContain("morphing face");
    expect(w.dropped).toEqual([]);
  });

  it("OpenAI image: a structured still — no motion, constraints and intended use; motion is reported as dropped", () => {
    const moving = { ...req, camera: { ...req.camera, movement: "dolly" } };
    const o = compileFor("openai-image", moving);
    expect(o.prompt).toMatch(/^Scene: The Harbour/);
    expect(o.prompt).toContain("Constraints: keep every listed face, hairstyle, mark and garment exactly as described");
    expect(o.prompt).toContain("Intended use: the first frame of a 5-second film shot.");
    expect(o.prompt).not.toContain("dollies");
    expect(o.negativePrompt).toBeNull();
    expect(o.dropped).toEqual(["camera movement (dolly) — a still has none"]);
  });

  it("respects each model's prompt limit by dropping the lowest-priority parts first, and says so", () => {
    const long = { ...req, environment: { ...req.environment, description: "x".repeat(2000) } };
    const w = compileFor("wan-2.1", long);
    expect(w.prompt.length).toBeLessThanOrEqual(MODEL_PROFILES["wan-2.1"]!.maxPromptChars);
    expect(w.prompt.startsWith("Maya")).toBe(true); // the subject survives
    expect(w.dropped.length).toBeGreaterThan(0);
  });

  it("an unknown registered model gets the default profile and reports what it cannot take", () => {
    const x = compileFor("fal-kling", req);
    expect(x.negativePrompt).toBeNull();
    expect(x.dropped).toContain("negative prompt (not supported)");
    expect(x.hash).not.toBe(compileFor("wan-2.1", req).hash);
  });
});
