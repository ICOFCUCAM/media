# Contract — Voice Engine (W7a)

Requirements: DOS-145–148, 150–151, 158–170, 173 (Part 4 §157–176).
Self-hosted engines, voice GPU worker, licence registry, benchmark: gated.
Code: `packages/voice-contracts/src/` (engine.ts, api.ts, segment.ts,
quality.ts, router.ts), `apps/worker/src/voice/` (analyze.ts, mastering.ts,
engines.ts, jobs.ts), `apps/worker/src/processors/voice-engine.processor.ts`,
`apps/api/src/voices/`, migration `0036_voice_engine.sql`.

## 1. Purpose

Turn text into a voice's speech, and a consented recording into a voice,
through one model-independent boundary. CineForge knows voices and jobs,
never models. Not responsible for film dialogue placement (W7b) or for
self-hosted model runtimes (gated).

## 2. Inputs

`/v1` request bodies (`EnrollVoiceBody`, `SpeechBody`, `BatchSpeechBody`)
with the caller's id from the JWT; a reference recording in storage under
`voices/<user id>/`; `VOICE_ENGINES` and each engine's keys.

## 3. Outputs

A `voices` row with consent, language and quality report; a
`voice_engine_artifacts` row per engine version that enrolled it; a
`voice_jobs` row per request with its state and result; mastered WAV files
at `audio/<job id>/<item>.wav` (48 kHz, mono, 16-bit, -16 LUFS integrated,
true peak ≤ -1.5 dBTP).

## 4. Dependencies

The configured cloud engines (fal MiniMax, OpenAI speech), object storage,
ffmpeg/ffprobe, BullMQ (`voice-engine-queue`), Postgres.

## 5. Forbidden behavior

- Enrolling a voice without recorded consent, or from someone else's upload.
- Using, reading or deleting a voice the caller does not own; answering
  anything but 404 for it.
- Falling back to a stock narrator when a cloned voice was asked for.
- Returning which engine spoke, or exposing engine artifacts to clients.
- Calling a gated engine, or skipping it without saying why.
- Letting the model own mastering; delivering unmeasured audio.
- Changing a job after it reached completed, failed or cancelled.

## 6. Runtime behavior

API: validate → ownership → limits → create the job row → enqueue → 202.
Worker: claimed → loading_model (route by needs: cloning, language;
engine adapter; for a cloned voice its artifact for that engine version, or
the legacy provider id) → generating (enroll: measure and judge the
recording, refuse a poor one, enroll, store the artifact; speech: segment
each item to the engine's limit, synthesize each segment) →
post_processing (master each segment, join with a 250 ms pause, measure,
upload) → completed with the result. Any refusal or error → failed with the
message.

## 7. Persistence

`voices` (consent_type, consent_confirmed_at, language, quality),
`voice_engine_artifacts` (unique voice × engine × version, service role
only), `voice_jobs` (owner-readable; terminal states final, owner and type
immutable, by trigger). Audio in object storage; never in Postgres.

## 8. Failure behavior

Every refusal fails the job with a plain reason (no consent, not your
voice, recording not good enough with the issues, no engine can speak it
with each engine's reason, text over the ceiling, voice not enrolled with
the current engine). A retried attempt of a finished job does nothing.

## 9. Observability

`voice_jobs` rows (state, engine, timestamps, error, result with measured
duration and loudness); the voice's quality report; Capability Registry
`voice_cloning` (provider, gated engines); worker log line per job.

## 10. Acceptance tests

- `apps/worker/src/voice/jobs.test.ts` — eight-state path; consent refusal;
  ownership; upload prefix; poor recording; no cloning engine with reasons;
  segmentation; cloned voice via artifact and via legacy id; no stock
  fallback; ceiling; terminal no-op; batch keys; unsafe item ids.
- `apps/worker/src/voice/voice.media.test.ts` (real ffmpeg) — good, short,
  clipped and 8 kHz recordings judged; mastering to 48 kHz mono, -16 LUFS,
  ≤ -1 dBTP with silence trimmed; joining with the fixed pause.
- `apps/worker/src/voice/engines.test.ts`, `analyze.test.ts`.
- `apps/api/src/voices/voice-api.test.ts` — consent, upload prefix, limits,
  404 to non-owners, no engine internals, stock and batch requests.
- `packages/db/supabase/tests/0036_voice_engine.test.sql` — shapes, artifact
  uniqueness, terminal states, RLS, cascades.

## 11. Integration test

Not yet: one real enrollment and one real synthesis on the deployed worker
with the owner's own recording (W10), reported with the job rows.

## 12. Production readiness

`PRODUCTION_READY` when the integration test above passes on production,
recordings and outputs are deleted with the voice, and film narration and
dialogue run through the engine (W7b). Self-hosted engines additionally need
Phase 1 complete, a licence registry entry and owner approval.
