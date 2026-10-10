// NOTE: mirrors packages/shared/src/production.ts byte for byte below this
// header (the @cineforge/shared barrel is not client-safe). A test in
// packages/shared fails if the two drift.
/**
 * Production types (DirectorOS W11; Part 5 §177–186). What is being made is
 * DATA on the project — a format, a medium and, for animation, a style — that
 * the web, the Director and the prompt compilers all read from here. It is
 * never words folded into the brief.
 *
 *   format   film · short film · series · trailer · social short · advert ·
 *            story · motion comic · episode (one episode of a show, W12)
 *   medium   live action · animation
 *   style    (animation) 2D: traditional, TV cartoon, anime-inspired, comic
 *            book, children's illustration · 3D: stylized, toy-like, family,
 *            cinematic, low-poly · storybook · motion comic
 */

export const PRODUCTION_KINDS = ["film", "short_film", "series", "trailer", "social_short", "advert", "story", "motion_comic", "episode"] as const;
export type ProductionKind = (typeof PRODUCTION_KINDS)[number];

export const MEDIUMS = ["live_action", "animation"] as const;
export type Medium = (typeof MEDIUMS)[number];

export const ANIMATION_STYLES = [
  "2d_traditional", "2d_tv", "anime", "comic_book", "childrens_illustration",
  "3d_stylized", "3d_toy", "3d_family", "3d_cinematic", "low_poly",
  "storybook", "motion_comic",
] as const;
export type AnimationStyle = (typeof ANIMATION_STYLES)[number];

/**
 * A series planned in one pass has one act per episode, and the Film IR has
 * at most 5 acts. Longer shows are made episode by episode (kind "episode"),
 * each reading the Show Bible and what earlier episodes established (W12).
 */
export const SERIES_MAX_EPISODES = 5;
export const EPISODE_MAX_NUMBER = 500;
/** Seasons a show may run to (W26); episode numbers run on across them. */
export const SEASON_MAX_NUMBER = 50;

export interface KindProfile {
  id: ProductionKind;
  label: string;
  /** Allowed runtime, seconds. */
  minSec: number;
  maxSec: number;
  defaultSec: number;
  /** Target scene length: sets the scene count and the pace. */
  sceneSec: number;
  /** Aspects the format may use (first = default). Empty = any. */
  aspects: string[];
  /** The medium this format always uses, if it fixes one. */
  medium?: Medium;
  style?: AnimationStyle;
  /** Every scene carries narration. */
  narrated: boolean;
  /** How the Director must shape the plan — sent with the brief, versioned with the prompt. */
  direction: string[];
}

export const KIND_PROFILES: Record<ProductionKind, KindProfile> = {
  film: {
    id: "film", label: "Film", minSec: 60, maxSec: 7200, defaultSec: 300, sceneSec: 18, aspects: [], narrated: false,
    direction: ["A complete story with a beginning, a turn and an ending; acts follow the story's own shape."],
  },
  short_film: {
    id: "short_film", label: "Short film", minSec: 30, maxSec: 1200, defaultSec: 180, sceneSec: 15, aspects: [], narrated: false,
    direction: ["One clear dramatic question, set up early and answered by the end.", "Few characters and places; every scene moves the question forward."],
  },
  series: {
    id: "series", label: "Series", minSec: 120, maxSec: 7200, defaultSec: 600, sceneSec: 18, aspects: [], narrated: false,
    direction: [
      "Each act is one EPISODE, in order; the package has exactly as many acts as episodes.",
      "Every episode has its own story beat and ends on a hook into the next.",
      "Characters, world and continuity carry across episodes; nothing is reset between them.",
    ],
  },
  trailer: {
    id: "trailer", label: "Trailer", minSec: 15, maxSec: 180, defaultSec: 60, sceneSec: 6, aspects: [], narrated: false,
    direction: [
      "A trailer, not the film: short, escalating beats that sell the premise, the world and the conflict.",
      "Never reveal the ending; build to a final title beat.",
      "Fast cutting: brief scenes, strong images, music-driven pace.",
    ],
  },
  social_short: {
    id: "social_short", label: "Social short", minSec: 5, maxSec: 90, defaultSec: 30, sceneSec: 5, aspects: ["9:16", "1:1", "4:5"], narrated: false,
    direction: [
      "Vertical, phone-first framing: subjects centred, close and readable on a small screen.",
      "Hook in the first shot (within two seconds); one idea; an ending that invites a replay.",
    ],
  },
  advert: {
    id: "advert", label: "Advert", minSec: 6, maxSec: 120, defaultSec: 30, sceneSec: 5, aspects: [], narrated: false,
    direction: [
      "The product or offer in the brief is shown clearly and early, and named in speech or narration.",
      "The last scene is the call to action from the brief.",
      "Brand-safe: no disparagement, no unverifiable claims, no living public figures.",
    ],
  },
  story: {
    id: "story", label: "Story", minSec: 30, maxSec: 1800, defaultSec: 180, sceneSec: 15, aspects: [], narrated: true,
    direction: [
      "Told by a narrator: every scene has narration that carries the story; dialogue is sparing.",
      "Develop the idea into story, characters, world and scenes — the brief may be a single sentence.",
    ],
  },
  episode: {
    id: "episode", label: "Episode", minSec: 60, maxSec: 3600, defaultSec: 600, sceneSec: 18, aspects: [], narrated: false,
    direction: [
      "One episode of an ongoing show: follow the SHOW BIBLE and its episode format.",
      "Continue from PREVIOUSLY: characters, facts, deaths and relationships carry over and are never contradicted.",
      "A complete episode story that ends on a hook into the next.",
    ],
  },
  motion_comic: {
    id: "motion_comic", label: "Motion comic", minSec: 30, maxSec: 1800, defaultSec: 120, sceneSec: 12, aspects: [], narrated: false,
    medium: "animation", style: "motion_comic",
    direction: [
      "Each shot is a comic PANEL: a strong composed image, brought to life by camera movement (pan, tilt, slow push) and light character motion.",
      "Dialogue is spoken by the characters; sound effects punctuate panel changes.",
    ],
  },
};

export interface StyleProfile {
  id: AnimationStyle;
  label: string;
  family: "2d" | "3d" | "storybook" | "motion_comic";
  /** The look, in words image and video models follow. */
  look: string;
  /** How things move. */
  motion: string;
  /** What the model must avoid for this look (added to the negative prompt). */
  avoid: string;
  /**
   * How shots are made (W12; Part 5 §181.4–6): "video" runs the video model;
   * "still_motion" draws each shot as one illustrated page or comic panel and
   * moves the camera across it — no video model, a fraction of the cost.
   */
  pipeline: "video" | "still_motion";
}

const NOT_PHOTO = "photorealistic, live action, real photograph";

export const STYLE_PROFILES: Record<AnimationStyle, StyleProfile> = {
  "2d_traditional": { id: "2d_traditional", label: "2D traditional", family: "2d", look: "hand-drawn 2D animation, clean ink lines, painted backgrounds, classic feature-animation look", motion: "smooth, expressive character animation with squash and stretch", avoid: NOT_PHOTO, pipeline: "video" },
  "2d_tv": { id: "2d_tv", label: "Modern TV cartoon", family: "2d", look: "modern 2D TV cartoon, bold flat colours, simple shapes, crisp outlines", motion: "snappy, poses held between quick moves", avoid: NOT_PHOTO, pipeline: "video" },
  anime: { id: "anime", label: "Anime-inspired", family: "2d", look: "anime-inspired 2D animation, cel shading, detailed painted backgrounds, expressive eyes", motion: "dynamic camera, held poses with sudden action, speed lines in action", avoid: NOT_PHOTO, pipeline: "video" },
  comic_book: { id: "comic_book", label: "Comic-book", family: "2d", look: "comic-book style, heavy ink outlines, halftone shading, saturated colours", motion: "punchy poses, dramatic angles", avoid: NOT_PHOTO, pipeline: "video" },
  childrens_illustration: { id: "childrens_illustration", label: "Children's illustration", family: "2d", look: "children's picture-book illustration, soft watercolour and gouache textures, gentle rounded shapes", motion: "gentle, slow, friendly movement", avoid: `${NOT_PHOTO}, scary imagery`, pipeline: "video" },
  "3d_stylized": { id: "3d_stylized", label: "Stylized 3D", family: "3d", look: "stylized 3D animation, exaggerated proportions, soft global illumination, rich materials", motion: "appealing, bouncy character animation", avoid: NOT_PHOTO, pipeline: "video" },
  "3d_toy": { id: "3d_toy", label: "Toy-like 3D", family: "3d", look: "toy-like 3D, plastic and felt materials, miniature sets, shallow depth of field", motion: "stop-motion-like, slightly stepped movement", avoid: NOT_PHOTO, pipeline: "video" },
  "3d_family": { id: "3d_family", label: "Family animation", family: "3d", look: "family feature 3D animation, warm lighting, big expressive faces, polished render", motion: "lively, readable acting", avoid: NOT_PHOTO, pipeline: "video" },
  "3d_cinematic": { id: "3d_cinematic", label: "Cinematic 3D", family: "3d", look: "cinematic 3D animation, dramatic lighting, detailed environments, filmic camera", motion: "grounded, weighty movement", avoid: "live action, real photograph", pipeline: "video" },
  low_poly: { id: "low_poly", label: "Low-poly", family: "3d", look: "low-poly 3D, faceted geometry, flat-shaded pastel colours", motion: "simple, clean movement", avoid: NOT_PHOTO, pipeline: "video" },
  storybook: { id: "storybook", label: "Storybook", family: "storybook", look: "illustrated storybook page, painterly illustration, textured paper", motion: "slow camera drifts across the page, subtle character animation", avoid: NOT_PHOTO, pipeline: "still_motion" },
  motion_comic: { id: "motion_comic", label: "Motion comic", family: "motion_comic", look: "comic panel, inked line art, flat colours, halftone texture, panel composition", motion: "camera pans, tilts and slow pushes across the panel; limited character motion", avoid: NOT_PHOTO, pipeline: "still_motion" },
};

export interface ProductionSpec {
  kind: ProductionKind;
  medium: Medium;
  animationStyle: AnimationStyle | null;
  /** Series: episodes in the season. */
  episodes?: number | null;
  /** Episode (W12): the show it belongs to and its number in the show. */
  seriesId?: string | null;
  episodeNumber?: number | null;
  /** Its season (W26): absent = season 1; never before an earlier episode's season. */
  seasonNumber?: number | null;
}

/** True when the production's shots are drawn stills moved by the camera (storybook, motion comic). */
export function isStillMotion(p: Pick<ProductionSpec, "medium" | "animationStyle">): boolean {
  return renderLook(p)?.pipeline === "still_motion";
}

export const DEFAULT_PRODUCTION: ProductionSpec = { kind: "film", medium: "live_action", animationStyle: null };

/** Problems with a production spec (empty = valid): the same rules the database enforces. */
export function productionIssues(p: ProductionSpec, targetSeconds?: number, aspect?: string): string[] {
  const out: string[] = [];
  const k = KIND_PROFILES[p.kind];
  if (!k) return [`unknown format ${JSON.stringify(p.kind)}`];
  if (!MEDIUMS.includes(p.medium)) out.push(`unknown medium ${JSON.stringify(p.medium)}`);
  if (p.medium === "animation" && !p.animationStyle) out.push("animation needs a style");
  if (p.medium === "live_action" && p.animationStyle) out.push("live action has no animation style");
  if (p.animationStyle && !ANIMATION_STYLES.includes(p.animationStyle)) out.push(`unknown animation style ${JSON.stringify(p.animationStyle)}`);
  if (k.medium && p.medium !== k.medium) out.push(`a ${k.label.toLowerCase()} is ${k.medium.replace("_", " ")}`);
  if (k.style && p.animationStyle !== k.style) out.push(`a ${k.label.toLowerCase()} uses the ${STYLE_PROFILES[k.style].label} style`);
  if (p.kind === "series" ? !p.episodes || p.episodes < 1 || p.episodes > SERIES_MAX_EPISODES : p.episodes != null) {
    out.push(p.kind === "series"
      ? `a series made in one pass has 1–${SERIES_MAX_EPISODES} episodes; make longer shows episode by episode`
      : "only a series has episodes");
  }
  const isEpisode = p.kind === "episode";
  if (isEpisode !== Boolean(p.seriesId) || (p.episodeNumber != null) !== isEpisode) {
    out.push(isEpisode ? "an episode names its show and its number" : "only an episode belongs to a show");
  } else if (isEpisode && (!Number.isInteger(p.episodeNumber) || p.episodeNumber! < 1 || p.episodeNumber! > EPISODE_MAX_NUMBER)) {
    out.push(`an episode number is 1–${EPISODE_MAX_NUMBER}`);
  }
  if (p.seasonNumber != null && (!isEpisode || !Number.isInteger(p.seasonNumber) || p.seasonNumber < 1 || p.seasonNumber > SEASON_MAX_NUMBER)) {
    out.push(isEpisode ? `a season is 1–${SEASON_MAX_NUMBER}` : "only an episode has a season");
  }
  if (targetSeconds !== undefined && (targetSeconds < k.minSec || targetSeconds > k.maxSec)) {
    out.push(`a ${k.label.toLowerCase()} runs ${k.minSec}–${k.maxSec}s, not ${targetSeconds}s`);
  }
  if (aspect && k.aspects.length && !k.aspects.includes(aspect)) out.push(`a ${k.label.toLowerCase()} is ${k.aspects.join(" or ")}, not ${aspect}`);
  return out;
}

/** The look words for a production (null for live action: the compilers keep their photographic default). */
export function renderLook(p: Pick<ProductionSpec, "medium" | "animationStyle">): StyleProfile | null {
  return p.medium === "animation" && p.animationStyle ? STYLE_PROFILES[p.animationStyle] : null;
}
