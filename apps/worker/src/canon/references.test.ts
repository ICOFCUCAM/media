import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "@cineforge/movie";
import { shotReferences } from "./references";

const chars = {
  Maya: { id: "row-maya", key: "char_maya", wardrobe: "long red wool coat" },
  Ewan: { id: "row-ewan", key: "char_harbourmaster", wardrobe: "dark green oilskin" },
};

describe("per-shot references from the Continuity Engine (§62.6)", () => {
  it("only the characters in frame", () => {
    const pkg = mayaCoatFixture();
    expect(shotReferences(pkg, 1, 1, chars).characterIds).toEqual(["row-maya"]);
    expect(shotReferences(pkg, 1, 2, chars).characterIds).toEqual(["row-ewan"]);
    // Establishing shot of the harbour: nobody's face or LoRA.
    expect(shotReferences(pkg, 1, 0, chars).characterIds).toEqual([]);
    expect(shotReferences(pkg, 1, 1, chars).result).toMatchObject({ passed: true, severity: "none" });
  });

  it("scenes planned before W3 (no canon key in the row) resolve by name", () => {
    const old = { Maya: { id: "row-maya", wardrobe: "coat" }, Ewan: { id: "row-ewan" } };
    expect(shotReferences(mayaCoatFixture(), 1, 2, old).characterIds).toEqual(["row-ewan"]);
  });

  it("legacy projects without Film IR keep the inherited set", () => {
    expect(shotReferences(null, 0, 0, chars)).toEqual({ characterIds: null, result: null, charIdByKey: new Map() });
  });

  it("a shot that contradicts canon is reported blocking", () => {
    const pkg = mayaCoatFixture();
    pkg.scenes[2]!.characters = pkg.scenes[2]!.characters.filter((c) => c.characterId !== "char_maya");
    const r = shotReferences(pkg, 2, 1, chars);
    expect(r.result).toMatchObject({ passed: false, severity: "blocking" });
    expect(r.characterIds).toEqual([]);
  });
});
