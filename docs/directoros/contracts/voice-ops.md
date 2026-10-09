# Contract — Voice operations: licence registry, speech cache, voice benchmark, audio continuity (W14)

Requirements: gap analysis §W14; Part 3 §114, §129; Part 4 §136, §139, §141,
§154; Part 1 §32.6. Code:
- `packages/voice-contracts/src/licences.ts` (`VOICE_LICENCES`,
  `licenceStatus`, `parseApprovals`)
- `packages/voice-contracts/src/router.ts`
- `packages/voice-contracts/src/cache.ts` (`speechCacheKey`,
  `speechCacheObjectKey`)
- `packages/voice-contracts/src/benchmark.ts`
- `apps/worker/src/voice/cache.ts`
- `apps/worker/src/bench/voice.ts`, `apps/worker/src/bench/voice-cli.ts`
- `packages/movie/src/cinema/audio.ts`
- `apps/worker/src/voice/continuity.ts`
- migration `0049_speech_cache.sql`

## 1. Purpose

Only legally usable voice models speak. The same speech is never generated
twice. Engines are compared on the owner's own voice. A film sounds continuous.

## 2. Inputs

Engine requests; the owner's `VOICE_MODEL_APPROVALS`; benchmark options; the
Film IR; the scene voice tracks.

## 3. Outputs

- Routing decisions with licence reasons.
- Cached clips and `speech_cache` rows.
- Benchmark reports (`benchmark_runs`, suite `voice`).
- `AUDIO_CONTINUITY` degradations.

## 4. Dependencies

W7 Voice Engine (router, engines, mastering, jobs); W10 `benchmark_runs`; W11
metering; W1 degradations; the render processor.

## 5. Forbidden behavior

- Routing to, or benchmarking, a model whose licence, exact checkpoint,
  training data, dependencies or owner approval is not cleared.
- Recording a licence check nobody made.
- Billing a cache hit.
- Serving a deleted voice's cached speech, or keeping its clips.
- Letting a cache failure stop speech.
- Using the cache in the benchmark.
- Reporting a metric that was not measured.
- Failing a plan on an audio advisory.

## 6. Runtime behavior

- `routeVoice` checks the gate, then the licence, then the configuration.
- Every film, dub and job voice engine is `cachedEngine(meteredEngine(engine))`.
- The project poller purges orphaned clips.
- `voice:bench` is run by the owner.
- The plan records audio advisories with its degradations.
- The final render checks voice continuity and replaces the previous findings.

## 7. Persistence

- `speech_cache` (key, engine and version, `voice_id` set null on voice
  delete, `cloned`, `storage_key` under `audio_cache/`, format, bytes, hits).
- `benchmark_runs.suite` gains `voice`.
- `production_degradations` gains the code `AUDIO_CONTINUITY` (no schema change).

## 8. Status

FUNCTIONAL — self-hosted models remain gated and uncleared.
