/**
 * Creator-facing product + navigation model. This is the source of truth for
 * what a *filmmaker* sees — Create / Produce / Publish / Monetize — as opposed
 * to the engine internals (GPU pools, queues, FFmpeg, model routing), which are
 * confined to the Super Admin area (lib/system.ts → /admin).
 */

export type Role = "creator" | "owner" | "admin";

export const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "creator", label: "Creator", blurb: "Make films, series, trailers and shorts." },
  { id: "owner", label: "Studio Owner", blurb: "Manage productions, teams and revenue." },
  { id: "admin", label: "Super Admin", blurb: "Operate the platform: GPUs, queues, models." },
];

/** The headline products on the homepage and the “Create” menu. */
export interface Product {
  id: "film" | "series" | "trailer" | "shorts";
  title: string;
  tagline: string;
  href: string;
  /** Duration presets, in seconds, offered on the create screen. */
  durations: { label: string; value: number }[];
  defaultSeconds: number;
  accent: string; // tailwind gradient stops
}

export const PRODUCTS: Product[] = [
  {
    id: "film",
    title: "Create a Film",
    tagline: "Feature-length stories from a single prompt — script, cast, score and cut.",
    href: "/create/film",
    durations: [
      { label: "1 min", value: 60 },
      { label: "2 min", value: 120 },
      { label: "5 min", value: 300 },
      { label: "15 min", value: 900 },
      { label: "30 min", value: 1800 },
    ],
    defaultSeconds: 120,
    accent: "from-indigo-500 to-fuchsia-500",
  },
  {
    id: "series",
    title: "Create a Series",
    tagline: "Multi-episode shows with persistent characters and story continuity.",
    href: "/create/series",
    durations: [
      { label: "3 × 10 min", value: 1800 },
      { label: "6 × 10 min", value: 3600 },
      { label: "8 × 20 min", value: 9600 },
    ],
    defaultSeconds: 3600,
    accent: "from-amber-500 to-rose-500",
  },
  {
    id: "trailer",
    title: "Create a Trailer",
    tagline: "Punchy, festival-grade trailers and teasers in seconds.",
    href: "/create/trailer",
    durations: [
      { label: "15 sec", value: 15 },
      { label: "30 sec", value: 30 },
      { label: "60 sec", value: 60 },
      { label: "90 sec", value: 90 },
    ],
    defaultSeconds: 30,
    accent: "from-sky-500 to-cyan-400",
  },
  {
    id: "shorts",
    title: "Create Shorts",
    tagline: "Vertical, platform-ready clips for every social feed.",
    href: "/create/shorts",
    durations: [
      { label: "5 sec", value: 5 },
      { label: "10 sec", value: 10 },
      { label: "15 sec", value: 15 },
      { label: "30 sec", value: 30 },
      { label: "60 sec", value: 60 },
    ],
    defaultSeconds: 15,
    accent: "from-emerald-500 to-teal-400",
  },
];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);

/** The creator’s mental model of the platform: outcomes, not engines. */
export const WORKFLOW: { step: string; title: string; blurb: string }[] = [
  { step: "01", title: "Create", blurb: "Describe it. The studio writes, casts, shoots and scores it." },
  { step: "02", title: "Edit", blurb: "Trim scenes, swap shots and re-voice lines — non-destructively." },
  { step: "03", title: "Publish", blurb: "One click to every platform: YouTube, TikTok, Reels and more." },
  { step: "04", title: "Monetize", blurb: "Sell films, characters, worlds and voice packs in the marketplace." },
];

/** Short-form platform presets (the largest creator module). */
export interface ShortPlatform {
  id: string;
  name: string;
  aspect: string;
  durations: number[];
}

export const SHORT_PLATFORMS: ShortPlatform[] = [
  { id: "tiktok", name: "TikTok", aspect: "9:16", durations: [5, 10, 15, 30, 60] },
  { id: "yt-shorts", name: "YouTube Shorts", aspect: "9:16", durations: [15, 30, 60] },
  { id: "ig-reels", name: "Instagram Reels", aspect: "9:16", durations: [15, 30, 60, 90] },
  { id: "fb-reels", name: "Facebook Reels", aspect: "9:16", durations: [15, 30, 60] },
  { id: "snap", name: "Snapchat", aspect: "9:16", durations: [10, 30, 60] },
  { id: "pinterest", name: "Pinterest", aspect: "9:16", durations: [15, 30, 60] },
];

/** Publish-everywhere distribution channels. */
export const SOCIAL_CHANNELS: { id: string; name: string; kind: "video" | "short" | "post" }[] = [
  { id: "youtube", name: "YouTube", kind: "video" },
  { id: "yt-shorts", name: "YouTube Shorts", kind: "short" },
  { id: "tiktok", name: "TikTok", kind: "short" },
  { id: "instagram", name: "Instagram", kind: "post" },
  { id: "ig-reels", name: "Instagram Reels", kind: "short" },
  { id: "facebook", name: "Facebook", kind: "video" },
  { id: "fb-reels", name: "Facebook Reels", kind: "short" },
  { id: "x", name: "X", kind: "post" },
  { id: "linkedin", name: "LinkedIn", kind: "post" },
  { id: "snapchat", name: "Snapchat", kind: "short" },
  { id: "pinterest", name: "Pinterest", kind: "post" },
  { id: "telegram", name: "Telegram", kind: "post" },
  { id: "whatsapp", name: "WhatsApp Channels", kind: "post" },
  { id: "threads", name: "Threads", kind: "post" },
];

/** Creator marketplace — sell the assets you generate. */
export const MARKETPLACE_CATEGORIES: { id: string; name: string; blurb: string }[] = [
  { id: "films", name: "Film Assets", blurb: "Finished films, scenes and B-roll, licensed your way." },
  { id: "characters", name: "Characters", blurb: "Reusable cast with locked identity and wardrobe." },
  { id: "voices", name: "Voice Packs", blurb: "Cloned and designed voices for narration and dialogue." },
  { id: "worlds", name: "Story Worlds", blurb: "Locations, lore and continuity bibles ready to film in." },
  { id: "templates", name: "Templates", blurb: "Genre kits, trailer formats and short-form recipes." },
];

/** Sample marketplace listings (priced) — a real economy, not placeholders. */
export const MARKETPLACE_ITEMS: { name: string; kind: string; price: number; accent: string }[] = [
  { name: "Heroine Character Pack", kind: "Character", price: 49, accent: "from-indigo-500/40 to-fuchsia-500/30" },
  { name: "Fantasy Kingdom", kind: "Story World", price: 199, accent: "from-amber-500/40 to-rose-500/30" },
  { name: "Narrator Voice — “Onyx”", kind: "Voice Pack", price: 29, accent: "from-cyan-500/40 to-blue-500/30" },
  { name: "Cyberpunk Megacity", kind: "Story World", price: 149, accent: "from-emerald-500/40 to-teal-500/30" },
  { name: "Trailer Template — Teaser", kind: "Template", price: 19, accent: "from-rose-500/40 to-orange-500/30" },
  { name: "Creature Set — Beasts", kind: "Asset Pack", price: 79, accent: "from-violet-500/40 to-purple-500/30" },
];

/** Idea → Audience: the full transformation Cineforge sells. */
export const IDEA_TO_AUDIENCE: string[] = [
  "Idea", "Script", "Characters", "Scenes", "Film", "Trailer", "YouTube", "TikTok", "Revenue",
];

/** Pricing tiers (mirrors the `tier` enum). */
// Mirrors lib/plans.ts / docs/33 — the REAL plans the checkout sells.
export const PRICING: { tier: string; price: string; tagline: string; features: string[]; highlight?: boolean }[] = [
  { tier: "Free", price: "$0", tagline: "Taste the magic", features: ["200 trial credits", "Draft films up to 30s", "Speech reading (stock voice)", "Community voices"] },
  { tier: "Creator", price: "$19/mo", tagline: "Finished films, not clips", features: ["2,500 credits/month", "Standard engine + narration", "Consistent characters & worlds", "Storyboard control + dubbing", "Private streaming channel"] },
  { tier: "Studio", price: "$59/mo", tagline: "Cinematic unlocked", features: ["9,000 credits/month", "Frontier video engine", "All 20 languages + subtitles", "Avatars + public channel", "Full analytics + marketplace"], highlight: true },
  { tier: "Agency", price: "$99/mo", tagline: "Produce for clients", features: ["18,000 credits/month", "8 seats + client workspaces", "White-label exports", "15 cloned voices"] },
  { tier: "Enterprise", price: "from $499", tagline: "Your studio, your rules", features: ["Pooled credits + dedicated GPUs", "Character LoRA identity lock", "Custom languages & licensing", "SLA + onboarding"] },
];

/** Left-nav information architecture. The `admin` section is gated by role. */
export interface NavItem {
  label: string;
  href: string;
}
export interface NavSection {
  title: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export const NAV: NavSection[] = [
  {
    title: "Studio",
    items: [
      { label: "Create Anything", href: "/create" },
      { label: "Create Film", href: "/create/film" },
      { label: "Create Series", href: "/create/series" },
      { label: "Create Trailer", href: "/create/trailer" },
      { label: "Create Shorts", href: "/create/shorts" },
      { label: "Create Advert", href: "/create/advert" },
    ],
  },
  {
    title: "Production",
    items: [
      { label: "Projects", href: "/projects" },
      { label: "Characters", href: "/library/characters" },
      { label: "Worlds", href: "/library/worlds" },
      { label: "Assets", href: "/library/assets" },
      { label: "Voices", href: "/library/voices" },
      { label: "Music", href: "/library/music" },
    ],
  },
  {
    title: "Publishing",
    items: [
      { label: "Social Distribution", href: "/publish" },
      { label: "Streaming", href: "/publish/streaming" },
      { label: "Marketplace", href: "/marketplace" },
    ],
  },
  {
    title: "Account",
    items: [{ label: "Plans & Credits", href: "/pricing" }],
  },
  {
    title: "Analytics",
    items: [
      { label: "Revenue", href: "/analytics/revenue" },
      { label: "Audience", href: "/analytics/audience" },
      { label: "Performance", href: "/analytics/performance" },
    ],
  },
  {
    title: "Enterprise",
    items: [
      { label: "Teams", href: "/enterprise/teams" },
      { label: "Permissions", href: "/enterprise/permissions" },
      { label: "Brand Assets", href: "/enterprise/brand" },
    ],
  },
  {
    title: "View",
    items: [
      { label: "Creator", href: "/view/creator" },
      { label: "Studio", href: "/view/studio" },
    ],
  },
  {
    title: "System Administration",
    adminOnly: true,
    items: [
      { label: "Infrastructure", href: "/admin" },
      { label: "Users & Credits", href: "/admin/users" },
      { label: "Moderation", href: "/admin/moderation" },
      { label: "GPU & Queues", href: "/admin#compute" },
      { label: "Models & Routing", href: "/admin#models" },
    ],
  },
];
