# 33 — Business Pricing Architecture

Grounded in the platform as actually built (June 2026) and the unit costs
measured in production. Tier ids match the code (`Tier` in web/lib/system.ts,
`users.tier`): FREE · CREATOR · STUDIO · ENTERPRISE.

## A. What it costs US (COGS per unit, measured)

Fixed monthly (runs regardless of usage):

| Item | $/mo |
|---|---|
| Render worker (Standard) | 25 |
| Render Key Value (persistent Redis) | 10 |
| Supabase (Pro when >500MB/50k MAU) | 0 → 25 |
| Vercel (Pro when team) | 0 → 20 |
| **Fixed base** | **~35 today → ~80 at scale** |

Variable (per generation; GPU = RunPod A40 ~$0.40/hr with auto stop/start):

| Unit | Engine | Our cost |
|---|---|---|
| Shot, Draft (Wan 1.3B, 480p) | own GPU | ~$0.01 |
| Shot, Standard (Wan 14B, 480p/5s) | own GPU | ~$0.10–0.20 |
| Shot, Cinematic (Kling 2.1 std) | fal | ~$0.30 |
| Scene still (gpt-image-1) | OpenAI | ~$0.04 |
| Screenplay + continuity | Claude | ~$0.10 / film |
| Narration TTS | OpenAI | ~$0.02 / min |
| Dub (translate + TTS + mux), per language | Claude+OpenAI | ~$0.10 / film |
| Voice clone | fal MiniMax | ~$1 one-time |
| Long-form speech | fal MiniMax | ~$0.05 / page |
| Avatar video (Kling AI Avatar) | fal | ~$4–8 / min |
| Avatar video (self-hosted, roadmap) | own GPU | ~$0.30 / min |
| Social launch kit | Claude | ~$0.02 |

Per finished minute of film (≈12 shots + stills + script + narration):

| Quality | COGS / film-minute |
|---|---|
| Draft (1.3B) | ~$0.25 |
| Standard (14B) | ~$2.00 |
| Cinematic (Kling) | ~$4.50 |

## B. The credit — one meter for everything

The ledger already exists (`users.credits_ms`, debited per generation;
hard-gated in the worker). Display it to users as **Credits**:

> **1 credit = $0.01 of platform value.** Every action lists its credit price
> up front; the worker debits actual usage.

| Action | Credits | Our COGS | Margin |
|---|---|---|---|
| Draft film, per minute | 100 (=$1) | $0.25 | 75% |
| Standard film, per minute | 600 (=$6) | $2.00 | 67% |
| Cinematic film, per minute | 1,500 (=$15) | $4.50 | 70% |
| Extra dub language | 50 | $0.10 | 80% |
| Voice clone (one-time) | 300 | $1.00 | 67% |
| Speech reading, per page | 20 | $0.05 | 75% |
| Avatar video, per minute (fal) | 1,200 (=$12) | $4–8 | 33–67% |
| Avatar video, per minute (self-hosted, later) | 400 (=$4) | $0.30 | 92% |
| Social launch (kit + post everywhere) | 25 | $0.02 | 92% |

Rules: prices shown before every run; failed generations auto-refund
(recovery already re-runs at no extra debit); idle GPU costs nothing
(lifecycle thermostat).

## C. The plans

| | FREE | CREATOR $19/mo | STUDIO $59/mo | AGENCY $99/mo | ENTERPRISE from $499/mo |
|---|---|---|---|---|---|
| Monthly credits | 200 one-time trial | 2,500 (~4 std min) | 9,000 (~6 cine min) | 18,000 (~12 cine min) | 50,000+ pooled |
| Film engines | Draft only, watermark | Draft + Standard | + **Cinematic (Kling)** | + Cinematic | + custom models/LoRA |
| Max film length | 30s | 3 min | 10 min | 20 min | unlimited |
| Scene stills + narration | — | ✓ | ✓ | ✓ | ✓ |
| Character/world library + continuity | 1 character | ✓ full | ✓ | ✓ | ✓ + LoRA identity lock |
| Storyboard mode (seed images) | — | ✓ | ✓ + reference video | ✓ | ✓ |
| Formats | film/trailer/short | + series | all | all | all |
| Dubbing + subtitles | — | 3 languages | all 20 | all 20 | all + custom |
| Voice cloning | — | 1 voice | 5 voices | 15 voices | unlimited |
| Speech reading | stock voice, 1 page/day | ✓ | ✓ | ✓ | ✓ |
| Talking avatars | — | self-hosted tier (when live) | ✓ incl. premium | ✓ + priority | ✓ |
| Voice marketplace | use only | use + offer | + sell (80/20 split) | + sell (85/15 split) | custom licensing |
| Social Launchpad | kit preview only | 10 launches/mo | unlimited + scheduling | + client workspaces | + team approvals |
| Streaming channel | — | private + views | public page + HLS | ✓ | + custom domain |
| 4K upscaled master | — | — | ✓ (auto, per film) | ✓ | ✓ |
| Analytics | — | views | full dashboards | + per-client | + exports/API |
| White-label exports | — | — | — | ✓ (no platform branding) | ✓ |
| Concurrency / queue | 1, lowest priority | 2 | 4, priority | 6, priority | dedicated GPU pool |
| Seats | 1 | 1 | 3 | 8 | custom (Teams exists in UI) |
| Support | community | email | priority | priority + onboarding call | SLA + onboarding |

AGENCY rationale: freelancers and small agencies producing client work
outgrow Studio's credits (~$180 of credit value for $99, COGS worst-case
~$54 → 45% floor, typical 65%+), need seats + white-label, but can't
justify Enterprise. It also smooths the upgrade ladder: 19 → 59 → 99 → 499.

Top-ups (any tier): 1,000 cr = $12 · 5,000 cr = $50 · 20,000 cr = $160.
Annual billing −20%. Credits roll over 90 days on paid plans.

## D. Why these numbers

- **$19 Creator** sits under Runway/Pika/HeyGen entry plans (~$10–30) while
  delivering a *finished narrated film*, not clips — the differentiator.
- **$59 Studio** is where Cinematic (fal) unlocks: worst-case COGS of a
  full-credit Studio user ≈ $27 of fal spend → ~55% gross margin floor;
  typical usage lands 70%+.
- **Avatar pricing** is deliberately at cost-plus-thin-margin on fal until the
  self-hosted tier ships, then it becomes the highest-margin product (92%).
  Caps (60s/video, daily spend) keep the fal tier safe meanwhile.
- **Marketplace 80/20**: voice owners keep 80% — supply growth matters more
  than commission early.
- **Break-even**: fixed base ~$80/mo ⇒ 5 Creator subs or 2 Studio subs.

## E. Revenue streams (in launch order)

1. Subscriptions (above) — recurring core.
2. Credit top-ups — usage upside from power users.
3. Voice-marketplace commission (20%).
4. Enterprise/API (the worker is already multi-tenant; key-gated API later).
5. Roadmap: stock-footage licensing of generated clips (docs/30), white-label
   avatar news-readers for local publishers (Igbo/Lingala/Luganda dubs are a
   moat in underserved markets).

## F. Implementation status

LIVE: tier gates on models AND film length (web chips + authoritative
worker clamp), credit hard-gate in the poller, per-generation debits,
budget ceiling pause, admin bypass; /pricing page with checkout + top-ups;
Stripe Edge Functions DEPLOYED (stripe-checkout JWT-gated, stripe-webhook
signature-gated: fulfillment, renewals, cancellation→FREE) — activates
when STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are set; credits chip in the
sidebar; admin console (/admin/users roster + grants, /admin/moderation);
cost guardrails (avatar 60s + 10/day, voiceover 20k chars); seat limits on
Teams by tier; brand-kit white-label outro applied at render for AGENCY+; avatar quality
tiers (standard SadTalker ~\$0.15 / premium Kling); background 4K upscale
(fal Topaz) for STUDIO+ on every finished film (films.mp4_4k_key).

REMAINING: Stripe keys (user action), monthly credit RESET job (today
renewals are additive grants), per-action credit prices into shared
config (today the ledger debits measured gpu-ms), marketplace payouts.
