/**
 * CineForge Ads Studio — content and logic for /ads (the uploaded design,
 * docs/design/cineforge_ad_studio.html, as a CineForge page). Scene copy and images are
 * the design's own, unchanged.
 *
 * The page can hand its brief to the real advert pipeline (/create/advert):
 * `handoffHref` turns the studio state into a Director-ready brief plus the
 * duration and format, which the Advert studio picks up from the URL. The
 * website's source facts (A2) and the uploaded brand files (A3) travel with it
 * as an `AdsHandoff` in this tab's session storage (lib/ads-live.ts) and are
 * recorded on the advert project (projects.ad_source, brand_assets; 0060).
 */

/** One fact read from the advertiser's page, with the passage that supports it (A2). Mirrors @cineforge/movie SourceFact. */
export interface SiteFact {
  kind: "product" | "benefit" | "audience" | "call_to_action";
  statement: string;
  quote: string;
}

/** What "Analyse" returned (app/api/ads/analyse). */
export interface SiteAnalysis {
  url: string;
  title: string | null;
  brand: string | null;
  facts: SiteFact[];
  /** Facts the model proposed whose quote was not on the page. */
  dropped: number;
  fetchedAt: string;
  /** The page's own pictures (share image, large images), shown on the storyboard. */
  images?: string[];
  logo?: string | null;
  /** How the page was read: by the model, or from its own structure (no model, W32). */
  method?: "model" | "extract";
}

export const FACT_LABEL: Record<SiteFact["kind"], string> = { product: "Product", benefit: "Benefit", audience: "Audience", call_to_action: "Call to action" };

/** How an uploaded file is used: logo → the closing card as supplied; product → references for product shots; other → this browser only. */
export type BrandRole = "logo" | "product" | "other";
export const BRAND_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** The role a file gets when it is added (the owner can change it). */
export function defaultBrandRole(f: { name: string; type: string }, hasLogo: boolean): BrandRole {
  if (!BRAND_IMAGE_TYPES.includes(f.type)) return "other";
  return !hasLogo && /logo|brand|mark/i.test(f.name) ? "logo" : "product";
}

export interface AdScene {
  title: string;
  duration: string;
  visual: string;
  message: string;
  /** Unsplash photo id, as in the design. */
  image: string;
  /** Section label on the storyboard card. */
  label: string;
  /** Card subtitle. */
  blurb: string;
  /** Timecode on the card. */
  span: string;
  /** File the user attached to this scene in this session. */
  asset?: string;
  /** The beat this scene plays (W32: written by the Ads Studio writer). */
  beat?: "opening" | "problem" | "solution" | "how" | "outcome" | "cta";
  /** The product is in the picture (product photos guide the shot). */
  showProduct?: boolean;
}

export const AD_SCENES: AdScene[] = [
  { label: "Opening", blurb: "Establish the world and the brand promise.", span: "0–06s", title: "Make them look", duration: "6 seconds", visual: "A cinematic opening that establishes atmosphere, reveals the brand world and creates a reason to keep watching.", message: "Your website. One unforgettable ad.", image: "photo-1485846234645-a62644f84728" },
  { label: "The problem", blurb: "Make the audience recognise the problem.", span: "06–15s", title: "Show the need", duration: "9 seconds", visual: "Show the audience's problem with empathy and visual clarity. Keep the story specific to the business brief.", message: "Start with what matters.", image: "photo-1497366754035-f200968a6e72" },
  { label: "The solution", blurb: "Show the value in a clear, visual way.", span: "15–27s", title: "Reveal the product", duration: "12 seconds", visual: "Reveal the product or service with a memorable hero composition and credible source-backed benefits.", message: "Meet the solution.", image: "photo-1551434678-e076c223a692" },
  { label: "How it works", blurb: "Demonstrate the workflow or key features.", span: "27–39s", title: "Make it tangible", duration: "12 seconds", visual: "Demonstrate the core experience using actual product screens or uploaded assets where available.", message: "See how it works.", image: "photo-1516321318423-f06f85e504b3" },
  { label: "The outcome", blurb: "Translate features into credible benefits.", span: "39–51s", title: "Show the difference", duration: "12 seconds", visual: "Translate product capabilities into an outcome the audience can understand. Avoid unsupported numerical claims.", message: "A better way forward.", image: "photo-1521737711867-e3b97375f902" },
  { label: "Call to action", blurb: "Brand lock-up, offer and a direct CTA.", span: "51–60s", title: "Make the next step clear", duration: "9 seconds", visual: "Resolve the narrative with brand identity, a concise call to action and the approved destination URL.", message: "Take the next step.", image: "photo-1497366811353-6870744d04b2" },
];

/** A scene picture: a full URL (the advertiser's page, an attached file) as is, else an Unsplash id from the design. */
export const unsplash = (id: string, w: number, q: number) => (/^(https?:|blob:)/.test(id) ? id : `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=${q}`);

/* ── W32: the storyboard written by the Ads Studio writer (app/api/ads/storyboard) ── */

export interface WrittenScene {
  beat: NonNullable<AdScene["beat"]>;
  title: string;
  seconds: number;
  visual: string;
  message: string;
  showProduct: boolean;
}

const BEAT_LABELS: Record<WrittenScene["beat"], string> = {
  opening: "Opening", problem: "The problem", solution: "The solution", how: "How it works", outcome: "The outcome", cta: "Call to action",
};
const BEAT_BLURB: Record<WrittenScene["beat"], string> = {
  opening: "Establish the world and the brand promise.", problem: "Make the audience recognise the problem.", solution: "Show the value in a clear, visual way.",
  how: "Demonstrate the workflow or key features.", outcome: "Translate features into credible benefits.", cta: "Brand lock-up, offer and a direct CTA.",
};
const BEAT_IMAGE: Record<WrittenScene["beat"], string> = Object.fromEntries(
  (["opening", "problem", "solution", "how", "outcome", "cta"] as const).map((b, i) => [b, AD_SCENES[i]!.image]),
) as Record<WrittenScene["beat"], string>;

const pad = (n: number) => String(n).padStart(2, "0");

/** The written storyboard as the page's scene cards; the page's own pictures replace the design's where there are some (pure). */
export function cardsFrom(written: WrittenScene[], pageImages: string[] = []): AdScene[] {
  let at = 0;
  return written.map((w, i) => {
    const from = at;
    at += w.seconds;
    return {
      beat: w.beat, title: w.title, duration: `${w.seconds} seconds`, visual: w.visual, message: w.message, showProduct: w.showProduct,
      label: BEAT_LABELS[w.beat], blurb: BEAT_BLURB[w.beat], span: `${pad(from)}–${pad(at)}s`,
      image: pageImages.length ? pageImages[i % pageImages.length]! : BEAT_IMAGE[w.beat],
    };
  });
}

/** The page's scene cards back as the writer's storyboard (lengths in whole seconds) (pure). */
export function writtenFrom(cards: AdScene[]): WrittenScene[] {
  return cards.map((c, i) => ({
    beat: c.beat ?? (["opening", "problem", "solution", "how", "outcome", "cta"] as const)[Math.min(i, 5)]!,
    title: c.title, seconds: parseInt(c.duration, 10) || 5, visual: c.visual, message: c.message, showProduct: c.showProduct ?? true,
  }));
}

/** Recompute the timecodes after a length changes (pure). */
export function respan(cards: AdScene[]): AdScene[] {
  let at = 0;
  return cards.map((c) => {
    const from = at;
    at += parseInt(c.duration, 10) || 0;
    return { ...c, span: `${pad(from)}–${pad(at)}s` };
  });
}

/** The voice choice as the writer reads it: no narration, or a narrator speaking each scene's line. */
export const voiceMode = (voice: string): "narrator" | "none" => (/^no narration/i.test(voice) ? "none" : "narrator");
export const ASPECT_OF: Record<string, "16:9" | "9:16" | "1:1"> = { "16:9 Landscape": "16:9", "9:16 Vertical": "9:16", "1:1 Square": "1:1" };

export interface AdStudioState {
  url: string;
  brief: string;
  duration: string;
  style: string;
  assets: string;
  voice: string;
  formats: string[];
  uploaded: { name: string; size: number; type: string; role?: BrandRole }[];
  scenes: AdScene[];
  /** The analysed page (A2), when "Analyse" ran. */
  analysis?: SiteAnalysis | null;
}

/** The production brief the design exports (same shape as the original getPlan()). */
export function productionPlan(s: AdStudioState) {
  return {
    product: "CineForge Ad Studio",
    sourceUrl: s.url.trim() || null,
    objective: s.brief.trim() || "Create a persuasive, source-grounded advertisement.",
    duration: s.duration,
    creativeStyle: s.style,
    assetStrategy: s.assets,
    voice: s.voice,
    formats: s.formats,
    uploadedAssets: s.uploaded.map((a) => ({ name: a.name, type: a.type, sizeBytes: a.size, use: a.role ?? "other" })),
    sourceFacts: s.analysis ? { url: s.analysis.url, facts: s.analysis.facts } : null,
    scenes: s.scenes.map((sc, i) => ({
      scene: i + 1, title: sc.title, targetDuration: sc.duration, visualDirection: sc.visual, onScreenMessage: sc.message, userAsset: sc.asset ?? null,
    })),
    status: "PLAN_PREVIEW — this brief is planned and generated only after \"Produce this ad in CineForge\".",
  };
}

const ASPECT: Record<string, "16:9" | "9:16" | "1:1"> = { "16:9 Landscape": "16:9", "9:16 Vertical": "9:16", "1:1 Square": "1:1" };

/** One Director-ready brief from the studio state (the Director writes the spot from it). */
export function directorBrief(s: AdStudioState): string {
  const lines = [
    `A ${parseInt(s.duration, 10) || 30}-second advertisement. ${s.brief.trim() || "Create a persuasive, source-grounded advertisement."}`,
    s.url.trim() ? `Product / website: ${s.url.trim()} (use only claims the brand can support).` : null,
    ...(s.analysis?.facts.length
      ? ["Source facts from the page (claim nothing beyond them):", ...s.analysis.facts.map((f) => `- ${FACT_LABEL[f.kind]}: ${f.statement} (page: "${f.quote}")`)]
      : []),
    `Creative direction: ${s.style}. Production approach: ${s.assets}. Voice-over: ${s.voice}.`,
    "Scene plan:",
    ...s.scenes.map((sc, i) => `${i + 1}. ${sc.title} (${sc.duration}) — ${sc.visual} On screen: "${sc.message}"`),
    "End on the brand lock-up with a clear call to action.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 4000);
}

/** Link into the real Advert studio with this brief, length and first selected format (and the stashed facts and files, by id). */
export function handoffHref(s: AdStudioState, handoffId?: string): string {
  const seconds = parseInt(s.duration, 10) || 30;
  const aspect = ASPECT[s.formats[0] ?? ""] ?? "16:9";
  const q = new URLSearchParams({ brief: directorBrief(s), seconds: String(seconds), aspect, ...(handoffId ? { handoff: handoffId } : {}) });
  return `/create/advert?${q.toString()}`;
}

/* ── A5: a scene edit on the live advert, as Director instructions ─────── */

export interface SceneDraft {
  visual: string;
  line: string;
  seconds: number;
}

/**
 * The owner's scene edit as Director instructions (pure). The Director makes at
 * most one change per instruction, so the look and words of the scene go in one
 * (a scene revision) and its length in another (the Editor proposes the cut).
 * Unchanged fields are not sent.
 */
export function sceneInstructions(scene: { index: number; heading: string; summary: string; durationSec: number; firstLine: string | null; narration: string | null }, draft: SceneDraft): string[] {
  const n = scene.index + 1;
  const out: string[] = [];
  const visual = draft.visual.trim();
  const line = draft.line.trim();
  const lineBefore = (scene.firstLine ?? scene.narration ?? "").trim();
  const visualChanged = visual && visual !== scene.summary.trim();
  const lineChanged = line && line !== lineBefore;
  if (visualChanged || lineChanged) {
    out.push([
      `Revise scene ${n} ("${scene.heading}")${visualChanged ? `: ${visual}` : "."}`,
      lineChanged ? ` Its spoken line should become: "${line}"${/[.!?]$/.test(line) ? "" : "."}` : "",
      " Keep who is in it and what happens; keep every claim to the source facts.",
    ].join("").slice(0, 2000));
  }
  const sec = Math.round(draft.seconds);
  if (Number.isFinite(sec) && sec >= 2 && sec !== Math.round(scene.durationSec)) {
    out.push(`Make scene ${n} ("${scene.heading}") ${sec} seconds long (it runs ${Math.round(scene.durationSec)} s now).`);
  }
  return out;
}

/**
 * Commercial model for Ads Studio as its own product (owner direction,
 * 2026-10-08): pay-as-you-go from $10 per ad, or a monthly plan. PLANNED —
 * not on sale: no checkout exists for it yet and the page shows the design's
 * illustrative tiers. Prices must be confirmed against measured GPU cost per
 * ad before launch (docs/47).
 */
export const ADS_STUDIO_COMMERCIAL = {
  status: "planned" as const,
  payAsYouGo: { usdPerAd: 10, includes: "one finished ad up to 30 s in one format" },
  monthly: [
    { id: "ads-creator", name: "Creator", usdPerMonth: null as number | null, note: "price to be set after cost measurement" },
    { id: "ads-agency", name: "Studio / Agency", usdPerMonth: null as number | null, note: "per workspace, metered" },
  ],
};
