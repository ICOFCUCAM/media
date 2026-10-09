/**
 * CineForge Ads Studio — content and logic for /ads (the uploaded design,
 * docs/design/cineforge_ad_studio.html, as a CineForge page). Scene copy and images are
 * the design's own, unchanged.
 *
 * The page can hand its brief to the real advert pipeline (/create/advert):
 * `handoffHref` turns the studio state into a Director-ready brief plus the
 * duration and format, which the Advert studio picks up from the URL.
 */

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
}

export const AD_SCENES: AdScene[] = [
  { label: "Opening", blurb: "Establish the world and the brand promise.", span: "0–06s", title: "Make them look", duration: "6 seconds", visual: "A cinematic opening that establishes atmosphere, reveals the brand world and creates a reason to keep watching.", message: "Your website. One unforgettable ad.", image: "photo-1485846234645-a62644f84728" },
  { label: "The problem", blurb: "Make the audience recognise the problem.", span: "06–15s", title: "Show the need", duration: "9 seconds", visual: "Show the audience's problem with empathy and visual clarity. Keep the story specific to the business brief.", message: "Start with what matters.", image: "photo-1497366754035-f200968a6e72" },
  { label: "The solution", blurb: "Show the value in a clear, visual way.", span: "15–27s", title: "Reveal the product", duration: "12 seconds", visual: "Reveal the product or service with a memorable hero composition and credible source-backed benefits.", message: "Meet the solution.", image: "photo-1551434678-e076c223a692" },
  { label: "How it works", blurb: "Demonstrate the workflow or key features.", span: "27–39s", title: "Make it tangible", duration: "12 seconds", visual: "Demonstrate the core experience using actual product screens or uploaded assets where available.", message: "See how it works.", image: "photo-1516321318423-f06f85e504b3" },
  { label: "The outcome", blurb: "Translate features into credible benefits.", span: "39–51s", title: "Show the difference", duration: "12 seconds", visual: "Translate product capabilities into an outcome the audience can understand. Avoid unsupported numerical claims.", message: "A better way forward.", image: "photo-1521737711867-e3b97375f902" },
  { label: "Call to action", blurb: "Brand lock-up, offer and a direct CTA.", span: "51–60s", title: "Make the next step clear", duration: "9 seconds", visual: "Resolve the narrative with brand identity, a concise call to action and the approved destination URL.", message: "Take the next step.", image: "photo-1497366811353-6870744d04b2" },
];

export const unsplash = (id: string, w: number, q: number) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=${q}`;

export interface AdStudioState {
  url: string;
  brief: string;
  duration: string;
  style: string;
  assets: string;
  voice: string;
  formats: string[];
  uploaded: { name: string; size: number; type: string }[];
  scenes: AdScene[];
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
    uploadedAssets: s.uploaded.map((a) => ({ name: a.name, type: a.type, sizeBytes: a.size })),
    scenes: s.scenes.map((sc, i) => ({
      scene: i + 1, title: sc.title, targetDuration: sc.duration, visualDirection: sc.visual, onScreenMessage: sc.message, userAsset: sc.asset ?? null,
    })),
    status: "FRONTEND_CONCEPT_ONLY — website analysis, AI generation, and rendering are not connected.",
  };
}

const ASPECT: Record<string, "16:9" | "9:16" | "1:1"> = { "16:9 Landscape": "16:9", "9:16 Vertical": "9:16", "1:1 Square": "1:1" };

/** One Director-ready brief from the studio state (the Director writes the spot from it). */
export function directorBrief(s: AdStudioState): string {
  const lines = [
    `A ${parseInt(s.duration, 10) || 30}-second advertisement. ${s.brief.trim() || "Create a persuasive, source-grounded advertisement."}`,
    s.url.trim() ? `Product / website: ${s.url.trim()} (use only claims the brand can support).` : null,
    `Creative direction: ${s.style}. Production approach: ${s.assets}. Voice-over: ${s.voice}.`,
    "Scene plan:",
    ...s.scenes.map((sc, i) => `${i + 1}. ${sc.title} (${sc.duration}) — ${sc.visual} On screen: "${sc.message}"`),
    "End on the brand lock-up with a clear call to action.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 4000);
}

/** Link into the real Advert studio with this brief, length and first selected format. */
export function handoffHref(s: AdStudioState): string {
  const seconds = parseInt(s.duration, 10) || 30;
  const aspect = ASPECT[s.formats[0] ?? ""] ?? "16:9";
  const q = new URLSearchParams({ brief: directorBrief(s), seconds: String(seconds), aspect });
  return `/create/advert?${q.toString()}`;
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
