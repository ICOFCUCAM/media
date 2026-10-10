# Contract — Dubbed films as real masters (W22)

Requirements: gap analysis §W22; Part 3 §111 and §117.3/§117.5.

Code:
- `apps/worker/src/localize/dub.ts` (`renderDubbedFilm`, `dubAssets`, `dubMixEnabled`)
- `apps/worker/src/processors/localize.processor.ts`
- `apps/worker/src/render/inputs.ts` (`sceneAssetsOf`, `lipSyncScenesOf`)
- `apps/worker/src/render/lip-sync-pass.ts`
- `apps/worker/src/render/profile.ts` (`masterGate`, `brandOutro`)
- `apps/worker/src/ffmpeg/render-engine.ts` (`dir`)
- `apps/worker/src/lipsync/plan.ts` (`audioOffsetSec`)

## 1. Purpose

A dubbed language is the same film in another language: the same picture,
the same sound design and the same checks. With lip sync on, the mouths match
the new words.

## 2. Inputs

- The film's scenes, clips, cuts and audio tracks.
- A locked film's frozen timeline.
- Per scene, the dubbed track and its cues (line, speaker, start, length).

## 3. Outputs

- `projects/<id>/film/<lang>/final.mp4` and its poster.
- `films.locales[lang] = { mp4, voice, mixed: true, lipSynced }`.
- Lip-synced clips per language and shot.
- Degradations.

## 4. Dependencies

- The render engine.
- The lip-sync pass (W21).
- The Voice Engine and the translation step (W7c).
- Storage.

## 5. Forbidden behavior

- A dub that silently loses the film's music or sound design. The fallback is
  recorded.
- The original voice under a translated scene: a scene with nothing to say in
  the language has no voice.
- A dub that skips the quality gate.
- A dub on a different cut from the film's delivered one.

## 6. Runtime behavior

For each language:

1. Translate.
2. Speak the scene tracks.
3. Upload the joined voice track (kept for the record).
4. Unless `DUB_MIX=0`, run `renderDubbedFilm`:
   - the lip-sync pass on the dubbed lines;
   - the assets with the dubbed voice;
   - the frozen timeline's cut, for a locked film;
   - the render with the gate, into the language's folder.
5. If that fails, fall back to the voice swap and record `DUB_MIX_FALLBACK`.

## 7. Persistence

- `films.locales`.
- Storage.
- `production_degradations`.

No migration.

## 8. Failure behavior

- **A shot's lip sync fails:** the shot keeps its clip and the failure is
  recorded.
- **The full dub fails:** fall back to the voice swap and record it.
- **Translation or voice fails:** the language is skipped, as before.

## 9. Observability

- `[localize] dubbed … (full mix, N lip-synced shots)` log lines.
- `render.lip_sync` events with the language.
- Metering, with `lip_sync` calls tagged by language.

## 10. Acceptance test

`apps/worker/src/localize/dub.test.ts` covers the assets keeping music and
sound design, the dubbed voice in place, stub rows excluded, and lip-sync
slices read from the dubbed track at the translated line's place.

## 11. Integration tests

- The render processor uses the same `sceneAssetsOf` and `lipSyncPass`.
- `apps/worker/src/lipsync/lipsync.test.ts` and
  `apps/worker/src/lipsync/lipsync.media.test.ts` keep passing.

## 12. Production readiness

Requires:

- a dubbed film reviewed in at least two languages, with and without
  `LIP_SYNC`;
- the per-language render cost accepted.

Until then: FUNCTIONAL.
