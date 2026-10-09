# Contract — Previs (rough voice, animatic, timing) and film lock → approved timeline → master (W19)

Requirements: gap analysis §W19; Part 1 §38 and §40–43.

Code:
- `apps/worker/src/previs/animatic.ts` (`planAnimatic`, `renderAnimatic`, `movementOf`)
- `apps/worker/src/previs/run.ts` (`buildSceneAnimatic`)
- `apps/worker/src/orchestration/previs-flow.ts`, `apps/worker/src/orchestration/passes.ts`
- `apps/worker/src/processors/scene.processor.ts` (job `animatic`)
- `apps/worker/src/timeline/lock.ts` (`approveLockedTimeline`, `cutFromTimeline`, `applyCut`, `lockRendered`)
- `apps/worker/src/orchestration/locks.ts` (`advanceLocks`)
- `apps/worker/src/processors/render.processor.ts` (`RenderJob.timelineId`)
- `apps/worker/src/timeline/store.ts` (cut lengths)
- `apps/web/components/DirectorPasses.tsx`, `CreateStudio.tsx`, `ProductionLocks.tsx`, `apps/web/lib/production.ts`

## 1. Purpose

- **Previs:** let the owner judge a scene, as it will play, before any video
  is generated.
- **Lock:** make a locked film's master the product of an approved, frozen
  timeline.

## 2. Inputs

- **Previs:** a three-pass project whose story is approved; its scenes, shots
  (planned length, camera movement, still) and voice track.
- **Lock:** a READY film with `locked_at` set, and its locked scenes, shots,
  clips and cut lengths.

## 3. Outputs

- **Previs:** per scene, an animatic MP4 recorded as a video media version of
  the scene with `{ role: "animatic", pictureSec, voiceSec, overrunSec,
  missingStills, shots, voice }`, plus `PREVIS_TIMING` when the voice runs
  over.
- **Lock:** an approved `production_timelines` version with its events; a
  master rendered from it, whose derivation names the timeline; the timeline
  frozen; a sync report on it.

## 4. Dependencies

- ffmpeg (still-motion, concat, mux).
- Storage.
- The audio processor's voice job and the speech cache.
- The timeline store (0028–0030) and its database guards.
- The render engine.

## 5. Forbidden behavior

- Generating video in previs.
- Speaking a scene's lines twice: previs uses the scene's real voice track.
- Blocking approval because an animatic failed.
- Rendering a locked film with a shot the timeline names but which has no
  clip.
- Rendering the same lock twice. It is claimed READY → RENDERING, and a lock
  is rendered when an approved or frozen timeline was approved after it.
- Changing an approved timeline's events. The database refuses it.

## 6. Runtime behavior

- **Previs:** once the story is approved, `advancePasses` adds one flow per
  scene. Its children are the stills (video queue `previs`) and the voice
  (audio queue), with `ignoreDependencyOnFailure`. The parent is the
  animatic (scene queue `animatic`).
- **Lock:** each poller tick runs `advanceLocks`, which claims the film,
  approves a timeline and queues `render final` with `timelineId`. The render
  applies the timeline's cut, delivers, freezes the timeline and runs the sync
  check on it.

## 7. Persistence

- `media_versions`: animatics as video versions of scenes.
- `production_degradations`: `PREVIS_TIMING`.
- `production_timelines` and events: status draft → approved → frozen; older
  approvals become superseded.
- The master's `media_versions` derivation includes `timeline`.

All of it is append-only, with no migration.

## 8. Failure behavior

- **No storage:** no animatic.
- **Animatic error:** retried once, then logged. Approval is still possible.
- **Timeline tables missing, or no shots:** the film returns to READY and the
  skip is logged.
- **A render error:** the existing render failure path; the project fails
  with the cause.

## 9. Observability

- `previs.animatic` and `lock.render` log events.
- `[render] … from approved timeline` log lines.
- `PREVIS_TIMING` degradations.
- The animatic and master versions.

## 10. Acceptance tests

- `apps/worker/src/previs/animatic.media.test.ts`: a real animatic, with
  picture and voice at the planned length, in H.264/AAC 48 kHz.

## 11. Integration tests

- `apps/worker/src/previs/animatic.test.ts`: planning, timing, args, the
  recorded version and flag, and the previs flow shape.
- `apps/worker/src/timeline/lock.test.ts`: cut order and lengths, assets from
  the cut, missing clips refused, a lock rendered once, and approval with
  supersede.

## 12. Production readiness

Requires:

- an end-to-end three-pass run on real providers, with animatics reviewed by
  an owner;
- a lock → master run on a real film, with the sync report reviewed;
- audio stems placed by the timeline.

Until then: FUNCTIONAL.
