import { describe, expect, it } from "vitest";
import { fixturePackage, FIXTURE_CONSTRAINTS as C } from "../ir/fixture";
import { validateFilmPackage, type ProductionConstraints } from "../ir/validate";
import { canonicalHash, compileGeneration } from "../prompt/canonical";
import { compileFor } from "../prompt/compilers";
import { applyCast, castFromPackage, castId, deceasedIn, recapEpisodes } from "./cast";
import { PROMPTS, renderPlanRequest, type PlanCastMember, type PlanProduction } from "./prompts";

const codes = (raw: unknown, c: ProductionConstraints = C) => {
  const r = validateFilmPackage(raw, c);
  return r.ok ? [] : r.issues.map((i) => i.code);
};

const KITO: PlanCastMember = {
  id: "char_maya", name: "Maya", age: 12, gender: "girl",
  identity: { face: "round face, big brown eyes", hair: "black bob", body: "small, 145cm", marks: ["freckles"] },
  wardrobe: "blue jacket", personality: "curious", voice: "bright, quick",
  design: { proportions: "head one third of body height", palette: "skin #8d5524, jacket #1e5aa8", movement: "bouncy, quick turns" },
  source: "card",
};

const animated = (): PlanProduction => ({
  format: "Episode", medium: "animation", style: { label: "Modern TV cartoon", look: "flat colours", motion: "snappy" },
  narrated: false, direction: ["One episode."],
  cast: [KITO],
  bible: { title: "Harbour Tales", genre: "adventure", audience: "children 6–10", worldRules: "the sea talks", locations: null, musicIdentity: "ukulele theme", narrativeRules: null, episodeFormat: "cold open, two acts, tag", continuityRules: "Maya always wears the blue jacket" },
  episode: { number: 7, previously: [{ number: 1, title: "The Key", synopsis: "Maya finds the key.", facts: ["the key opens the lighthouse"], deaths: ["Old Tom"], relationships: ["Maya and Ewan: friends"] }] },
});

describe("fixed cast (W12; Part 5 §179, §183)", () => {
  it("names cast characters the way the Director writes ids", () => {
    expect(castId("Kito")).toBe("char_kito");
    expect(castId("  Mother Hen! ")).toBe("char_mother_hen");
    expect(castId("Zoë")).toBe("char_zoe");
  });

  it("restores a cast member's canonical identity over what the model wrote", () => {
    const pkg = fixturePackage();
    const out = applyCast(pkg, [KITO]);
    const maya = out.cast.find((c) => c.id === "char_maya")!;
    expect(maya.identity).toEqual(KITO.identity);
    expect(maya.design).toEqual(KITO.design);
    expect(maya.age).toBe(12);
    expect(maya.voice.description).toBe("bright, quick");
    // Wardrobe stays the plan's (scene by scene); others are untouched; the input is not mutated.
    expect(maya.wardrobe).toEqual(pkg.cast[0]!.wardrobe);
    expect(out.cast[1]).toEqual(pkg.cast[1]);
    expect(pkg.cast[0]!.design).toBeNull();
  });

  it("validator: a cast character must be in the film, unrenamed, and in a scene", () => {
    const cast = [{ id: "char_maya", name: "Maya" }];
    expect(codes(fixturePackage(), { ...C, cast })).toEqual([]);
    expect(codes(fixturePackage(), { ...C, cast: [{ id: "char_kito", name: "Kito" }] })).toEqual(["CAST_MISSING"]);
    expect(codes(fixturePackage(), { ...C, cast: [{ id: "char_maya", name: "Kito" }] })).toEqual(["CAST_RENAMED"]);
    const p = fixturePackage();
    for (const sc of p.scenes) {
      sc.characters = sc.characters.filter((s) => s.characterId !== "char_harbourmaster");
      sc.dialogue = [];
    }
    expect(codes(p, { ...C, cast: [{ id: "char_harbourmaster", name: "Ewan" }] })).toContain("CAST_UNUSED");
  });

  it("validator: someone who died in an earlier episode returns only in a flashback", () => {
    const dead = [{ id: "char_harbourmaster", name: "Ewan" }];
    expect(codes(fixturePackage(), { ...C, deceased: dead }).filter((c) => c === "DECEASED_APPEARS")).toHaveLength(2);
    const p = fixturePackage();
    for (const sc of p.scenes) sc.storyTime = { day: 1, continuous: false, flashback: true };
    expect(codes(p, { ...C, deceased: dead })).not.toContain("DECEASED_APPEARS");
  });

  it("validator: animated characters need a design", () => {
    expect(codes(fixturePackage(), { ...C, animation: true })).toEqual(["DESIGN_MISSING", "DESIGN_MISSING"]);
    const p = applyCast(fixturePackage(), [KITO]);
    p.cast[1]!.design = { proportions: "broad", palette: "green oilskin", movement: "slow" };
    expect(codes(p, { ...C, animation: true })).toEqual([]);
  });

  it("the plan request carries the show bible, what came before, and the cast", () => {
    const text = renderPlanRequest("Maya returns to the lighthouse.", C, animated());
    expect(text).toContain("SHOW BIBLE: Harbour Tales (hard)");
    expect(text).toContain("- episode format: cold open, two acts, tag");
    expect(text).not.toContain("- locations:");
    expect(text).toContain("EPISODE 7");
    expect(text).toContain("PREVIOUSLY (canon: never contradict it)");
    expect(text).toContain("  died: Old Tom");
    expect(text).toContain('- char_maya "Maya", age 12, girl');
    expect(text).toContain("design: head one third of body height; colours skin #8d5524, jacket #1e5aa8; moves bouncy, quick turns");
    expect(text.indexOf("SHOW BIBLE")).toBeLessThan(text.indexOf("CAST (hard"));
    expect(text.indexOf("CAST (hard")).toBeLessThan(text.indexOf("CONSTRAINTS (hard)"));
    expect(PROMPTS.directorMaster.system).toContain("every character has a design");
  });

  it("a first episode says so; no cast means no CAST section", () => {
    const text = renderPlanRequest("x", C, { ...animated(), cast: [], episode: { number: 1, previously: [] } });
    expect(text).toContain("- this is the first episode");
    expect(text).not.toContain("CAST (hard");
  });

  it("an animated character's design reaches the prompts; live-action prompts are unchanged", () => {
    const live = compileGeneration(fixturePackage(), "scene_01", 1);
    expect(compileFor("wan-2.1", live).prompt).not.toContain("colours:");
    expect(JSON.stringify(live)).not.toContain("design");

    const drawn = applyCast(fixturePackage(), [KITO]);
    const req = compileGeneration(drawn, "scene_01", 1);
    const maya = req.visualIntent.subjects.find((s) => s.id === "char_maya")!;
    expect(maya.look).toContain("colours: skin #8d5524, jacket #1e5aa8");
    expect(compileFor("wan-2.1", req).prompt).toContain("moving bouncy, quick turns");
    expect(compileFor("openai-image", req).prompt).not.toContain("moving bouncy");
    expect(canonicalHash(req)).not.toBe(canonicalHash(live));
  });

  it("recaps what an episode established: audience knowledge, deaths, relationships", () => {
    const pkg = fixturePackage();
    pkg.scenes[1]!.deaths = ["char_harbourmaster"];
    const [one] = recapEpisodes(pkg, { number: 3, title: "The Crossing" });
    expect(one!.number).toBe(3);
    expect(one!.synopsis).toBe(pkg.film.synopsis);
    expect(one!.facts.length).toBeGreaterThan(0);
    expect(one!.facts.some((f) => /bridge/i.test(f))).toBe(true);
    expect(one!.deaths).toEqual(["Ewan"]);
    expect(one!.relationships).toEqual(["Maya and Ewan: trust"]);
    expect(deceasedIn([pkg])).toEqual([{ id: "char_harbourmaster", name: "Ewan" }]);
  });

  it("a series planned in one pass recaps act by act, each cumulative", () => {
    const pkg = fixturePackage();
    pkg.scenes[1]!.deaths = ["char_harbourmaster"];
    const acts = recapEpisodes(pkg, "acts");
    expect(acts.map((a) => [a.number, a.title, a.deaths])).toEqual([[1, "Episode 1", []], [2, "Episode 2", ["Ewan"]]]);
    expect(acts[0]!.relationships[0]).not.toContain("trust");
    expect(acts[1]!.relationships[0]).toContain("trust");
  });

  it("characters from earlier episodes come back as fixed cast", () => {
    const cast = castFromPackage(fixturePackage());
    expect(cast.map((c) => [c.id, c.source])).toEqual([["char_maya", "earlier_episode"], ["char_harbourmaster", "earlier_episode"]]);
    expect(cast[0]!.wardrobe).toBe("yellow raincoat over black jumper");
    const text = renderPlanRequest("x", C, { ...animated(), cast: [KITO, { ...cast[1]!, deceased: true }] });
    expect(text).toContain("RETURNING CHARACTERS (from earlier episodes");
    expect(text).toContain('- char_harbourmaster "Ewan", age 61, male (died in an earlier episode: flashbacks only)');
    expect(text.indexOf("CAST (hard")).toBeLessThan(text.indexOf("RETURNING CHARACTERS"));
  });
});

describe("further seasons in the plan request (W26; Part 5 §178)", () => {
  const recap = (number: number, season: number) => ({ number, season, title: `Ep ${number}`, synopsis: "things happen", facts: [], deaths: [], relationships: [] });

  it("a season premiere is told it opens the season, with every earlier season still canon", () => {
    const r = renderPlanRequest("brief", C, { ...animated(), episode: { number: 4, season: 2, previously: [recap(1, 1), recap(2, 1), recap(3, 1)] } });
    expect(r).toContain("EPISODE 4, SEASON 2");
    expect(r).toContain("this episode opens season 2");
    expect(r).toContain('- Season 1, Episode 3 "Ep 3"');
  });
  it("a later episode of the same season continues it; a one-season show stays unlabelled", () => {
    const r = renderPlanRequest("brief", C, { ...animated(), episode: { number: 5, season: 2, previously: [recap(3, 1), recap(4, 2)] } });
    expect(r).not.toContain("opens season");
    expect(r).toContain('- Season 2, Episode 4 "Ep 4"');
    const one = renderPlanRequest("brief", C, { ...animated(), episode: { number: 2, previously: [recap(1, 1)] } });
    expect(one).toContain("EPISODE 2 (this production");
    expect(one).toContain('- Episode 1 "Ep 1"');
  });
});
