# 56 — Platform hygiene (DirectorOS W11)

**Status:** implemented in code (2026-10-09); migrations 0044–0045 **applied live**.
Contract: [platform.md](directoros/contracts/platform.md). Production types are
also the first step of the Animation Studio (Part 5,
[part-05-cartoon-animation-layer.md](directoros/part-05-cartoon-animation-layer.md)).

## 1. Production types are data

Every project now records **what is being made** (migration 0045, checked by
the database and by `productionIssues()` in `packages/shared/src/production.ts`):

| Field | Values |
|---|---|
| `kind` | film · short_film · series · trailer · social_short · advert · story · motion_comic |
| `medium` | live_action · animation |
| `animation_style` | 2d_traditional · 2d_tv · anime · comic_book · childrens_illustration · 3d_stylized · 3d_toy · 3d_family · 3d_cinematic · low_poly · storybook · motion_comic (animation only) |
| `episodes` | 1–52, series only |

What changes because of it:
- **Pacing.** The plan's scene count follows the format's scene length (a
  trailer cuts every ~6 s, a story every ~15 s). A live-action film plans
  exactly as before, so its estimate and plan are unchanged.
- **The plan request** carries a PRODUCTION section with the format's rules
  (a trailer never reveals the ending; an advert ends on its call to action;
  a social short hooks in two seconds; a story is narrated; a series has one
  act per episode). Prompt `director.master` is now **v5**; the prompt lock
  caught the change and the new version is unscored until `bench:live` runs.
- **Validation:** a series must have one act per episode (`EPISODE_COUNT`); a
  narrated format needs narration in every scene (`NARRATION_MISSING`).
- **A series is a real series:** series → season 1 → one episode per act,
  each scene linked to its episode; a re-plan updates, never duplicates.
- **Animation is drawn, not photographed:** every shot prompt and seed still
  uses the style's look and motion, and the style's "avoid" list joins the
  negative prompt. Live-action requests (and their cache keys) are unchanged.
- **The studios** send the format as data. Trailer, Shorts and Series no
  longer fold "trailer"/"vertical short"/"season outline" into the brief as
  instructions; the Create studio has a **Look** picker (live action or any
  animation style).

## 2. The public API (`apps/api`)

**Decision: keep it — it is the Voice API and the developer API — and make it
deployable.** The web app does not use it.
- **Auth:** Supabase session tokens, verified against the project's JWKS
  (`SUPABASE_URL`, ES256/RS256) or the legacy shared secret
  (`SUPABASE_JWT_SECRET`, HS256 only). Audience `authenticated`, issuer
  checked, algorithms pinned. **Roles come from `users.role`, never from the
  token.** No configuration → 503, not open.
- **Routes:** the Voice API is now `/v1/voices`, `/v1/speech`,
  `/v1/speech/batch`, `/v1/jobs/:id` (it was served at `/v1/v1/…`). A route
  table test pins every path.
- **Deploy:** `apps/api/Dockerfile` (compiled with tsc — Nest needs decorator
  metadata — started by `start.cjs`), CI boots the compiled API and checks
  its probes and a 401. The Render service is in `deploy/render-api.yaml`,
  **not** in `render.yaml`: deploying it is the owner's call.

## 3. Dead paths removed

- `packages/realtime` and the Socket.IO gateway: the worker published to a
  Redis channel no deployed service read. Status reaches the browser through
  Supabase Realtime on `projects` (unchanged).
- The web `LiveRun` path and `lib/api.ts` (called routes that never existed).
- `publish-queue` (a consumer with no producer); posting is the Social
  Launchpad (`social-queue`).
- Render kinds `preview` and `scene` (never enqueued; no-ops). An unknown
  kind now fails the job instead of "succeeding".

## 4. Metering every paid call

Before, only video GPU time was metered. Now every paid call writes a
`usage_records` row (0044): **LLM** tokens (input and output), **TTS**
characters (film voices, dubs, the Voice API, the Voice Lab), **images**
(seed frames, wardrobe references), **music** seconds, **moderation**
requests and hosted video calls (4K upscale, avatars) — with provider, model,
units, USD and credits.

Prices are the owner's: `METER_RATES="llm.input=…:…;llm.output=…:…;tts=…:…;image=…:…;music=…:…"`
(credit-ms per unit : USD per unit). With no rate, the call is recorded at 0
— never dropped. A charge debits the balance in the same transaction as the
row. A metering failure never fails a production; it is logged
(`usage.unrecorded`).

## 5. Atomic, idempotent credit grants

The Stripe webhook read the balance and wrote it back (a debit in between was
lost) and had no replay protection. Now `apply_stripe_grant()` (0044, service
role only) claims the Stripe event id and increments the balance in one
transaction: a retried or replayed event is applied once; a failed grant
returns 500 so Stripe retries. **The edge function must be redeployed** for
this to take effect (owner step).

## 6. Portability (docs/38 §AF)

- **Probes:** worker (when `PORT` is set) and API serve `/livez` (process up)
  and `/readyz` (database and Redis answer — 503 naming the one that does not).
- **Metrics:** `/metrics` in Prometheus text: jobs per queue and outcome,
  metered units per kind/provider, credits charged, API requests per route
  pattern and status (refused requests included).
- **Provider hosts from env:** `OPENAI_BASE_URL`, `FAL_QUEUE_URL`,
  `FAL_STORAGE_URL`, `RUNPOD_API_URL`, `RESEND_API_URL`, `PEXELS_API_URL`,
  `PIXABAY_API_URL` (`packages/shared/src/ops/hosts.ts`, the only place the
  public defaults live).
- CI: the ffmpeg install is time-boxed and retried (a hung mirror stalled CI
  once).

## 7. Owner steps

1. Redeploy the `stripe-webhook` edge function (atomic grants).
2. Set `METER_RATES` when you have prices (until then usage is recorded at 0).
3. To deploy the API: add `deploy/render-api.yaml` to `render.yaml` and set
   `SUPABASE_URL` (or `SUPABASE_JWT_SECRET`), `DATABASE_URL`, `WEB_URL`.
4. Run `bench:live` to score `director.master` v5.
