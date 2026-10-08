import { describe, expect, it } from "vitest";
import { fixturePackage } from "../ir/fixture";
import { compileFilm, NEGATIVE_PROMPT } from "./compile";

describe("Production Compiler (Part 2 §85–86)", () => {
  const out = compileFilm(fixturePackage());

  it("compiles the whole cast and world, not one protagonist and one location", () => {
    expect(out.characters.map((c) => c.key)).toEqual(["char_maya", "char_harbourmaster"]);
    expect(out.characters[0]!.appearance).toBe("angular face, dark brown eyes; short red hair; lean, athletic; marks: scar above left eyebrow");
    expect(out.props).toEqual([{ key: "prop_key", name: "Sealed key", description: "brass key in a wax-sealed pouch", ownerKey: "char_maya" }]);
    expect(out.screenplay.acts).toEqual([
      { act: 1, purpose: "set the stakes", scenes: [0] },
      { act: 2, purpose: "the crossing", scenes: [1] },
    ]);
  });

  it("shot durations and camera come from the plan, not a formula", () => {
    const s = out.scenes[0]!;
    expect(s.shots.map((x) => x.durationSec)).toEqual([5, 5, 4, 4]);
    expect(s.shots[2]!.cameraPlan).toMatchObject({ shotSize: "CU", angle: "eye", movement: "static", lens: "35mm" });
    expect(s.camera).toBe("WS/eye/static · MS/eye/static · CU/eye/static · MCU/eye/static");
  });

  it("shot prompts carry canonical identity and the scene's wardrobe", () => {
    const p1 = out.scenes[0]!.shots[1]!.prompt;
    const p2 = out.scenes[1]!.shots[1]!.prompt;
    expect(p1).toContain("Maya (angular face, dark brown eyes; short red hair");
    expect(p1).toContain("wearing yellow raincoat over black jumper");
    expect(p2).toContain("wearing raincoat torn at the sleeve, soaked; soaked");
    expect(p1).toContain("Setting: The Harbour");
    expect(p1.length).toBeLessThanOrEqual(1500);
    expect(out.scenes[0]!.shots[0]!.negativePrompt).toBe(NEGATIVE_PROMPT);
  });

  it("dialogue is structured by character; continuity is per character", () => {
    const s = out.scenes[0]!;
    expect(s.dialogue).toEqual([{ index: 0, characterKey: "char_harbourmaster", text: "Tide turns in ten minutes.", emotion: "urgent" }]);
    expect(s.dialogueText).toBe("EWAN: Tide turns in ten minutes.");
    expect(s.statePatch.characters.Maya).toEqual({ key: "char_maya", wardrobe: "yellow raincoat over black jumper", emotion: "tense", holding: "Sealed key" });
    expect(out.scenes[1]!.statePatch.characters.Maya!.health).toBe("soaked");
    expect(s.statePatch.world).toEqual({ "story time": "day 1, night" });
    expect(s.bridge.nextSceneRequirements).toBe("Maya crosses as the bridge swings");
    expect(s.characterRef).toBe("Maya");
  });

  it("is deterministic", () => {
    expect(compileFilm(fixturePackage())).toEqual(out);
  });
});
