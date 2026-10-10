import { describe, expect, it } from "vitest";
import { fixturePackage, renderPlanRequest } from "@cineforge/movie";
import { constraintsFor, planProductionFor, productionOf } from "./production";
import { cardToCast, loadProductionCanon, type CardRow, type StudioDb } from "./studio";

const KITO: CardRow = {
  id: "card-kito", name: "Kito", age: 12, gender: "boy", appearance: "round face, gap-toothed grin", personality: "curious",
  voiceProfile: { voiceId: "voice-9281", description: "bright, quick" }, heightCm: 145, hair: "black, spiky", eyes: "brown",
  clothing: "blue jacket", design: { proportions: "big head, short legs", palette: "jacket #1e5aa8", movement: "bouncy" },
};
const MOTHER: CardRow = { ...KITO, id: "card-mother", name: "Mother", age: 40, voiceProfile: null, design: null, heightCm: null, hair: null, eyes: null, clothing: null };

function fakeDb(o: {
  cast?: Record<string, CardRow[]>;
  show?: { title: string; projectId: string; bible: Record<string, unknown> | null; seasonRaw?: unknown } | null;
  episodes?: { episodeNumber: number; title: string; raw: unknown }[];
}): StudioDb & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    projectCast: {
      findMany: async ({ where }) => {
        calls.push(`cast:${where.projectId}`);
        return (o.cast?.[where.projectId] ?? []).map((character) => ({ character }));
      },
    },
    series: {
      findUnique: async () => (o.show
        ? { title: o.show.title, projectId: o.show.projectId, bible: o.show.bible, project: { screenplay: o.show.seasonRaw ? { raw: o.show.seasonRaw } : null } }
        : null),
    },
    project: {
      findMany: async ({ where }) => (o.episodes ?? [])
        .filter((e) => e.episodeNumber < where.episodeNumber.lt)
        .map((e) => ({ episodeNumber: e.episodeNumber, title: e.title, screenplay: { raw: e.raw } })),
    },
  };
}

const episode = (n: number) => productionOf({ kind: "episode", medium: "animation", animationStyle: "2d_tv", seriesId: "show-1", episodeNumber: n });

describe("Character Cards (W12; Part 5 §179.2, §183)", () => {
  it("a card becomes fixed cast with the card's identity, clothing, voice and design", () => {
    const c = cardToCast(KITO);
    expect(c).toMatchObject({
      id: "char_kito", name: "Kito", age: 12, source: "card", wardrobe: "blue jacket", personality: "curious", voice: "bright, quick",
      identity: { face: "round face, gap-toothed grin; brown eyes", hair: "black, spiky", body: "145 cm tall", marks: [] },
      design: { proportions: "big head, short legs", palette: "jacket #1e5aa8", movement: "bouncy" },
    });
    expect(cardToCast(MOTHER)).toMatchObject({ voice: null, design: null, wardrobe: null, identity: { hair: "as described", body: "as described" } });
  });

  it("a film with cast cards plans with them: the CAST section and the CAST_* checks", async () => {
    const spec = productionOf({});
    const canon = await loadProductionCanon(fakeDb({ cast: { p1: [KITO, MOTHER] } }), "p1", spec);
    expect(canon.cast.map((c) => c.id)).toEqual(["char_kito", "char_mother"]);
    expect(canon.cards.get("char_kito")?.cardId).toBe("card-kito");
    expect(canon.bible).toBeNull();
    expect(canon.episode).toBeNull();
    const c = constraintsFor(120, spec, canon);
    expect(c.cast).toEqual([{ id: "char_kito", name: "Kito" }, { id: "char_mother", name: "Mother" }]);
    expect(c.animation).toBeUndefined();
    // A live-action film normally sends no PRODUCTION section; with a cast it does.
    expect(planProductionFor(spec)).toBeUndefined();
    const prod = planProductionFor(spec, canon)!;
    expect(renderPlanRequest("brief", c, prod)).toContain('- char_kito "Kito", age 12, boy');
  });

  it("animation requires a design for every character", () => {
    expect(constraintsFor(120, productionOf({ kind: "film", medium: "animation", animationStyle: "3d_family" })).animation).toBe(true);
  });
});

describe("Show Bible + episodes (W12; Part 5 §184)", () => {
  const bible = { genre: "adventure", audience: "children 6–10", episodeFormat: "cold open, two acts, tag", worldRules: "  ", continuityRules: "Kito always wears the blue jacket" };

  it("episode 1: the bible and the show's cast; nothing before it", async () => {
    const db = fakeDb({ cast: { "show-project": [KITO] }, show: { title: "Kito's Moon", projectId: "show-project", bible } });
    const canon = await loadProductionCanon(db, "ep1", episode(1));
    expect(db.calls).toEqual(["cast:ep1", "cast:show-project"]);
    expect(canon.bible).toMatchObject({ title: "Kito's Moon", genre: "adventure", episodeFormat: "cold open, two acts, tag", worldRules: null });
    expect(canon.episode).toEqual({ number: 1, season: 1, previously: [] });
    expect(canon.cast.map((c) => [c.id, c.source])).toEqual([["char_kito", "card"]]);
  });

  it("episode 7 knows what happened in episode 1: recaps, returning characters, the dead stay dead", async () => {
    const ep1 = fixturePackage();
    ep1.scenes[1]!.deaths = ["char_harbourmaster"];
    const db = fakeDb({
      cast: { "show-project": [KITO] },
      show: { title: "Kito's Moon", projectId: "show-project", bible },
      episodes: [{ episodeNumber: 1, title: "The Key", raw: { package: ep1 } }, { episodeNumber: 9, title: "Later", raw: { package: fixturePackage() } }],
    });
    const canon = await loadProductionCanon(db, "ep7", episode(7));
    expect(canon.episode!.number).toBe(7);
    expect(canon.episode!.previously.map((r) => [r.number, r.title, r.deaths])).toEqual([[1, "The Key", ["Ewan"]]]);
    expect(canon.deceased).toEqual([{ id: "char_harbourmaster", name: "Ewan" }]);
    expect(canon.cast.map((c) => [c.id, c.source, c.deceased ?? false])).toEqual([
      ["char_kito", "card", false], ["char_maya", "earlier_episode", false], ["char_harbourmaster", "earlier_episode", true],
    ]);
    const c = constraintsFor(600, episode(7), canon);
    // Only cards must appear; returning characters may.
    expect(c.cast).toEqual([{ id: "char_kito", name: "Kito" }]);
    expect(c.deceased).toEqual([{ id: "char_harbourmaster", name: "Ewan" }]);
    const text = renderPlanRequest("brief", c, planProductionFor(episode(7), canon)!);
    expect(text).toContain("SHOW BIBLE: Kito's Moon (hard)");
    expect(text).toContain('- Episode 1 "The Key"');
    expect(text).toContain("RETURNING CHARACTERS");
    expect(text).toContain("(died in an earlier episode: flashbacks only)");
    expect(text).toContain("- format: Episode");
  });

  it("a season planned in one pass counts as its first episodes; a production of the same number replaces it", async () => {
    const season = fixturePackage();
    const remake = fixturePackage();
    remake.film.synopsis = "The remade first episode.";
    const db = fakeDb({
      show: { title: "Harbour", projectId: "show-project", bible: null, seasonRaw: { package: season } },
      episodes: [{ episodeNumber: 1, title: "Remake", raw: { package: remake } }],
    });
    const canon = await loadProductionCanon(db, "ep3", episode(3));
    expect(canon.episode!.previously.map((r) => [r.number, r.title])).toEqual([[1, "Remake"], [2, "Episode 2"]]);
    expect(canon.episode!.previously[0]!.synopsis).toBe("The remade first episode.");
    expect(canon.bible).toMatchObject({ title: "Harbour", genre: null });
  });

  it("an episode whose show is gone is refused, never planned without its canon", async () => {
    await expect(loadProductionCanon(fakeDb({ show: null }), "ep2", episode(2))).rejects.toThrow(/show show-1 not found/);
  });

  it("unparseable earlier plans are skipped, not guessed", async () => {
    const db = fakeDb({ show: { title: "S", projectId: "sp", bible: null }, episodes: [{ episodeNumber: 1, title: "Bad", raw: { package: { nope: true } } }] });
    const canon = await loadProductionCanon(db, "ep2", episode(2));
    expect(canon.episode!.previously).toEqual([]);
  });
});
