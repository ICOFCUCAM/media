import { describe, it, expect } from "vitest";
import { computeContinuity, renderStatePreamble, type SceneInput } from "./continuity";

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
});
