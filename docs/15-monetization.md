# 15 — Monetization

Usage is metered in **GPU-milliseconds (`creditsMs`)** — the real cost driver —
plus feature gating per tier. Billing via Stripe.

## Tiers

| | Free | Creator | Studio | Enterprise |
|---|---|---|---|---|
| Price | $0 | $29/mo | $199/mo | Custom |
| Monthly film minutes* | 2 min | 30 min | 240 min | Custom/committed |
| Max film length | 1 min | 15 min | 120 min | Unlimited |
| Models | Wan 2.1 | Wan 2.1 | Wan + Hunyuan | All + dedicated |
| Resolution | 480p | 720p | 1080p | 1080p+/4K (roadmap) |
| Voice | OSS TTS | OSS + limited ElevenLabs | ElevenLabs + cloning | Custom voices |
| Watermark | Yes | No | No | No |
| Concurrency | 1 job | 2 jobs | 6 jobs | Custom |
| Character LoRA | — | — | Yes | Yes |
| API access | — | — | Yes | Yes + SLA |
| Support | Community | Email | Priority | Dedicated + SLA |

\* "film minutes" = generated output minutes; enforced via `creditsMs` derived
from typical GPU cost per output minute (calibrate at launch).

## Quotas (enforced in `apps/api/src/billing`)
```ts
const LIMITS = {
  FREE:       { maxFilmSec: 60,   monthlyMs: budgetFor("2min"),   concurrency: 1, models: ["wan-2.1"], maxRes: 480,  watermark: true },
  CREATOR:    { maxFilmSec: 900,  monthlyMs: budgetFor("30min"),  concurrency: 2, models: ["wan-2.1"], maxRes: 720,  watermark: false },
  STUDIO:     { maxFilmSec: 7200, monthlyMs: budgetFor("240min"), concurrency: 6, models: ["wan-2.1","hunyuan"], maxRes: 1080, watermark: false },
  ENTERPRISE: { maxFilmSec: Infinity, monthlyMs: Infinity,        concurrency: 32, models: ["*"], maxRes: 2160, watermark: false },
};
```
Enforcement points:
- **Create/generate:** reject if `targetSeconds > maxFilmSec` or `creditsMs <
  estimatedCost` (return `QUOTA_EXCEEDED`).
- **Pre-shot:** debit `creditsMs` per shot as it completes (`UsageRecord`).
- **Concurrency:** count active jobs per user before enqueuing.
- **Model/res:** validate against tier before queuing.

## Pricing model rationale
- Self-hosted GPUs (scale-to-zero) keep marginal cost ≈ GPU-seconds used.
- Margin = subscription price − (GPU + audio API + storage/CDN) cost.
- Overage: Creator/Studio can buy **credit packs** (`POST /billing/checkout`
  with a one-time price) → adds `creditsMs`.

## Stripe integration
```
POST /billing/checkout { tier|pack } -> { url }    // Checkout Session
POST /billing/webhook                               // signed: subscription + payment events
GET  /billing/quota   -> { tier, creditsMs, used, resetsAt, limits }
```
- Webhook updates `User.tier`, grants `creditsMs` on renewal, handles
  cancellation/downgrade.
- Monthly reset job tops up `creditsMs` to the tier budget.

## Implementation checklist
- [ ] `budgetFor()` calibration from real GPU costs
- [ ] Quota guard (Nest guard/interceptor) at create + enqueue
- [ ] Per-shot debit + `UsageRecord`
- [ ] Stripe checkout + webhook + monthly reset cron
- [ ] Credit packs / overage
