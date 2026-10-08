# Contract — Intelligence layer (W2)

Requirements: DOS-25, 47–49, 51, 52, 83–85, 88, 93, 97–99.
Code: `packages/movie/src/intelligence/`, `apps/worker/src/intelligence/`,
migration `0032_ai_decisions.sql`.

## 1. Purpose

Every reasoning call CineForge makes goes through one provider-neutral
interface, returns schema-shaped JSON, follows a configured route, and is
logged. The model is the brain; it never executes media (Part 2 §90).

## 2. Inputs

`StructuredRequest`: task, prompt id + version (registry), system, user,
JSON Schema, max tokens, effort. Context: project id.

## 3. Outputs

`StructuredResult` (output, provider, model, usage, latency) or a typed
`IntelligenceError` (`PROVIDER_UNAVAILABLE`, `REFUSED`, `TRUNCATED`,
`NO_STRUCTURED_OUTPUT`, `PROVIDER_ERROR`). One `ai_decisions` row per attempt.

## 4. Dependencies

Anthropic SDK (structured outputs), OpenAI Chat Completions over HTTP,
Postgres for the log.

## 5. Forbidden behavior

- Calling a model vendor from anywhere but a provider class.
- Switching provider without an explicit route (`INTELLIGENCE_ROUTES`).
- Treating refused or truncated output as complete.
- Free-text production output (every task has a schema).
- Changing a prompt without bumping its version.

## 6. Runtime behavior

Routes: default Claude (`ANTHROPIC_MODEL`, else `claude-opus-5-5`) for every
task; `INTELLIGENCE_ROUTES` sets per-task ordered `provider:model` lists. On
unavailable / provider error / refusal the next configured route is tried;
truncation is not. Film planning: one master call, one surgical revision at
most (`planFilm`).

## 7. Persistence

`ai_decisions`: task, prompt id/version, schema name, provider, model,
attempt, input/output sha256, outcome + error code, issues, tokens, latency.
Append-only; owners read their project's rows.

## 8. Failure behavior

Errors surface to the caller as `IntelligenceError`; the Director maps them to
`DIRECTOR_UNAVAILABLE` / `DIRECTOR_REFUSED` / `DIRECTOR_OUTPUT_INVALID`.
The decision recorder never fails a production (logs only before 0032).

## 9. Observability

`ai.decision` log line per attempt; rows as §7.

## 10. Acceptance tests

`packages/movie/src/intelligence/intelligence.test.ts` (routing, explicit
fallback, decision log, one-pass + revise-once, refusal and truncation,
SDK schema transform), `apps/worker/src/intelligence/decisions.test.ts`,
`apps/worker/src/director/translate.test.ts`,
`packages/db/supabase/tests/0032_ai_decisions.test.sql`.

## 11. Integration test

Pending (W10): one real call per configured provider for `film_plan` and
`translation`, gated on secrets, verifying the decision rows.

## 12. Production readiness

0032 applied; real-provider tests nightly; refusal and revision rates
monitored from `ai_decisions`.
