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
import type { PlanProduction, ProductionConstraints, RenderStyle } from "@cineforge/movie";

export interface ProductionRow {
  kind?: string | null;
  medium?: string | null;
  animationStyle?: string | null;
  episodes?: number | null;
}

/** The project's spec; an invalid one (should be impossible past the DB checks) is refused, not guessed. */
export function productionOf(p: ProductionRow): ProductionSpec {
  const spec: ProductionSpec = {
    kind: (p.kind ?? DEFAULT_PRODUCTION.kind) as ProductionKind,
    medium: (p.medium ?? DEFAULT_PRODUCTION.medium) as Medium,
    animationStyle: (p.animationStyle ?? null) as AnimationStyle | null,
    episodes: p.episodes ?? null,
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
export function constraintsFor(targetSeconds: number, spec: ProductionSpec): ProductionConstraints {
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
  };
}

/** The PRODUCTION section of the plan request (none for a plain live-action film: v4 behaviour). */
export function planProductionFor(spec: ProductionSpec): PlanProduction | undefined {
  if (spec.kind === "film" && spec.medium === "live_action") return undefined;
  const k = KIND_PROFILES[spec.kind];
  const look = renderLook(spec);
  return {
    format: k.label,
    medium: spec.medium,
    style: look ? { label: look.label, look: look.look, motion: look.motion } : null,
    narrated: k.narrated,
    episodes: spec.kind === "series" ? spec.episodes ?? null : null,
    direction: k.direction,
  };
}

/** The style shots are drawn in (null = live action, the compilers' photographic default). */
export function renderStyleFor(spec: ProductionSpec): RenderStyle | null {
  const look = renderLook(spec);
  return look ? { medium: "animation", style: look.id, look: look.look, motion: look.motion, avoid: look.avoid } : null;
}
