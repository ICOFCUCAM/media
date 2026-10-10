/**
 * The Animation Studio's orchestration layer (W12; Part 5 §179–186): what a
 * production is made WITH, read from the database before planning.
 *
 *   Character Cards  the owner cast into this production (and, for an
 *                    episode, into its show) — fixed cast the plan must use,
 *                    identity restored after planning (§179, §183).
 *   Show Bible       the show's rules, for an episode (§184).
 *   Previously       what every earlier episode established — audience
 *                    knowledge, deaths, relationships — and the characters
 *                    they introduced, who return with the same identity
 *                    ("Episode 7 knows what happened in Episode 1", §184.3).
 *
 * Nothing here generates media: it tells the existing engines how to work
 * together (§186.4).
 */
import {
  castFromPackage,
  castId,
  deceasedIn,
  FilmPackage,
  recapEpisodes,
  type PlanCastMember,
  type PlanEpisodeRecap,
  type PlanShowBible,
} from "@cineforge/movie";
import type { ProductionSpec } from "@cineforge/shared";
import { NO_CANON, type ProductionCanon } from "./production";

/** A Character Card row (characters, migration 0046). */
export interface CardRow {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  appearance: string;
  personality: string | null;
  voiceProfile: unknown;
  heightCm: number | null;
  hair: string | null;
  eyes: string | null;
  clothing: string | null;
  design: unknown;
}

export const CARD_SELECT = {
  id: true, name: true, age: true, gender: true, appearance: true, personality: true, voiceProfile: true,
  heightCm: true, hair: true, eyes: true, clothing: true, design: true,
} as const;

/** The database reads this module needs (Prisma in production, a fake in tests). */
export interface StudioDb {
  projectCast: {
    findMany(args: { where: { projectId: string }; orderBy: { createdAt: "asc" }; select: { character: { select: typeof CARD_SELECT } } }): Promise<{ character: CardRow }[]>;
  };
  series: {
    findUnique(args: {
      where: { id: string };
      select: { title: true; projectId: true; bible: true; project: { select: { screenplay: { select: { raw: true } } } } };
    }): Promise<{
      title: string;
      projectId: string;
      bible: Record<string, unknown> | null;
      project: { screenplay: { raw: unknown } | null };
    } | null>;
  };
  project: {
    findMany(args: {
      where: { seriesId: string; episodeNumber: { lt: number }; NOT: { id: string } };
      orderBy: [{ episodeNumber: "asc" }, { createdAt: "asc" }];
      select: { episodeNumber: true; seasonNumber: true; title: true; screenplay: { select: { raw: true } } };
    }): Promise<{ episodeNumber: number | null; seasonNumber?: number | null; title: string; screenplay: { raw: unknown } | null }[]>;
  };
}

/** A card's voice for the plan: the description the owner gave it, if any. */
function voiceText(profile: unknown): string | null {
  const p = profile as { description?: unknown } | null;
  return typeof p?.description === "string" && p.description.trim() ? p.description.trim() : null;
}

function designOf(d: unknown): PlanCastMember["design"] {
  const x = d as { proportions?: unknown; palette?: unknown; movement?: unknown } | null;
  return x && typeof x.proportions === "string" && typeof x.palette === "string" && typeof x.movement === "string"
    ? { proportions: x.proportions, palette: x.palette, movement: x.movement }
    : null;
}

/** A Character Card as fixed cast (§179.2: age, height, hair, eyes, clothing, personality, voice, style). */
export function cardToCast(card: CardRow): PlanCastMember {
  const eyes = card.eyes?.trim() ? `; ${card.eyes.trim()} eyes` : "";
  return {
    id: castId(card.name),
    name: card.name.trim(),
    age: card.age,
    gender: card.gender,
    identity: {
      face: `${card.appearance.trim()}${eyes}`,
      hair: card.hair?.trim() || "as described",
      body: card.heightCm ? `${card.heightCm} cm tall` : "as described",
      marks: [],
    },
    wardrobe: card.clothing?.trim() || null,
    personality: card.personality?.trim() || null,
    voice: voiceText(card.voiceProfile),
    design: designOf(card.design),
    source: "card",
  };
}

function packageOf(raw: unknown): FilmPackage | null {
  const parsed = FilmPackage.safeParse((raw as { package?: unknown } | null)?.package);
  return parsed.success ? parsed.data : null;
}

function bibleOf(title: string, b: Record<string, unknown> | null): PlanShowBible {
  const t = (k: string) => (typeof b?.[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim() : null);
  return {
    title,
    genre: t("genre"), audience: t("audience"), worldRules: t("worldRules"), locations: t("locations"),
    musicIdentity: t("musicIdentity"), narrativeRules: t("narrativeRules"), episodeFormat: t("episodeFormat"),
    continuityRules: t("continuityRules"),
  };
}

/** A card the production uses, by its plan id: where to copy its voice and link the character back. */
export interface CardRef {
  cardId: string;
  voiceProfile: unknown;
  card: CardRow;
}

export interface LoadedCanon extends ProductionCanon {
  cards: Map<string, CardRef>;
}

/** Everything a production is made with besides its brief. */
export async function loadProductionCanon(db: StudioDb, projectId: string, spec: ProductionSpec): Promise<LoadedCanon> {
  const cards = new Map<string, CardRef>();
  const addCards = (rows: { character: CardRow }[]) => {
    for (const { character } of rows) {
      const id = castId(character.name);
      if (!cards.has(id)) cards.set(id, { cardId: character.id, voiceProfile: character.voiceProfile, card: character });
    }
  };
  addCards(await db.projectCast.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, select: { character: { select: CARD_SELECT } } }));

  if (spec.kind !== "episode" || !spec.seriesId || !spec.episodeNumber) {
    return { ...NO_CANON, cast: [...cards.values()].map((c) => cardToCast(c.card)), cards };
  }

  const show = await db.series.findUnique({
    where: { id: spec.seriesId },
    select: { title: true, projectId: true, bible: true, project: { select: { screenplay: { select: { raw: true } } } } },
  });
  if (!show) throw new Error(`episode ${projectId}: show ${spec.seriesId} not found`);
  // The show's own cast cards come with every episode.
  addCards(await db.projectCast.findMany({ where: { projectId: show.projectId }, orderBy: { createdAt: "asc" }, select: { character: { select: CARD_SELECT } } }));

  // Earlier episodes, by number: a one-pass season's acts, then episode productions
  // (the newest production of a number replaces anything earlier for it).
  const byNumber = new Map<number, { recap: PlanEpisodeRecap; pkg: FilmPackage }>();
  const seasonPkg = packageOf(show.project.screenplay?.raw);
  if (seasonPkg) {
    for (const r of recapEpisodes(seasonPkg, "acts")) if (r.number < spec.episodeNumber) byNumber.set(r.number, { recap: r, pkg: seasonPkg });
  }
  const earlier = await db.project.findMany({
    where: { seriesId: spec.seriesId, episodeNumber: { lt: spec.episodeNumber }, NOT: { id: projectId } },
    orderBy: [{ episodeNumber: "asc" }, { createdAt: "asc" }],
    select: { episodeNumber: true, seasonNumber: true, title: true, screenplay: { select: { raw: true } } },
  });
  for (const e of earlier) {
    const pkg = packageOf(e.screenplay?.raw);
    if (!pkg || !e.episodeNumber) continue;
    const [recap] = recapEpisodes(pkg, { number: e.episodeNumber, title: e.title });
    if (recap) byNumber.set(e.episodeNumber, { recap: { ...recap, season: e.seasonNumber ?? 1 }, pkg });
  }
  const ordered = [...byNumber.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
  const pkgs = [...new Set(ordered.map((o) => o.pkg))];
  const deceased = deceasedIn(pkgs);
  const dead = new Set(deceased.map((d) => d.id));

  // Returning characters: the latest identity wins; a card is the canonical source.
  const returning = new Map<string, PlanCastMember>();
  for (const pkg of pkgs) for (const c of castFromPackage(pkg)) returning.set(c.id, { ...c, ...(dead.has(c.id) ? { deceased: true } : {}) });
  const cast: PlanCastMember[] = [...cards.values()].map((c) => cardToCast(c.card));
  for (const c of cast) returning.delete(c.id);

  return {
    cast: [...cast, ...returning.values()],
    cards,
    bible: bibleOf(show.title, show.bible),
    episode: { number: spec.episodeNumber, season: spec.seasonNumber ?? 1, previously: ordered.map((o) => o.recap) },
    // A card cast into this episode who died earlier still may appear only in flashbacks.
    deceased,
  };
}
