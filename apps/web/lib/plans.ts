import type { Tier } from "./system";

/**
 * Pricing architecture (docs/33) — single source of truth for the site.
 *
 * The ledger is users.credits_ms (estimated generation milliseconds, debited
 * by the worker). Display unit is the CREDIT: 1 credit = 1,500 credit-ms,
 * which makes the doc's plan math line up with the engine estimates
 * (msPer720Shot): Creator's 2,500 credits ≈ 4 standard film-minutes,
 * Studio's 9,000 ≈ 6 cinematic minutes.
 */
export const CREDIT_MS = 1_500;

export const msToCredits = (ms: number) => Math.max(0, Math.floor(ms / CREDIT_MS));
export const creditsToMs = (credits: number) => credits * CREDIT_MS;

export interface Plan {
  tier: Tier;
  name: string;
  priceMonthly: number; // USD
  credits: number; // granted per month (FREE: one-time trial)
  blurb: string;
  features: string[];
  highlight?: boolean;
  cta: string;
}

export const PLANS: Plan[] = [
  {
    tier: "FREE",
    name: "Free",
    priceMonthly: 0,
    credits: 200,
    blurb: "Taste the magic.",
    cta: "Start free",
    features: [
      "200 trial credits (one-time)",
      "Draft film engine (watermarked)",
      "Films up to 30 seconds",
      "Speech reading — stock voice, 1 page/day",
      "Community voices (use only)",
      "Launch kit preview",
    ],
  },
  {
    tier: "CREATOR",
    name: "Creator",
    priceMonthly: 19,
    credits: 2_500,
    blurb: "Finished films, not clips.",
    cta: "Go Creator",
    features: [
      "2,500 credits/month (~4 standard film-minutes)",
      "Standard engine + scene stills + narration",
      "Films up to 3 minutes",
      "Dubbing — 3 languages per film",
      "1 cloned voice · unlimited readings",
      "10 social launches/month",
    ],
  },
  {
    tier: "STUDIO",
    name: "Studio",
    priceMonthly: 59,
    credits: 9_000,
    blurb: "Cinematic quality unlocked.",
    cta: "Go Studio",
    highlight: true,
    features: [
      "9,000 credits/month (~6 cinematic minutes)",
      "Cinematic engine (frontier video models)",
      "Films up to 10 minutes · priority queue",
      "All 20 dubbing languages",
      "5 cloned voices + talking avatars",
      "Sell voices on the marketplace (80/20)",
      "Unlimited social launches + scheduling",
    ],
  },
  {
    tier: "AGENCY",
    name: "Agency",
    priceMonthly: 99,
    credits: 18_000,
    blurb: "Produce for clients.",
    cta: "Go Agency",
    features: [
      "18,000 credits/month (~12 cinematic minutes)",
      "Everything in Studio",
      "8 seats · client workspaces",
      "White-label exports (no platform branding)",
      "15 cloned voices · priority avatars",
      "Better marketplace split (85/15)",
    ],
  },
  {
    tier: "ENTERPRISE",
    name: "Enterprise",
    priceMonthly: 499,
    credits: 50_000,
    blurb: "Your studio, your rules.",
    cta: "Talk to us",
    features: [
      "50,000+ pooled credits",
      "Custom models + character LoRA identity lock",
      "Unlimited film length · dedicated GPU pool",
      "Custom languages & licensing",
      "Team approvals · SLA · onboarding",
    ],
  },
];

export interface TopUp {
  id: string;
  credits: number;
  price: number;
}

export const TOPUPS: TopUp[] = [
  { id: "pack-1k", credits: 1_000, price: 12 },
  { id: "pack-5k", credits: 5_000, price: 50 },
  { id: "pack-20k", credits: 20_000, price: 160 },
];
