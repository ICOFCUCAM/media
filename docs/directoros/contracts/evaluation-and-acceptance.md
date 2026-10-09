# Contract — Evaluation and acceptance (W10)

Requirements: DOS-49.1–49.3 (scores), 50.1–50.4, 76.1–76.3, 81.1–81.3. Code:
`packages/bench` (corpus, cases, offline run, live planning benchmark, prompt
lock), `apps/worker/src/acceptance` (provider probes, artifact verification,
sixteen film checks, evidence, `film:accept`), `apps/worker/src/bench`
(calibration, recording, CLI), `.github/workflows/evaluation.yml`, migration
`0043_evaluation.sql`.

## 1. Purpose

Measure, on real artifacts, whether CineForge works — per provider, per
engine, per prompt version and for one whole film — and keep the evidence.

## 2. Inputs

Provider credentials (environment), the benchmark corpus and cases, the
prompt registry, a brief and an owner account (film acceptance), a finished
project (check mode).

## 3. Outputs

Probe results and `REAL_PROVIDERS` verdict; benchmark reports and
`BENCHMARK_SCORE`; prompt evaluation scores; sync calibration verdicts per
tolerance; sixteen film checks and `END_TO_END_MOVIE_PIPELINE`; rows in
`benchmark_runs` / `acceptance_runs`.

## 4. Dependencies

The production adapters and router (no test doubles in live runs), FFmpeg,
storage, the database, the Media Runtime Gateway for self-hosted GPU calls.

## 5. Forbidden behavior

- Passing a probe on a URL, a status code or a provider's claim instead of
  the decoded artifact.
- Passing a self-hosted clip that does not report real model execution.
- Counting NOT_CONFIGURED or GATED as a pass; a run with nothing configured
  is INCOMPLETE.
- Treating anything unmeasured as passing (loudness, stream times, review).
- Reporting `END_TO_END_MOVIE_PIPELINE: PASS` without sixteen passed checks
  (the database refuses such a row).
- Editing a prompt without a version bump; built-in model prices.
- Passing GPU_JWT_SIGNING_KEY to the evaluation workflow.
- Marking a sync policy `calibrated` from instrument calibration alone.

## 6. Runtime behavior

Probes run one at a time; a failure never stops the others. The offline
benchmark is deterministic. Film acceptance: create project (PLANNING) →
poll to a terminal status → gather evidence → sixteen checks → record → exit.

## 7. Persistence

`benchmark_runs`, `acceptance_runs` (0043): append-only, admin read, worker
write. `packages/bench/baseline.json`, `prompts.lock.json` in git.

## 8. Failure behavior

Exit codes: 0 pass, 1 fail, 3 incomplete (not configured), 2 usage, and
recording to a missing table is an error, not a skip.

## 9. Observability

Console reports per probe / case / check, the JSON report (`--out`), the
workflow artifact, the evidence rows.

## 10. Acceptance tests

- `packages/bench/src/bench.test.ts`: corpus size and validity, no regression
  below baseline, prompt lock in sync, scoring with a scripted provider
- `apps/worker/src/acceptance/report.test.ts`: verdicts, readiness, gating
- `apps/worker/src/acceptance/verify.media.test.ts`: real images, clips, audio
  accepted; URLs, flat colours, placeholders, black clips, silence refused
- `apps/worker/src/acceptance/film-checks.test.ts`: each of the sixteen checks
  fails on its own defect
- `apps/worker/src/acceptance/film.media.test.ts`: a real master passes all
  sixteen; wrong fps, silence, blackout, truncation, bit rot, missing file and
  missing SFX each fail
- `apps/worker/src/bench/calibration.test.ts`, `calibration.media.test.ts`
- `packages/db/supabase/tests/0043_evaluation.test.sql`

## 11. Integration test

The live runs themselves: Evaluation → providers, planning-benchmark,
film-acceptance on production. **Not yet run** (owner credentials).

## 12. Production readiness

`PRODUCTION_READY` when a recorded providers run is PASS, every prompt in use
has a live score, and a recorded acceptance run is PASS (which needs a
sound-effects generator first).
