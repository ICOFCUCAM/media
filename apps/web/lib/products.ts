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
      { label: "15 min", value: 900 },
      { label: "30 min", value: 1800 },
      { label: "60 min", value: 3600 },
      { label: "90 min", value: 5400 },
      { label: "120 min", value: 7200 },
    ],
    defaultSeconds: 1800,
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
    title: "System Administration",
    adminOnly: true,
    items: [
      { label: "Infrastructure", href: "/admin" },
      { label: "GPU & Queues", href: "/admin#compute" },
      { label: "Models & Routing", href: "/admin#models" },
    ],
  },
];
