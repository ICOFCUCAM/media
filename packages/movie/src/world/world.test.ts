import { describe, expect, it } from "vitest";
import { fixturePackage, FIXTURE_CONSTRAINTS, mayaCoatFixture as mayaFilm } from "../ir/fixture";
import { FilmPackage, type FilmPackage as Pkg } from "../ir/schema";
import { filmPackageJsonSchema } from "../ir/json-schema";
import { validateCanon, validateFilmPackage } from "../ir/validate";
import { canonGraph } from "./graph";
import { checkContinuity, checkFilmContinuity } from "./continuity";
import { reviseCanon } from "./revise";
import { canonVersion } from "./version";
import { continuityRuns, materializeWorld } from "./state";

const canonCodes = (p: Pkg) => validateCanon(p).map((i) => `${i.stage}/${i.code}`);

describe("World State Engine (Part 1 §55)", () => {
  it("materializes typed, id-keyed state per scene", () => {
    const w = materializeWorld(fixturePackage());
    const s1 = w.scenes[0]!;
    expect(s1.clock).toEqual({ day: 1, timeOfDay: "night", continuous: false, flashback: false });
    expect(s1.characters.char_maya).toMatchObject({
      present: true, locationId: "loc_harbour", wardrobeId: "wardrobe_raincoat", holding: ["prop_key"],
      knows: ["fact_bridge_swings", "fact_key_opens_vault"],
    });
    expect(s1.props.prop_key).toEqual({ propId: "prop_key", holderId: "char_maya", locationId: "loc_harbour" });
    expect(w.initialKnowledge.audience).toEqual(["fact_key_opens_vault"]);
    expect(s1.audienceKnows).toEqual(["fact_bridge_swings", "fact_key_opens_vault"]);
    expect(w.scenes[1]!.characters.char_maya!.physical).toBe("soaked");
  });

  it("carries off-screen characters and what they hold forward", () => {
    const p = fixturePackage();
    p.locations.push({ ...p.locations[0]!, id: "loc_office", name: "Office" });
    p.scenes[1]!.locationId = "loc_office";
    p.scenes[1]!.characters = p.scenes[1]!.characters.filter((c) => c.characterId !== "char_maya");
    p.scenes[1]!.shots.forEach((s) => (s.subjectIds = ["char_harbourmaster"]));
    const w = materializeWorld(p);
    expect(w.scenes[1]!.characters.char_maya).toMatchObject({ present: false, locationId: "loc_harbour", lastSceneId: "scene_01", holding: ["prop_key"] });
    expect(w.scenes[1]!.props.prop_key).toEqual({ propId: "prop_key", holderId: "char_maya", locationId: "loc_harbour" });
  });

  it("a prop put down stays where it was last seen", () => {
    const p = fixturePackage();
    p.scenes[1]!.characters[0]!.holding = [];
    expect(materializeWorld(p).scenes[1]!.props.prop_key).toEqual({ propId: "prop_key", holderId: null, locationId: "loc_harbour" });
  });

  it("continuity runs follow storyTime.continuous", () => {
    expect(continuityRuns(mayaFilm())).toEqual([[0], [1, 2]]);
  });
});

describe("Canon validation (Part 1 §33, §56–58)", () => {
  it("the fixture and the Maya film are valid", () => {
    expect(validateFilmPackage(fixturePackage(), FIXTURE_CONSTRAINTS)).toMatchObject({ ok: true });
    expect(validateCanon(mayaFilm())).toEqual([]);
  });

  it("nobody says what they cannot know yet", () => {
    const p = fixturePackage();
    p.scenes[0]!.dialogue.push({ characterId: "char_maya", line: "It opens at high tide.", emotion: null, references: ["fact_bridge_swings"] });
    expect(canonCodes(p)).toEqual([]); // she learns it in this scene
    p.scenes[0]!.reveals = [];
    expect(canonCodes(p)).toContain("canon/KNOWLEDGE_VIOLATION");
  });

  it("a setup's fact must be established for the audience before it pays off", () => {
    const p = fixturePackage();
    p.scenes[0]!.reveals = [{ factId: "fact_bridge_swings", to: ["char_maya"] }];
    expect(canonCodes(p)).toEqual(["canon/SETUP_NOT_ESTABLISHED"]);
    p.setups[0]!.developedIn = ["scene_01"];
    expect(canonCodes(p)).toContain("canon/DEVELOPMENT_OUT_OF_ORDER");
  });

  it("mysteries are withheld, then answered for the audience", () => {
    const p = fixturePackage();
    p.threads.push({ id: "thread_vault", kind: "mystery", description: "what does the key open?", sceneIds: ["scene_01", "scene_02"], answerFactId: "fact_key_opens_vault" });
    expect(canonCodes(p)).toEqual(["canon/MYSTERY_SPOILED"]);
    p.facts[1]!.knownAtStart = ["char_maya"];
    expect(canonCodes(p)).toEqual(["canon/MYSTERY_UNRESOLVED"]);
    p.scenes[1]!.reveals = [{ factId: "fact_key_opens_vault", to: ["audience"] }];
    expect(canonCodes(p)).toEqual([]);
  });

  it("story time runs forward unless it is a flashback", () => {
    const p = fixturePackage();
    p.scenes[0]!.storyTime = { day: 3, continuous: false, flashback: false };
    expect(canonCodes(p)).toEqual(["canon/TIME_REGRESSION"]);
    p.scenes[1]!.storyTime = { day: 1, continuous: false, flashback: true };
    expect(canonCodes(p)).toEqual([]);
  });

  it("continuous action keeps clothes and injuries; one holder per prop", () => {
    const p = fixturePackage();
    p.scenes[1]!.storyTime = { day: 1, continuous: true, flashback: false };
    expect(canonCodes(p)).toEqual(["canon/WARDROBE_CHANGE_IN_CONTINUOUS_ACTION"]);
    const q = mayaFilm();
    q.scenes[1]!.characters[0]!.physical = "cut across the palm";
    expect(canonCodes(q)).toEqual(["canon/PHYSICAL_STATE_DROPPED"]);
    q.scenes[2]!.characters[1]!.holding = ["prop_key"];
    expect(canonCodes(q)).toContain("canon/PROP_TWO_HOLDERS");
  });

  it("every planned shot frames only who and what is there", () => {
    const p = mayaFilm();
    p.scenes[2]!.characters = p.scenes[2]!.characters.filter((c) => c.characterId !== "char_maya");
    expect(canonCodes(p)).toEqual(["canon/FRAMED_NOT_PRESENT", "canon/PROP_ELSEWHERE"]);
  });

  it("reveals go to someone in the scene; references resolve", () => {
    const p = fixturePackage();
    p.scenes[1]!.characters = p.scenes[1]!.characters.filter((c) => c.characterId === "char_harbourmaster");
    p.scenes[1]!.shots.forEach((s) => (s.subjectIds = ["char_harbourmaster"]));
    p.scenes[1]!.reveals = [{ factId: "fact_nope", to: ["char_maya"] }];
    expect(canonCodes(p)).toEqual(expect.arrayContaining(["references/UNKNOWN_REFERENCE", "references/REVEAL_TO_ABSENT"]));
  });

  it("packages stored before W3 still parse, with empty canon", () => {
    const old = JSON.parse(JSON.stringify(fixturePackage()));
    delete old.facts;
    for (const s of old.scenes) { delete s.storyTime; delete s.reveals; for (const d of s.dialogue) delete d.references; }
    for (const s of old.setups) { delete s.factId; delete s.developedIn; }
    for (const t of old.threads) delete t.answerFactId;
    const p = FilmPackage.parse(old);
    expect(p.facts).toEqual([]);
    expect(p.scenes[0]!.storyTime).toBeNull();
    expect(materializeWorld(p).scenes[0]!.clock.day).toBeNull();
  });

  it("the model must state every canon field (no silent omissions)", () => {
    const s = filmPackageJsonSchema() as { required: string[]; properties: Record<string, never> };
    expect(s.required).toContain("facts");
    const json = JSON.stringify(s);
    expect(json).not.toContain('"default"');
    const scene = (s.properties as unknown as { scenes: { items: { required: string[] } } }).scenes.items;
    expect(scene.required).toEqual(expect.arrayContaining(["storyTime", "reveals"]));
  });
});

describe("Canon dependency graph + revisions (Part 2 §62.8–62.9)", () => {
  it("ACCEPTANCE §62.8: Maya's coat changes to blue in scene 12 → scenes 11 and 12 are affected, scene 10 is not", () => {
    const before = mayaFilm();
    const rev = reviseCanon(before, {
      kind: "scene_wardrobe", sceneId: "scene_12", characterId: "char_maya",
      wardrobe: { id: "wardrobe_blue_coat", description: "long blue wool coat" },
    });
    expect(rev.issues).toEqual([]);
    expect(rev.affectedScenes).toEqual(["scene_11", "scene_12"]);
    // Only Maya's shots in the continuous action are regenerated.
    expect(rev.affectedShots).toEqual([
      { sceneId: "scene_11", sceneIndex: 1, shotIndex: 1 },
      { sceneId: "scene_12", sceneIndex: 2, shotIndex: 1 },
    ]);
    // The dependency graph predicted exactly that.
    expect(rev.predicted.shots).toEqual(rev.affectedShots);
    expect(rev.predicted.scenes).toEqual(["scene_11", "scene_12"]);
    // Canon is consistent afterwards: she wears blue through the continuous action, red the day before.
    expect(rev.pkg.scenes.map((s) => s.characters[0]!.wardrobeId)).toEqual(["wardrobe_red_coat", "wardrobe_blue_coat", "wardrobe_blue_coat"]);
    expect(rev.fromVersion).toBe(canonVersion(before));
    expect(rev.toVersion).not.toBe(rev.fromVersion);
    expect(before.scenes[1]!.characters[0]!.wardrobeId).toBe("wardrobe_red_coat"); // pure: input untouched
  });

  it("rewriting the coat itself touches every scene it is worn in", () => {
    const rev = reviseCanon(mayaFilm(), { kind: "wardrobe_description", characterId: "char_maya", wardrobeId: "wardrobe_red_coat", description: "long crimson coat" });
    expect(rev.affectedScenes).toEqual(["scene_10", "scene_11", "scene_12"]);
    expect(rev.affectedShots.map((s) => `${s.sceneId}#${s.shotIndex}`)).toEqual(["scene_10#1", "scene_11#1", "scene_12#1"]);
  });

  it("an injury added mid-action carries to the end of the action only", () => {
    const rev = reviseCanon(mayaFilm(), { kind: "physical", sceneId: "scene_11", characterId: "char_maya", physical: "bleeding from the left arm" });
    expect(rev.issues).toEqual([]);
    expect(rev.pkg.scenes.map((s) => s.characters[0]!.physical)).toEqual([null, "bleeding from the left arm", "bleeding from the left arm"]);
    expect(rev.affectedScenes).toEqual(["scene_11", "scene_12"]);
  });

  it("a location change reaches every shot set there; the graph's prediction covers what changed", () => {
    const rev = reviseCanon(mayaFilm(), { kind: "location", locationId: "loc_harbour", patch: { description: "flooded quays" } });
    expect(rev.affectedShots).toHaveLength(12);
    // Every shot overrides the location's default light, so a lighting edit changes no shot.
    const light = reviseCanon(mayaFilm(), { kind: "location", locationId: "loc_harbour", patch: { lighting: "grey dawn" } });
    expect(light.affectedShots).toEqual([]);
    expect(light.predicted.shots).toHaveLength(12);
    const g = canonGraph(mayaFilm());
    expect(g.dependents({ kind: "fact", id: "fact_bridge_swings" }).lines).toHaveLength(3);
    expect(g.dependents({ kind: "prop", id: "prop_key" }).shots.map((s) => s.sceneId)).toEqual(["scene_10", "scene_11", "scene_12"]);
    // Removing an injury mid-action breaks the action it continues — reported, not applied silently.
    const hurt = reviseCanon(mayaFilm(), { kind: "physical", sceneId: "scene_11", characterId: "char_maya", physical: "limping" }).pkg;
    const bad = reviseCanon(hurt, { kind: "physical", sceneId: "scene_12", characterId: "char_maya", physical: null });
    expect(bad.issues.map((i) => i.code)).toEqual(["PHYSICAL_STATE_DROPPED"]);
  });
});

describe("Character Continuity Engine (Part 2 §62.3–62.7)", () => {
  it("evaluates every applicable check — never a bare pass", () => {
    const r = checkContinuity(fixturePackage(), { sceneId: "scene_01", shotIndex: 1 });
    expect(r).toMatchObject({ passed: true, severity: "none", violations: [] });
    expect(r.checked).toEqual(["accessories", "age", "body", "emotion", "hair", "identity", "injuries", "knowledge", "location", "possessions", "presence", "time", "wardrobe"]);
    expect(r.requiredReferences).toEqual([
      { kind: "location", id: "loc_harbour", reason: "setting" },
      { kind: "character", id: "char_maya", reason: "identity" },
      { kind: "wardrobe", id: "wardrobe_raincoat", characterId: "char_maya", reason: "wardrobe in this scene" },
      { kind: "prop", id: "prop_key", reason: "in frame" },
    ]);
    expect(r.correctedGenerationContext.characters[0]).toMatchObject({ name: "Maya", wardrobe: "yellow raincoat over black jumper", holding: [{ id: "prop_key", name: "Sealed key" }] });
    expect(r.worldStateVersion).toMatch(/^[0-9a-f]{16}$/);
  });

  it("blocks a request that contradicts canon and returns the corrected context", () => {
    const r = checkContinuity(mayaFilm(), {
      sceneId: "scene_12", shotIndex: 1,
      characters: [{ characterId: "char_maya", wardrobeId: "wardrobe_raincoat", hair: "long blonde hair", marks: [], holding: [] }],
      timeOfDay: "day",
    });
    expect(r.passed).toBe(false);
    expect(r.severity).toBe("blocking");
    expect(r.violations.map((v) => v.code).sort()).toEqual(["HAIR_MISMATCH", "MARK_MISSING", "TIME_MISMATCH", "WARDROBE_MISMATCH"]);
    expect(r.correctedGenerationContext.characters[0]!.wardrobeId).toBe("wardrobe_red_coat");
    expect(r.correctedGenerationContext.prompt).toContain("wearing long red wool coat");
  });

  it("injuries, presence and possessions", () => {
    const p = mayaFilm();
    p.scenes[1]!.characters[0]!.physical = "bleeding from the left arm";
    p.scenes[2]!.characters[0]!.physical = "bleeding from the left arm";
    const inj = checkContinuity(p, { sceneId: "scene_12", shotIndex: 1, characters: [{ characterId: "char_maya", physical: null }] });
    expect(inj.violations.map((v) => v.code)).toEqual(["INJURY_MISSING"]);

    const q = mayaFilm();
    q.scenes[2]!.characters = q.scenes[2]!.characters.filter((c) => c.characterId !== "char_maya");
    const absent = checkContinuity(q, { sceneId: "scene_12", shotIndex: 1 });
    expect(absent.violations.map((v) => v.code)).toEqual(["CHARACTER_NOT_IN_SCENE"]);
    const key = checkContinuity(q, { sceneId: "scene_12", shotIndex: 3 });
    expect(key.violations.map((v) => v.code)).toEqual(["PROP_ELSEWHERE"]);
    expect(key.passed).toBe(false);

    const same = mayaFilm();
    same.scenes[1]!.characters[0]!.physical = "soaked";
    same.scenes[2]!.storyTime = { day: 2, continuous: false, flashback: false };
    const warn = checkContinuity(same, { sceneId: "scene_12", shotIndex: 1 });
    expect(warn).toMatchObject({ passed: true, severity: "warning" });
    expect(warn.violations.map((v) => v.code)).toEqual(["INJURY_VANISHED_SAME_DAY"]);
  });

  it("checks the whole film", () => {
    const all = checkFilmContinuity(mayaFilm());
    expect(all).toHaveLength(12);
    expect(all.every((x) => x.result.passed)).toBe(true);
  });
});
