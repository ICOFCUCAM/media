# 11 — Audio Systems: Voice, Music, SFX

All audio is generated per scene, placed on a timeline, and mixed by the Render
Engine ([10](10-ffmpeg-render.md)). Audio jobs run on the `audio-queue`
(`apps/worker/src/processors/audio.processor.ts`).

> **Status (2026-10-09):** the original design here (ElevenLabs, XTTS-v2,
> Piper, MusicGen, an SFX tagger with AudioGen) was never built. This page now
> describes what exists. Voice details: [docs/51](51-directoros-voice-engine.md).

## Voice System — the Voice Engine

### Engines
One **`VoiceEngine`** interface (`packages/voice-contracts/src/engine.ts`) with
cloud adapters in `apps/worker/src/voice/engines.ts`:

| Engine id | Provider | Notes |
|-----------|----------|-------|
| `fal-minimax` | fal (MiniMax speech + voice clone) | stock and cloned voices |
| `openai-tts` | OpenAI TTS | stock voices only |

Which engine serves a request is configuration: `VOICE_ENGINES`
(default `fal-minimax:90,openai-tts:80`, priority order). A cloned voice never
falls back to a stock narrator; if no configured engine can speak it, the job
fails and names the engines passed over and why.

Self-hosted engines (Qwen3-TTS, CosyVoice 3, GPT-SoVITS) are **not built**:
gated on Phase 1 (docs/39) being operationally complete and on licence
approval.

### Enrollment (cloning)
- **Consent** (`self` or `authorised`, with time) is required and stored with
  every voice; enrollment refuses a voice without it.
- Each recording is **measured and judged** (duration, sample rate, silence
  share, peak, noise floor; `apps/worker/src/voice/analyze.ts`,
  `packages/voice-contracts/src/quality.ts`); a poor one is refused with
  reasons.
- Engine-side voice ids live in `voice_engine_artifacts` (one per voice ×
  engine × engine version).

### Speaking and mastering
Scripts are segmented by paragraph and sentence; each segment is spoken and
**mastered outside the model** (trim, de-click, denoise, −16 LUFS / −1.5 dBTP,
48 kHz mono WAV; `apps/worker/src/voice/mastering.ts`), then joined with a
fixed pause. Jobs run on `voice-engine-queue`.

### API
The `/v1` API in `apps/api/src/voices` (Supabase session token; owner-only):
`POST /v1/voices`, `GET`/`DELETE /v1/voices/:id`, `POST /v1/speech`,
`POST /v1/speech/batch`, `GET /v1/jobs/:id`. Bodies are the zod schemas in
`packages/voice-contracts/src/api.ts`.

### Film voices and dubbing
- **Narration and dialogue** — each scene's voice-over and every dialogue line
  are spoken in order on the Voice Engine. A character speaks in the voice the
  owner chose (Casting Room) or a built-in voice of their own, the same in
  every scene; a voice that cannot be used is substituted and reported
  (`VOICE_SUBSTITUTED`). Per-line audio is stored and placed via
  `dialogue_lines.audio_key` / `start_ms` (`apps/worker/src/voice/film.ts`).
- **Dubbing** — localization translates narration and lines per language and
  speaks them with the same voices, then remuxes the picture
  (docs/51 §7, `apps/worker/src/processors/localize.processor.ts`).

## Music System

The film's score is **one fal text-to-music call**, made once on the opening
scene from the brief and every scene's style and mood
(`apps/worker/src/audio/score.ts`, `FAL_MUSIC_MODEL`, default
`fal-ai/stable-audio`). The render engine loops it under the cut. If the
provider is missing or fails, no music track is written and a `TRACK_MISSING`
degradation is recorded.

Not built: per-scene cues, a score plan with recurring themes, MusicGen or any
self-hosted music model.

## Sound Effects System

**Not built.** There is no SFX generator, library or tagger; the capability
`sfx_generation` is `not_implemented` (`packages/shared/src/truth/capabilities.ts`)
and the flow does not enqueue SFX jobs. Films ship without an SFX track.

## Mixing
The Render Engine mixes music (`volume=0.6`, ducked under the voice with
`sidechaincompress`), SFX if present, and voice with `amix`, then normalizes
loudness to EBU R128 (`loudnorm=I=-16:TP=-1.5`) before muxing with video
(`apps/worker/src/ffmpeg/commands.ts`). The master's loudness and true peak
are then checked by the Final Quality Gate (docs/49).

## Implementation checklist
- [x] Voice Engine interface + `fal-minimax` / `openai-tts` adapters, consent, recording QC, mastering (docs/51)
- [x] Per-character film voices + dubbing
- [x] Film score via one fal text-to-music call
- [x] Ducked mix + R128 loudness normalization
- [ ] Self-hosted voice engines (gated on Phase 1)
- [ ] Score plan / per-scene cues
- [ ] SFX generation or library
