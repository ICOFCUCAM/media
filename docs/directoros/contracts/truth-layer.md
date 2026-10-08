# Contract — Truth layer (W1)

Requirements: DOS-70, DOS-72, DOS-73, DOS-74, DOS-75, DOS-77, DOS-78.
Code: `packages/shared/src/truth/`, `apps/worker/src/truth/`,
`apps/gpu-worker/app/pipeline.py` (execution report), `apps/web/lib/truth.ts`,
`scripts/check-truth.mjs`, migration `0031_truth_layer.sql`. Runbook: docs/44.

## 1. Purpose

Make every production tell the truth about what it did. A result that would be
false fails; a result that is honest but weaker is recorded and shown; what the
system can do right now is computed, never hand-written. Not responsible for
judging creative or visual quality (W5).

## 2. Inputs

- GPU worker execution reports (`execution`, `realExecution`, produced
  width/height) on every `/generate` response.
- Provider outcomes in the worker (Director, moderation, seed still, TTS, music,
  translation, upscale, LoRA trainer, storage).
- Worker environment and the GPU workers' own `/capabilities`.

## 3. Outputs

- `ProductionFailure` (code from `FailureCode`) → project/shot `FAILED` with a
  readable message.
- `Degradation` rows in `production_degradations` (code, severity, scope,
  ref id, message, detail) + one `production.degradation` JSON log line each.
- `system_capabilities` rows (status, realExecution, supports, note).
- Web: maturity badges, live capability list, offered formats, the
  "what this production ran without" list.

## 4. Dependencies

Postgres (Prisma), Redis (GPU capability cache), the GPU worker `/capabilities`
through the Media Runtime Gateway, Supabase from the web. Nothing else.

## 5. Forbidden behavior

- Returning a stand-in (stub plan, placeholder clip, English as a translation,
  a key with no object) as a real result.
- Switching to a weaker path without recording it.
- Marking a shot `READY` from the provider's claim alone.
- Waking a sleeping GPU to refresh capabilities.
- Any substitute switch other than `DIRECTOR_ALLOW_STUB`,
  `ALLOW_PLACEHOLDER_MEDIA`, `CINEFORGE_PLACEHOLDER` (all default off).
- A maturity claim of `VALIDATED`/`PRODUCTION_READY` without evidence files.

## 6. Runtime behavior

Per shot: generate → `judgeRun` (placeholder ⇒ fail; clamped size/frames,
ignored references/camera, skipped LoRA ⇒ degradations) → timing gate →
storage `HEAD` (non-empty object) → record degradations → `READY`.
Per film: Director failure ⇒ project `FAILED`; missing clips ⇒ `SHOTS_MISSING`;
unmixable sound ⇒ `AUDIO_MIX_FAILED`; no storage ⇒ `STORAGE_UNCONFIGURED`;
missing tracks, outro, upscale, translation, dub ⇒ degradations.
Every `CAPABILITY_PUBLISH_SEC` (default 300 s): registry from env + cached GPU
reports (verified at most every 30 min while the pod is awake) → upsert.

## 7. Persistence

`production_degradations` append-only (trigger), owner-readable, cascades with
the project. `system_capabilities` upserted by the worker, readable when signed
in; a CHECK forbids `real_execution = false` with a working status.

## 8. Failure behavior

The recorder and publisher never fail a production: before 0031 is applied they
log once and continue with JSON log lines only. Everything in §3 Outputs is the
failure behavior of the components they watch.

## 9. Observability

Log events: `production.degradation`, `production.failed`,
`director.unavailable`, `truth.capabilities`, `truth.gpu_caps`,
`gpu.unavailable`, `pipeline.lora_load_failed`. Rows: as §7.

## 10. Acceptance tests

- `packages/shared/src/truth/truth.test.ts` — judgeRun and the registry.
- `apps/gpu-worker/tests/test_execution_honesty.py` — no silent placeholder,
  truthful capabilities, real dimensions, 503 when unavailable, no phantom
  upload, orientation-preserving caps.
- `apps/worker/src/director/llm.test.ts`, `moderation.test.ts`,
  `translate.test.ts` — no stub film, no padded plan, unchecked moderation and
  failed translation reported.
- `apps/worker/src/ffmpeg/render-engine.media.test.ts` — unmixable sound fails
  the render (real FFmpeg).
- `packages/model-adapters/src/openai/openai.test.ts` — long narration spoken
  in full.
- `packages/db/supabase/tests/0031_truth_layer.test.sql` — append-only, CHECKs,
  RLS.
- `scripts/check-truth.test.mjs` — the gate catches TODOs, unreviewed switches
  and unproven maturity claims.

## 11. Integration test

Pending (W10): an end-to-end production against a real GPU in which one shot
is forced to clamp and one track is unavailable, asserting the film completes,
the rows exist, and the web lists them. Until it exists this contract's
maturity stays `FUNCTIONAL`.

## 12. Production readiness

Migration 0031 applied; the worker publishing capabilities in production; the
§11 integration test passing in the nightly real-provider workflow; one week of
production logs with no `production.degradation` code missing from the UI.
