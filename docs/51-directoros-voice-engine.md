# 51 — Voice Engine (DirectorOS W7a)

**Status:** implemented in code (2026-10-09) for the cloud engines; migration
0036 **applied live**. The self-hosted voice models (Qwen3-TTS, CosyVoice 3,
GPT-SoVITS) are **blocked by the owner's rule**: no model work until Phase 1
(docs/39) is operationally complete, and each also needs a licence registry
entry with owner approval (Part 4 §130, §141). Contract:
[voice-engine.md](directoros/contracts/voice-engine.md).

## 1. What changed

| Before | Now |
|---|---|
| Voice Lab and film narration called fal and OpenAI directly | One **VoiceEngine** interface (`packages/voice-contracts`); `fal-minimax` and `openai-tts` are adapters behind it; which engine serves a request is configuration (`VOICE_ENGINES`) |
| Any uploaded recording was cloned, no consent recorded | **Consent** (`self` or `authorised`, with time) is stored with every voice; enrollment refuses a voice without it, in the API, the worker and the legacy Voice Lab path |
| The recording was never checked | Each recording is **measured** (duration, sample rate, silence share, peak, noise floor) and **judged**; a poor one is refused with the reasons, and the report is kept on the voice |
| The provider's voice id was a column on `voices` | **Engine artifacts** live in `voice_engine_artifacts`, one per voice × engine × engine version, service role only |
| PENDING / CLONING / SPEAKING / READY / FAILED | **Voice jobs** with the eight states — queued, claimed, loading_model, generating, post_processing, completed, failed, cancelled; terminal states are final in the database |
| 1800-character chunks glued as MP3 | Scripts are **segmented** by paragraph and sentence; each segment is spoken, **mastered outside the model** (trim, de-click, denoise, -16 LUFS / -1.5 dBTP, 48 kHz mono WAV) and joined with a fixed pause |
| The web wrote rows directly; no server-side ownership check on speech | The frozen **`/v1` API**: a voice is read, used or deleted only by its owner; anyone else gets 404 |

## 2. The API (apps/api, JWT)

| Route | Does | Returns |
|---|---|---|
| `POST /v1/voices` | enroll from your own upload (`voices/<your id>/…`), consent required | 202 `{ voice_id, status: "processing", job_id }` |
| `GET /v1/voices/:id` | your voice: status, language, quality report, consent | 200, or 404 |
| `DELETE /v1/voices/:id` | delete your voice and its engine artifacts | 200 `{ voice_id, deleted: true }` |
| `POST /v1/speech` | one script, your voice or the stock narrator | 202 `{ job_id, status: "queued" }` |
| `POST /v1/speech/batch` | up to 500 lines, one file each | 202 `{ job_id, status, items }` |
| `GET /v1/jobs/:id` | your job's state; `result` once completed | 200, or 404 |

Bodies are the zod schemas in `packages/voice-contracts/src/api.ts`. Output
is always WAV, 48 kHz, mono. A completed speech job's result names
`audio/<job_id>/final.wav` (batch: `audio/<job_id>/<item id>.wav`) with its
measured duration and loudness. The engine that spoke is never returned.

## 3. Configuration

| Variable | Default | Effect |
|---|---|---|
| `VOICE_ENGINES` | `fal-minimax:90,openai-tts:80` | engines in priority order; gated engines are listed with the reason, never silently skipped |
| `VOICE_MAX_CHARS` | `20000` | most text one job may speak (cost ceiling) |
| `VOICE_MAX_ACTIVE_JOBS` | `5` | voice jobs in progress per user (429 above) |
| `VOICE_ENGINE_CONCURRENCY` | `2` | worker concurrency on `voice-engine-queue` |
| `FAL_KEY`, `FAL_VOICE_CLONE_MODEL`, `FAL_SPEECH_MODEL`, `FAL_STOCK_VOICE` | — | the fal MiniMax engine (as before) |
| `OPENAI_API_KEY`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | — | the OpenAI engine (stock voices only) |

A cloned voice never falls back to a stock narrator: if no configured engine
can speak it, the job fails and says which engines were passed over and why.

## 4. Owner steps

None to turn it on beyond deploying the worker and the API (docs/43); 0036
is already applied. New Voice Lab voices are enrolled through the Voice
Engine automatically (the poller creates the job).

## 5. Limits (carried forward)

- **W7b:** film narration and per-character dialogue voices
  (`characters.voice_profile.voiceId`, `dialogue_lines.audio_key`) on the
  Voice Engine; dubbing through `/v1/speech/batch`.
- Self-hosted engines, the voice GPU worker, the licence registry and the
  benchmark harness: gated (owner rule, Phase 1).
- No content-hash cache for repeated lines yet; no streaming.
- Deleting a voice removes the row and its engine artifacts; the uploaded
  recording and the provider-side clone are not yet deleted.
- The legacy Voice Lab reader still accepts approved community voices
  without a per-use licence.
- The API returns storage keys; signed download URLs come with the
  standalone voice product.
