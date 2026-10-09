/**
 * Fixed cast (W12; Part 5 §179, §183). A character cast before planning — a
 * Character Card, or someone an earlier episode introduced — keeps the
 * identity it was given. The Director is told to use it exactly (the CAST
 * section) and the validator checks it is there; then CineForge writes the
 * canonical identity over whatever the model wrote, so a character's face,
 * proportions, colours and voice never drift at the orchestration level.
 */
import type { FilmPackage } from "../ir/schema";
import { materializeWorld } from "../world/state";
import type { PlanCastMember, PlanEpisodeRecap } from "./prompts";

/** The stable IR id for a cast character: char_<name>, as the Director writes ids. */
export function castId(name: string): string {
  const slug = name.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `char_${slug || "unnamed"}`;
}

/** The package with every cast member's canonical identity restored (a new object; the input is untouched). */
export function applyCast(pkg: FilmPackage, cast: PlanCastMember[]): FilmPackage {
  if (!cast.length) return pkg;
  const byId = new Map(cast.map((c) => [c.id, c]));
  return {
    ...pkg,
    cast: pkg.cast.map((ch) => {
      const want = byId.get(ch.id);
      if (!want) return ch;
      return {
        ...ch,
        name: want.name,
        age: want.age ?? ch.age,
        gender: want.gender ?? ch.gender,
        identity: { ...want.identity, marks: [...want.identity.marks] },
        personality: want.personality ?? ch.personality,
        voice: want.voice ? { description: want.voice } : ch.voice,
        design: want.design ? { ...want.design } : ch.design,
      };
    }),
  };
}

/** Every character a package established, as fixed cast for a later episode. */
export function castFromPackage(pkg: FilmPackage): PlanCastMember[] {
  return pkg.cast.map((c) => ({
    id: c.id, name: c.name, age: c.age, gender: c.gender,
    identity: { ...c.identity, marks: [...c.identity.marks] },
    wardrobe: c.wardrobe[0]?.description ?? null,
    personality: c.personality, voice: c.voice.description,
    design: c.design ? { ...c.design } : null,
    source: "earlier_episode" as const,
  }));
}

/**
 * What an episode established, for the next one's PREVIOUSLY (Part 5 §184.3:
 * "Episode 7 knows what happened in Episode 1"): what the audience knows by
 * its end, who died, and how characters stand. A package planned as one
 * whole episode gives one recap; a series planned in one pass (W11) gives
 * one per act, each cumulative to the end of that act.
 */
export function recapEpisodes(pkg: FilmPackage, as: { number: number; title: string } | "acts"): PlanEpisodeRecap[] {
  const world = materializeWorld(pkg);
  const names = new Map(pkg.cast.map((c) => [c.id, c.name]));
  const statement = new Map(pkg.facts.map((f) => [f.id, f.statement]));
  const recapTo = (lastIndex: number, number: number, title: string, synopsis: string, deathsFrom: number): PlanEpisodeRecap => {
    const end = world.scenes[lastIndex]!;
    return {
      number, title, synopsis,
      facts: end.audienceKnows.map((f) => statement.get(f) ?? f),
      deaths: pkg.scenes.slice(deathsFrom, lastIndex + 1).flatMap((sc) => sc.deaths.map((d) => names.get(d) ?? d)),
      relationships: Object.values(end.relationships).map((r) => `${names.get(r.a) ?? r.a} and ${names.get(r.b) ?? r.b}: ${r.state}`),
    };
  };
  if (!pkg.scenes.length) return [];
  if (as !== "acts") return [recapTo(pkg.scenes.length - 1, as.number, as.title, pkg.film.synopsis, 0)];
  const out: PlanEpisodeRecap[] = [];
  let from = 0;
  for (const act of [...pkg.acts].sort((a, b) => a.index - b.index)) {
    const last = pkg.scenes.reduce((m, sc, i) => (sc.act === act.index ? i : m), -1);
    if (last < 0) continue;
    out.push(recapTo(last, act.index, `Episode ${act.index}`, act.purpose, from));
    from = last + 1;
  }
  return out;
}

/** Characters dead by the end of the given packages (for the DECEASED_APPEARS check). */
export function deceasedIn(pkgs: FilmPackage[]): { id: string; name: string }[] {
  const out = new Map<string, string>();
  for (const pkg of pkgs) {
    const names = new Map(pkg.cast.map((c) => [c.id, c.name]));
    for (const sc of pkg.scenes) for (const d of sc.deaths) out.set(d, names.get(d) ?? d);
  }
  return [...out].map(([id, name]) => ({ id, name }));
}
