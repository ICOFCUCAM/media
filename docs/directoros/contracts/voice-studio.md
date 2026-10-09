# Contract — Voice Studio on the Voice Engine: readings, licences, traits, ledger (W15)

Requirements: gap analysis §W15; Part 1 §19.2; Part 3 §116–117, §128; Part 4
§143, §149, §156, §170, §174.

Code:
- `packages/voice-contracts/src/reading.ts`
- `apps/worker/src/voice/reading.ts`
- `apps/worker/src/processors/voice-lab.processor.ts`
- `apps/worker/src/voice/film.ts` (traits)
- `apps/worker/src/voice/mastering.ts` (`applyGain`)
- `apps/worker/src/voice/ledger.ts`
- `apps/web/components/VoiceLab.tsx`
- `apps/web/lib/readings.ts`
- `apps/web/components/CharacterLibrary.tsx`
- migrations `0050_voice_use.sql` and `0051_voice_use_grants.sql`

## 1. Purpose

Every reading speaks through the Voice Engine, in the owner's choice of mode
and delivery. A voice speaks only for its owner or a licensed user. Characters
keep their voice traits, and every spoken part is accounted for on the Master
Clock.

## 2. Inputs

- Voiceover rows: text, language, mode, style, speakers, voice.
- Voice licences.
- Character voice profiles.
- Scene speech.

## 3. Outputs

- Mastered readings in `voiceovers/<user>/<id>.mp3`, with the engine and duration.
- `voice_licences` rows.
- Film voice tracks with traits applied.
- `audio_generations` ledger rows.

## 4. Dependencies

- W7 Voice Engine
- W14 licence registry and speech cache
- W11 metering
- 0029 `audio_generations`

## 5. Forbidden behavior

- Calling a speech provider outside an engine adapter.
- Speaking with a voice the user neither owns nor holds an active licence to,
  or with a voice that has been withdrawn.
- Speaking with a voice that has no recorded consent.
- Falling back from a chosen voice to a built-in one.
- Writing a licence any way other than `accept_voice_terms`.
- Exposing `voice_usable_by` or the trigger function over RPC.
- Naming a speech model in the UI.
- Recording a provider's voice id in the ledger.

## 6. Runtime behavior

1. The web inserts a PENDING reading. The database trigger checks every voice it names.
2. The poller claims it, and the worker runs `renderReading`, checking each voice again.
3. Each part is segmented, routed, synthesized, mastered, joined, encoded and uploaded.
4. The reading becomes READY, or FAILED with the reason. A refusal is final; a
   provider failure retries first.
5. Scene voices apply character traits. The audio processor writes the ledger.

## 7. Persistence

- `voice_licences`, holding the snapshotted terms and `revoked_at`.
- `voiceovers` columns: `mode`, `style`, `speakers`, `engine` and `duration_ms`.
- `characters.voice_profile.traits` (no schema change).
- `audio_generations` rows (table from 0029).

## 8. Status

FUNCTIONAL. Live conversation and lip-synced dubbing are not built.
