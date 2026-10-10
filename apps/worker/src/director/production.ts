/**
 * A project's production type → what the Director and the compilers need
 * (W11; Part 5): planning constraints paced for the format, the PRODUCTION
 * section of the plan request, and the animation style the prompts are
 * drawn in. One place, read by planning, canon revisions and seed stills.
 */
import {
  AVG_SHOT_SEC,
  DEFAULT_PRODUCTION,
  KIND_PROFILES,
  MAX_SCENES,
  productionIssues,
  renderLook,
  type AnimationStyle,
  type Medium,
  type ProductionKind,
  type ProductionSpec,
} from "@cineforge/shared";
import type { PlanCastMember, PlanEpisode, PlanProduction, PlanShowBible, ProductionConstraints, RenderStyle } from "@cineforge/movie";

export interface ProductionRow {
  kind?: string | null;
  medium?: string | null;
  animationStyle?: string | null;
  episodes?: number | null;
  seriesId?: string | null;
  episodeNumber?: number | null;
  seasonNumber?: number | null;
}

/** What the production is made with beyond its brief (W12): cast cards, the show bible, earlier episodes. */
export interface ProductionCanon {
  cast: PlanCastMember[];
  bible: PlanShowBible | null;
  episode: PlanEpisode | null;
  /** Characters who died in earlier episodes. */
  deceased: { id: string; name: string }[];
}

export const NO_CANON: ProductionCanon = { cast: [], bible: null, episode: null, deceased: [] };

/** The project's spec; an invalid one (should be impossible past the DB checks) is refused, not guessed. */
export function productionOf(p: ProductionRow): ProductionSpec {
  const spec: ProductionSpec = {
    kind: (p.kind ?? DEFAULT_PRODUCTION.kind) as ProductionKind,
    medium: (p.medium ?? DEFAULT_PRODUCTION.medium) as Medium,
    animationStyle: (p.animationStyle ?? null) as AnimationStyle | null,
    episodes: p.episodes ?? null,
    seriesId: p.seriesId ?? null,
    episodeNumber: p.episodeNumber ?? null,
    seasonNumber: p.seasonNumber ?? null,
  };
  const issues = productionIssues(spec);
  if (issues.length) throw new Error(`invalid production: ${issues.join("; ")}`);
  return spec;
}

/**
 * Planning constraints paced for the format: the scene count follows the
 * format's scene length (a trailer cuts fast, a story breathes); a series has
 * at least one scene per episode.
 */
export function constraintsFor(targetSeconds: number, spec: ProductionSpec, canon: ProductionCanon = NO_CANON): ProductionConstraints {
  const k = KIND_PROFILES[spec.kind];
  let sceneCount = Math.min(MAX_SCENES, Math.max(1, Math.round(targetSeconds / k.sceneSec)));
  if (spec.kind === "series" && spec.episodes) sceneCount = Math.max(sceneCount, spec.episodes);
  const sceneSec = Math.max(2, Math.round(targetSeconds / sceneCount));
  return {
    sceneCount,
    sceneSec,
    sceneTolerance: 0.15,
    // Same shot budget per second as the estimate (planShotCount): ~one shot per AVG_SHOT_SEC.
    maxShotsPerScene: Math.max(1, Math.ceil(k.sceneSec / AVG_SHOT_SEC)),
    maxShotSec: AVG_SHOT_SEC,
    targetSeconds,
    filmTolerance: 0.15,
    ...(spec.kind === "series" && spec.episodes ? { episodes: spec.episodes } : {}),
    ...(k.narrated ? { narrated: true } : {}),
    // W12: animated characters carry a design; cast cards must appear; the dead stay dead.
    ...(spec.medium === "animation" ? { animation: true } : {}),
    ...(canon.cast.some((c) => c.source === "card") ? { cast: canon.cast.filter((c) => c.source === "card").map((c) => ({ id: c.id, name: c.name })) } : {}),
    ...(canon.deceased.length ? { deceased: canon.deceased } : {}),
  };
}

/** The PRODUCTION section of the plan request (none for a plain live-action film with nothing cast: v4 behaviour). */
export function planProductionFor(spec: ProductionSpec, canon: ProductionCanon = NO_CANON): PlanProduction | undefined {
  const hasCanon = canon.cast.length > 0 || canon.bible !== null || canon.episode !== null;
  if (spec.kind === "film" && spec.medium === "live_action" && !hasCanon) return undefined;
  const k = KIND_PROFILES[spec.kind];
  const look = renderLook(spec);
  return {
    format: k.label,
    medium: spec.medium,
    style: look ? { label: look.label, look: look.look, motion: look.motion } : null,
    narrated: k.narrated,
    episodes: spec.kind === "series" ? spec.episodes ?? null : null,
    direction: k.direction,
    ...(canon.cast.length ? { cast: canon.cast } : {}),
    ...(canon.bible ? { bible: canon.bible } : {}),
    ...(canon.episode ? { episode: canon.episode } : {}),
  };
}

/** The style shots are drawn in (null = live action, the compilers' photographic default). */
export function renderStyleFor(spec: ProductionSpec): RenderStyle | null {
  const look = renderLook(spec);
  return look ? { medium: "animation", style: look.id, look: look.look, motion: look.motion, avoid: look.avoid } : null;
}
