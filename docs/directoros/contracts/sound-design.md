# Contract — Sound design: ambience, sound effects and the profile-driven mix (W16)

Requirements: gap analysis §W16; Part 1 §18 and §20; Part 5 §178.4, §180.1 and §181.5.

Code:
- `packages/movie/src/sound/plan.ts` (`sceneSoundPlan`, `placeCue`)
- `packages/shared/src/sync/mix.ts` (`MixSpec`, `MIX_SPECS`, `mixSpec`)
- `apps/worker/src/audio/sound.ts`
- `apps/worker/src/processors/audio.processor.ts` (the ambience and sfx branches)
- `apps/worker/src/orchestration/film-flow.ts` (`soundNodes`)
- `apps/worker/src/ffmpeg/commands.ts` (`soundStemArgs`, `audioMixArgs`)
- `apps/worker/src/ffmpeg/render-engine.ts` (`sceneSpans`)
- `apps/worker/src/processors/render.processor.ts` (`renderProfile`)

## 1. Purpose

Every scene sounds like its place. Every planned effect lands on its shot. The
film is mixed and judged by its production profile.

## 2. Inputs

- The Film IR: scene ambience, effects and shots.
- The cut: the clips as trimmed.
- The production profile: its sync policy and mix spec.

## 3. Outputs

- Content-addressed sounds.
- AMBIENCE and SFX `audio_tracks`.
- `audio_generations` ledger rows.
- A master mixed to the delivery target.
- TRACK_MISSING when a sound cannot be made.

## 4. Dependencies

- A fal text-to-audio model.
- W11 metering.
- W15 ledger conventions.
- The render engine and the Final Quality Gate.

## 5. Forbidden behavior

- Asking the sound model for music or voices.
- Writing a track row for a sound that does not exist in storage.
- Billing a cached sound.
- Silently dropping a sound that failed.
- Ducking effects, or attenuating dialogue.
- Placing a bed outside its scene, or an effect past its scene's end.
- Mixing or judging the master against targets other than the profile's.

## 6. Runtime behavior

1. The film flow adds `ambience` and `sfx` jobs per scene. `SOUND_DESIGN=0` leaves them out.
2. The processor reads the scene's sound plan from `screenplays.raw.package`.
3. It generates each sound, or reuses it from the cache.
4. It writes every row at once, so a retry stays idempotent.
5. The render places the stems on the measured scene spans and mixes them with
   the mix spec and delivery spec.

## 7. Persistence

- `audio_tracks`:
  - AMBIENCE runs from `startMs` 0 for the scene's planned length.
  - SFX sits at its planned `startMs`.
  - `meta` holds the prompt, the anchor, `plannedSceneMs` and whether the sound was cached.
- `audio_generations` rows for kinds `ambience` and `sfx`.
- Sound objects under `audio_cache/sound/`.

## 8. Status

FUNCTIONAL. Placing narration per scene, giving shots their own audio cues,
and crossfading ambience loop seams are open.
