# Contract — Lip sync, frame interpolation, Character Card portraits (W21)

Requirements: gap analysis §W21; Part 1 §2.4 and Part 5 §183.

Code:
- `apps/worker/src/lipsync/plan.ts`, `apps/worker/src/lipsync/provider.ts`, `apps/worker/src/lipsync/run.ts`
- `apps/worker/src/processors/render.processor.ts`
- `apps/worker/src/ffmpeg/commands.ts` (`interpolating`, `interpolateFilter`)
- `apps/worker/src/ffmpeg/render-engine.ts` (`lightFps`)
- `apps/worker/src/images/portraits.ts`
- `apps/worker/src/orchestration/project-poller.ts`
- `apps/worker/src/acceptance/probes.ts` (`lipsync:fal`)
- `apps/web/components/AnimationStudio.tsx`, `apps/web/lib/animation.ts`
- migration `0054_character_portraits.sql`

## 1. Purpose

- Speakers' mouths move to their lines.
- Frame-rate changes do not stutter.
- A Character Card has its picture.

## 2. Inputs

- **Lip sync:** each scene's shots (clip, cut length, size, framed subjects),
  its dialogue lines (speaker, audio, start) and the voice track's cue
  lengths.
- **Portraits:** a card whose `portrait_status` is `requested`.

## 3. Outputs

- **Lip sync:** a lip-synced clip per eligible shot under
  `projects/<p>/lipsync/<shot>-<hash>.mp4`, used by the render.
- **Interpolation:** interpolated frames in the master.
- **Portraits:** a portrait under `projects/<p>/characters/<id>/`, an image
  ledger row (purpose `portrait`), and the card's status and key.

## 4. Dependencies

- fal (lip-sync model, image model), through `falUploadBytes`,
  `falRunQueue` and `falFindUrl`.
- ffmpeg.
- Storage.
- Metering.

## 5. Forbidden behavior

- Lip-syncing wides or inserts, or a shot to another character's lines.
- Changing a clip's length.
- Calling the model twice for the same clip and lines.
- Failing a film because lip sync failed.
- A client writing a portrait key or a status other than `requested`.
- A fake portrait when no image provider is configured: the request fails
  with its reason.

## 6. Runtime behavior

- **Lip sync:** the render runs `lipSyncFilm` before building its assets,
  when `LIP_SYNC=1`.
- **Interpolation:** `normalizeArgs` and the light pass use `minterpolate`
  when `RENDER_INTERPOLATE=1`.
- **Portraits:** each poller tick runs `drawPortraits` (three at a time).

## 7. Persistence

- Lip-synced clips in storage, content-keyed.
- `characters.portrait_key`, `portrait_status` and `portrait_error` (0054).
- `image_generations` (purpose `portrait`).
- `production_degradations`: `LIP_SYNC_FAILED`, `LIP_SYNC_UNAVAILABLE`.

## 8. Failure behavior

- **A shot's lip sync fails:** the shot keeps its clip and the failure is
  recorded.
- **No lip-sync provider:** recorded once.
- **A portrait fails:** the card shows `failed` with the reason. The owner
  can ask again.

## 9. Observability

- `render.lip_sync` log events.
- `portraits` log events.
- Metering (`lip_sync`, portrait images).
- The degradations above.

## 10. Acceptance tests

- `apps/worker/src/lipsync/lipsync.media.test.ts`: a real dialogue stem;
  real interpolation from 16 to 24 fps.
- `packages/db/supabase/tests/0054_character_portraits.test.sql`
- The `lipsync:fal` probe.

## 11. Integration tests

- `apps/worker/src/lipsync/lipsync.test.ts`: targets, slices, stem, key,
  cast mapping, make, reuse and failures.
- `apps/worker/src/images/portraits.test.ts`

## 12. Production readiness

Requires:

- a `lipsync:fal` probe PASS;
- a film with dialogue rendered with `LIP_SYNC=1` and reviewed;
- the per-shot cost accepted;
- lip-synced dubs.

Until then: FUNCTIONAL.
