# Contract — Platform: production types, API, metering, grants, probes (W11)

Requirements: gap analysis §W11; docs/38 §AF; Part 5 §177–186 (production
types only). Code: `packages/shared/src/production.ts` (+ web mirror
`apps/web/lib/production-types.ts`), `apps/worker/src/director/production.ts`,
`packages/movie` (`PlanProduction`, `RenderStyle`, `EPISODE_COUNT`,
`NARRATION_MISSING`), `apps/api/src/auth`, `apps/api/src/health`,
`apps/worker/src/billing`, `apps/worker/src/health.ts`,
`packages/shared/src/ops`, `supabase/functions/stripe-webhook`, migrations
`0044_metering_and_grants.sql`, `0045_production_types.sql`.

## 1. Purpose

Make what is being made explicit data; keep one honest public API; meter all
paid work; never lose or double a credit; let any platform probe, scrape and
re-point the services.

## 2. Inputs

Project rows (kind, medium, animation_style, episodes); Supabase session
tokens; provider responses (tokens, characters, images, seconds); Stripe
events; environment (rates, hosts, auth configuration).

## 3. Outputs

Paced plans with a PRODUCTION section; styled prompts; series/season/episode
rows; usage rows and debits; one balance change per Stripe event; probe and
metrics responses.

## 4. Dependencies

The Director and compilers (W2/W4), Prisma, Supabase Auth JWKS, Stripe.

## 5. Forbidden behavior

- Folding the format into the brief instead of the project row.
- Changing a live-action film's plan, estimate or cache key because of W11.
- Reading a role from a token; accepting `none`, an unpinned algorithm, a
  wrong audience or issuer; running the API open when auth is unconfigured.
- Dropping usage because no price is set; built-in prices.
- A read-then-write balance change; applying a Stripe event twice.
- A hard-coded provider host outside `ops/hosts.ts`.
- Adding the API to `render.yaml` without the owner.

## 6. Runtime behavior

See docs/56 §1–6.

## 7. Persistence

`projects.kind/medium/animation_style/episodes` (checked); `series`,
`seasons`, `episodes`, `scenes.episode_id`; `usage_records` (+ provider,
model, unit, units, credit_ms, meta; checked); `stripe_events` (append via
the function only).

## 8. Failure behavior

Invalid production row → planning fails with the reason. Metering write
failure → logged, production continues. Grant failure → 500, Stripe retries.
Unready dependency → 503 naming it.

## 9. Observability

`/metrics` (jobs, usage units, credits, HTTP), `/readyz` checks, the
`usage.unattributed` / `usage.unrecorded` log events, `stripe_events`.

## 10. Acceptance tests

- `packages/shared/src/production.test.ts`, `src/ops/ops.test.ts`
- `apps/worker/src/director/production.test.ts` (a film plans as before; pacing; styles)
- `packages/movie/src/ir/validate.test.ts`, `src/prompt/prompt.test.ts` (episodes, narration, animation prompts, unchanged live-action hash)
- `apps/worker/src/billing/meter.test.ts`, `apps/worker/src/health.test.ts`
- `apps/api/src/auth/supabase-token.test.ts`, `apps/api/src/routes.test.ts`
- `packages/db/supabase/tests/0044_metering_and_grants.test.sql`, `0045_production_types.test.sql`
- CI "API boots" step

## 11. Integration test

An animated short planned and generated on production; a replayed Stripe
event in test mode leaving the balance unchanged. **Not yet run.**

## 12. Production readiness

After the integration tests, the webhook redeploy and owner-set meter rates.
