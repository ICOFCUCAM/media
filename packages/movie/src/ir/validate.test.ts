import { describe, expect, it } from "vitest";
import { fixturePackage, FIXTURE_CONSTRAINTS as C } from "./fixture";
import { filmPackageJsonSchema } from "./json-schema";
import { formatIssues, packageSeconds, validateFilmPackage } from "./validate";

const codes = (raw: unknown, c = C) => {
  const r = validateFilmPackage(raw, c);
  return r.ok ? [] : r.issues.map((i) => `${i.stage}/${i.code}`);
};

describe("Film IR validator chain (DOS-24, DOS-94)", () => {
  it("accepts a complete, consistent package", () => {
    const r = validateFilmPackage(fixturePackage(), C);
    expect(r.ok).toBe(true);
    expect(packageSeconds(fixturePackage())).toBe(36);
  });

  it("schema: rejects malformed ids and missing fields with paths", () => {
    const p = fixturePackage() as unknown as Record<string, unknown>;
    (p.cast as Record<string, unknown>[])[0]!.id = "Maya";
    delete (p.film as Record<string, unknown>).logline;
    const r = validateFilmPackage(p, C);
    expect(r.ok).toBe(false);
    const paths = r.ok ? [] : r.issues.map((i) => i.path);
    expect(paths).toContain("cast.0.id");
    expect(paths).toContain("film.logline");
  });

  it("references: unknown location, character, wardrobe, prop, act scene", () => {
    const p = fixturePackage();
    p.scenes[0]!.locationId = "loc_moon";
    p.scenes[0]!.characters[0]!.wardrobeId = "wardrobe_oilskin"; // Ewan's, not Maya's
    p.scenes[1]!.characters[0]!.holding = ["prop_ghost"];
    p.scenes[1]!.dialogue.push({ characterId: "char_nobody", line: "Hi", emotion: null });
    p.acts[1]!.sceneIds.push("scene_99");
    expect(codes(p)).toEqual(expect.arrayContaining(["references/UNKNOWN_REFERENCE"]));
    const r = validateFilmPackage(p, C);
    const msgs = r.ok ? "" : formatIssues(r.issues);
    expect(msgs).toContain("location loc_moon does not exist");
    expect(msgs).toContain("wardrobe_oilskin is not one of Maya's wardrobe entries");
    expect(msgs).toContain("prop prop_ghost does not exist");
    expect(msgs).toContain("character char_nobody is not in the cast");
    expect(msgs).toContain("scene scene_99 does not exist");
  });

  it("references: a speaker must be in the scene", () => {
    const p = fixturePackage();
    p.scenes[0]!.characters = p.scenes[0]!.characters.filter((c) => c.characterId !== "char_harbourmaster");
    expect(codes(p)).toContain("references/SPEAKER_NOT_PRESENT");
  });

  it("story: payoff before setup, no protagonist, act mismatch", () => {
    const p = fixturePackage();
    p.setups[0] = { ...p.setups[0]!, plantedIn: "scene_02", paidOffIn: "scene_01" };
    p.cast[0]!.role = "supporting";
    p.scenes[1]!.act = 1;
    expect(codes(p)).toEqual(expect.arrayContaining(["story/PAYOFF_BEFORE_SETUP", "story/NO_PROTAGONIST", "story/ACT_MISMATCH"]));
  });

  it("production: scene count, shot count, shot length, scene length", () => {
    const p = fixturePackage();
    p.scenes[0]!.shots[0]!.durationSec = 8;
    p.scenes[1]!.shots.push({ ...p.scenes[1]!.shots[0]!, index: 4 });
    expect(codes(p, { ...C, sceneCount: 3 })).toEqual(
      expect.arrayContaining(["production/SCENE_COUNT", "production/TOO_MANY_SHOTS", "production/SHOT_TOO_LONG", "production/SCENE_LENGTH"]),
    );
  });

  it("budget: the film must run what was requested", () => {
    expect(codes(fixturePackage(), { ...C, targetSeconds: 90, sceneSec: 18 })).toContain("budget/FILM_LENGTH");
  });

  it("the JSON Schema for the tool is generated from the same contract", () => {
    const s = filmPackageJsonSchema();
    expect(s.type).toBe("object");
    expect(s.$schema).toBeUndefined();
    expect((s.required as string[])).toEqual(expect.arrayContaining(["film", "cast", "scenes"]));
    expect(JSON.stringify(s)).toContain("^char_");
  });
});
