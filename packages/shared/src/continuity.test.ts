import { describe, it, expect } from "vitest";
import { computeContinuity, renderStatePreamble, autoContinuity, statePatchFrom, type SceneInput } from "./continuity";

const scenes: SceneInput[] = [
  {
    index: 0,
    heading: "King crowned",
    characterRef: "King Adisa",
    worldRef: "Kingdom",
    locationRef: "Royal Palace",
    bridge: {
      whatJustHappened: "Adisa is crowned king",
      whatChanged: "Adisa becomes king",
      whatCarriesForward: "Adisa is king",
      nextSceneRequirements: "Brother plots betrayal",
    },
    statePatch: { characters: { "King Adisa": { mood: "proud" } }, world: { season: "winter" } },
  },
  {
    index: 1,
    heading: "Betrayal",
    characterRef: "King Adisa",
    locationRef: "Royal Palace",
    bridge: {
      whatJustHappened: "Brother betrays Adisa",
      whatChanged: "Trust broken",
      whatCarriesForward: "Adisa is betrayed and angry",
      nextSceneRequirements: "Adisa searches for evidence",
    },
    statePatch: {
      characters: { "King Adisa": { mood: "betrayed" } },
      relationships: { "Adisa->brother": "distrust" },
      goals: { "King Adisa": "find evidence" },
    },
  },
  {
    index: 2,
    heading: "Village burns",
    characterRef: "King Adisa",
    locationRef: "Village",
    bridge: {
      whatJustHappened: "Enemy destroys the village",
      whatChanged: "Village destroyed",
      whatCarriesForward: "Grief and fury",
      nextSceneRequirements: "Council of war",
    },
    statePatch: { locations: { Village: "destroyed" } },
  },
];

describe("continuity engine", () => {
  it("inherits the folded state of all prior scenes", () => {
    const { perScene, final } = computeContinuity(scenes);

    // Scene 0 starts from nothing.
    expect(perScene[0]!.inherited.characters).toEqual({});
    // Scene 1 inherits scene 0's changes.
    expect(perScene[1]!.inherited.characters["King Adisa"]!.mood).toBe("proud");
    expect(perScene[1]!.inherited.world.season).toBe("winter");
    // Scene 2 inherits the betrayal + goal.
    expect(perScene[2]!.inherited.relationships["Adisa->brother"]).toBe("distrust");
    expect(perScene[2]!.inherited.goals["King Adisa"]).toBe("find evidence");
    // Final state knows the village is destroyed and the timeline has 3 beats.
    expect(final.locations.Village).toBe("destroyed");
    expect(final.timeline).toHaveLength(3);
  });

  it("carries the previous bridge forward and links dependencies", () => {
    const { perScene } = computeContinuity(scenes);
    expect(perScene[1]!.bridgeIn?.whatCarriesForward).toContain("king");
    expect(perScene[2]!.dependsOn).toEqual([1]);
    expect(perScene[1]!.affects).toEqual([2]); // scene 2 depends on scene 1
  });

  it("scores well-connected scenes high and penalises contradictions", () => {
    const { perScene } = computeContinuity(scenes);
    expect(perScene[0]!.score).toBe(100);

    // A scene set in the already-destroyed village should be penalised.
    const contradiction = computeContinuity([
      ...scenes,
      { index: 3, heading: "Return to the village", characterRef: "King Adisa", locationRef: "Village", statePatch: { world: { mood: "calm" } } },
    ]);
    const last = contradiction.perScene[3]!;
    expect(last.notes.some((n) => /destroyed/.test(n))).toBe(true);
    expect(last.score).toBeLessThan(perScene[0]!.score);
  });

  it("renders an injectable preamble from the inherited state", () => {
    const { perScene } = computeContinuity(scenes);
    const text = renderStatePreamble(perScene[2]!, scenes[2]!);
    expect(text).toContain("Previous State");
    expect(text).toContain("King Adisa");
    expect(text).toContain("find evidence");
    expect(text).toContain("This scene must");
  });

  it("auto-fills a bridge + state fields from the script, and folds consistently", () => {
    const auto = autoContinuity([
      { index: 0, heading: "Coronation", summary: "Adisa is crowned king in the dead of winter.", character: "Adisa" },
      { index: 1, heading: "Ambush", summary: "His brother betrays him; Adisa is wounded and vows to find the truth.", character: "Adisa", location: "Palace" },
      { index: 2, heading: "Ruin", summary: "The enemy burns the village to the ground.", character: "Adisa", location: "Village" },
    ]);

    expect(auto[0]!.season).toBe("winter");
    expect(auto[0]!.emotion).toBe("triumphant");
    expect(auto[1]!.emotion).toBe("betrayed");
    expect(auto[1]!.health).toBe("injured");
    expect(auto[1]!.goal).toContain("find");
    expect(auto[2]!.locationStatus).toBe("destroyed");
    // The bridge carries the previous beat forward into the next requirement.
    expect(auto[0]!.bridge.nextSceneRequirements).toContain("betrays");

    // The derived patches fold into a consistent, contradiction-aware graph.
    const patch1 = statePatchFrom({ character: "Adisa", emotion: auto[1]!.emotion, health: auto[1]!.health, goal: auto[1]!.goal });
    expect(patch1.characters!.Adisa).toEqual({ emotion: "betrayed", health: "injured" });

    const { perScene } = computeContinuity([
      { index: 0, heading: "Coronation", characterRef: "Adisa", statePatch: statePatchFrom({ character: "Adisa", season: auto[0]!.season }), bridge: auto[0]!.bridge },
      { index: 1, heading: "Ambush", characterRef: "Adisa", locationRef: "Village", statePatch: statePatchFrom({ location: "Village", locationStatus: auto[2]!.locationStatus }), bridge: auto[1]!.bridge },
      { index: 2, heading: "Return", characterRef: "Adisa", locationRef: "Village", bridge: auto[2]!.bridge },
    ]);
    // Scene 2 returns to the destroyed Village → flagged.
    expect(perScene[2]!.notes.some((n) => /destroyed/.test(n))).toBe(true);
  });

  it("carries a visual asset id + wardrobe forward (same character, not 'generate again')", () => {
    const { perScene } = computeContinuity([
      // Scene 0 anchors the character to a stable asset id + wardrobe.
      { index: 0, heading: "Crowned", characterRef: "King Adisa", statePatch: statePatchFrom({ character: "King Adisa", assetId: "adisa_001", wardrobe: "royal_armor_v3" }), bridge: null },
      // Scene 1 only changes mood — the visual anchors must still be inherited.
      { index: 1, heading: "Betrayed", characterRef: "King Adisa", statePatch: statePatchFrom({ character: "King Adisa", emotion: "betrayed" }), bridge: null },
      { index: 2, heading: "War", characterRef: "King Adisa", bridge: null },
    ]);

    expect(perScene[1]!.inherited.characters["King Adisa"]).toMatchObject({ id: "adisa_001", wardrobe: "royal_armor_v3" });
    const c2 = perScene[2]!.inherited.characters["King Adisa"]!;
    expect(c2.id).toBe("adisa_001"); // same asset id 3 scenes later
    expect(c2.wardrobe).toBe("royal_armor_v3");
    expect(c2.emotion).toBe("betrayed");
    expect(renderStatePreamble(perScene[2]!)).toContain("adisa_001");
  });

  it("never writes database ids or canon keys into the prompt preamble", () => {
    const { perScene } = computeContinuity([
      { index: 0, heading: "Quay", characterRef: "Maya", bridge: null,
        statePatch: { characters: { Maya: { id: "3f2b8c1e-9d4a-4b7e-8f00-123456789abc", key: "char_maya", wardrobe: "red coat" } } } },
      { index: 1, heading: "Bridge", characterRef: "Maya", bridge: null },
    ]);
    const text = renderStatePreamble(perScene[1]!);
    expect(text).toContain("Maya — wardrobe: red coat");
    expect(text).not.toMatch(/3f2b8c1e|char_maya/);
  });
});
