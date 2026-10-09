# 59 — Voice operations: licences, speech cache, voice benchmark, audio continuity (DirectorOS W14)

**Status:** implemented in code (2026-10-09); migration 0049 **applied live**.
Contract: [voice-ops.md](directoros/contracts/voice-ops.md). Requirements:
Part 3 §114, §129; Part 4 §136, §139, §141, §154; Part 1 §32.6.

Nothing here needs a GPU. Self-hosted voice models (Qwen3-TTS, CosyVoice 3,
GPT-SoVITS) stay gated until docs/38 Phase 1 is operationally complete; W14
builds what must be true **before** one of them may ever speak.

## 1. The voice licence registry (§114, §129, §139, §141)

`packages/voice-contracts/src/licences.ts` records, for every model CineForge
may use or has considered, what was checked and where the facts came from:

| Model | Kind | Code licence | Commercial use | Checkpoint / training data / dependencies | Cleared |
|---|---|---|---|---|---|
| fal-minimax | cloud | proprietary API | provider terms | not applicable | yes |
| openai-tts | cloud | proprietary API | provider terms | not applicable | yes |
| qwen3-tts | self-hosted | Apache-2.0 (package) | allowed | unverified | **no** |
| cosyvoice-3 | self-hosted | unverified | unknown | unverified | **no** |
| gpt-sovits | self-hosted | MIT (repository) | allowed | unverified | **no** |
| fish-speech | self-hosted | Fish Audio Research License | research only | unverified | **no** |

A model being downloadable does not make it usable (§114.1). A self-hosted
model is cleared only when:

- its licence permits commercial, hosted use;
- the **exact checkpoint**, its training-data terms and its dependency licences
  are recorded as verified — the repository's licence is not the checkpoint's
  (§141.1);
- the owner approved that checkpoint: `VOICE_MODEL_APPROVALS=
  "qwen3-tts@<checkpoint>=<approver>:<YYYY-MM-DD>"` in the deploy
  configuration. Code never sets it.

`routeVoice` checks the registry after the Phase 1 gate: an uncleared engine is
passed over with a `licence: …` reason, the same way a gated or unconfigured
one is. "Unverified" is an honest answer and keeps the model off.

## 2. The speech cache (§154)

The same sentence, in the same voice, from the same engine version, language
and style, is generated once:

- **Key** — sha256 of `{engine, engine version, voice artifact or built-in
  preset, normalised text, language, emotion/energy/speed/pitch}`
  (`speechCacheKey`). Extra spaces and the case of the language code do not
  change it; anything audible does.
- **Storage** — `audio_cache/stock/<key>.<fmt>` for built-in voices,
  `audio_cache/voice/<voice id>/<key>.<fmt>` for a cloned voice; one row per
  clip in `speech_cache` (migration 0049, worker-only: RLS on, no policies,
  no grants to `anon`/`authenticated`).
- **Billing** — `cachedEngine` wraps the metered engine, so a hit is never
  generated and never billed.
- **Never breaks speech** — a cache read or write failure is logged and the
  sentence is generated as usual.
- **Deleted voices** — deleting a voice clears `voice_id` on its rows; such a
  row is never served, and the project poller deletes its clips and rows
  (`purgeOrphanedSpeech`). A deleted voice's speech does not linger.
- `SPEECH_CACHE=0` turns it off.

Used by film voices, dubs and `/v1` voice jobs.

## 3. The voice benchmark (§136)

```
pnpm --filter @cineforge/worker voice:bench [--voice <voice id>] [--scripts …] [--engines …] [--out report.json] [--record]
```

- **Scripts** — original texts: 30-second, 2-minute and 10-minute narration;
  emotional, documentary and conversational scripts; Norwegian, English and
  French.
- **Voice** — with `--voice`, every engine speaks in that cloned voice. The
  voice must be READY with consent recorded, and engines that cannot clone it
  or have no enrolment are skipped with the reason. Without `--voice`, a
  built-in voice is used.
- **Measured:**
  - pronunciation — word error rate of the speech transcribed back with
    OpenAI speech-to-text;
  - generation speed — real-time factor;
  - long-form consistency — the loudness spread (LU) and the variation in
    pace across a script's segments;
  - licensing — the registry.
- **Not measured, and reported as such:**
  - voice similarity — needs a speaker-embedding model, self-hosted, so it
    waits on Phase 1;
  - naturalness — needs listeners;
  - VRAM — not applicable to cloud engines.
- **Never runs** a gated or uncleared model. Those are listed with their
  reasons.
- **Always generates.** It uses the raw engine, never the cache.
- **Result** — `--record` writes `benchmark_runs` (suite `voice`). Exit codes:
  0 pass, 1 an engine failed a script, 3 incomplete.

## 4. Audio continuity (§32.6)

On the plan (`packages/movie/src/cinema/audio.ts`), recorded as
`AUDIO_CONTINUITY` (info) and never failing:

| Code | When |
|---|---|
| `AMBIENCE_BREAK` | a scene continues the previous one in the same place with no time cut, but its ambience shares no sound with it |
| `MUSIC_BREAK` | the same continuous moment switches to an unrelated cue (a cue that drops to silence is a choice, not a break) |
| `ROOM_TONE_DRIFT` | a place returned to at the same time of day no longer sounds like it did (flashbacks excepted) |

On the spoken film (`apps/worker/src/voice/continuity.ts`), checked at the final
render from the scene voice tracks and recorded as `AUDIO_CONTINUITY`
(warning):

- `VOICE_CHANGES` — a character speaks in their chosen voice in some scenes
  and in a built-in voice in others.
- `BUILT_IN_ENGINE_CHANGES` — built-in voices came from different engines, so
  the narrator and every character without a chosen voice change voice
  mid-film.

A re-render replaces the previous render's findings.

## 5. What is still open

- Self-hosted voice models: gated (Phase 1) and uncleared (checkpoint, training
  data, dependencies, owner approval).
- Voice similarity, naturalness and VRAM in the benchmark.
- Sound effects are not compared (there is no SFX generator yet).

## 6. Owner steps

- Deploy the worker and the web app.
- Run `voice:bench --voice <your voice> --record` once with your own voice.
- Set `VOICE_MODEL_APPROVALS` only after Phase 1, and only for a checkpoint
  whose terms are recorded as verified.
