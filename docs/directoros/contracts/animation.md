# Contract — Animation Studio: cards, shows, episodes, still motion (W12)

Requirements: gap analysis §W12; Part 5 §177–186. Code:
`packages/movie/src/intelligence/cast.ts` (`castId`, `applyCast`,
`castFromPackage`, `recapEpisodes`, `deceasedIn`),
`packages/movie/src/intelligence/prompts.ts` (CAST, RETURNING CHARACTERS,
SHOW BIBLE, EPISODE/PREVIOUSLY), `packages/movie/src/ir/validate.ts`
(`CAST_*`, `DECEASED_APPEARS`, `DESIGN_MISSING`), the IR character `design`,
`packages/shared/src/production.ts` (`episode` kind, `SERIES_MAX_EPISODES`,
style `pipeline`, `isStillMotion`), `apps/worker/src/director/studio.ts`,
`apps/worker/src/animation/still-motion.ts`,
`apps/worker/src/processors/video.processor.ts`,
`apps/web/components/AnimationStudio.tsx`, `apps/web/lib/animation.ts`,
migrations `0046_animation_studio.sql`, `0047_show_container.sql`.

## 1. Purpose

Make animated productions — cartoons, shorts, stories, motion comics and
shows — on the existing engines, with characters that stay themselves across
shots, productions and episodes.

## 2. Inputs

Character Cards and their cast into a production; a show's bible and cast;
earlier episodes' stored Film IR packages; the production type and style; a
shot's drawn still.

## 3. Outputs

Plans that contain every cast card with its exact identity and follow the
show's rules and canon; production characters linked to their cards; episode
rows per show; still-motion clips with measured timing.

## 4. Dependencies

W2 planner and validator; W3 world state (recaps); W4 prompt compilers; W5
quality gates; W7 voices; W11 production types; FFmpeg/ffprobe on the worker.

## 5. Forbidden behavior

- Planning a production before its cast is attached.
- Letting the model's identity for a cast character reach a prompt (it is
  overwritten from the card).
- An animated character without a design; a character who died earlier
  appearing outside a flashback; a cast card missing or renamed.
- A drawn (storybook/motion-comic) shot made from text alone, or by a video
  model, when its page cannot be drawn — it fails with the reason.
- Planning an episode whose show is missing (refused, never planned without
  its canon); guessing from an earlier plan that does not parse (skipped).
- Another user's card in a cast, or an episode attached to another user's
  show (RLS and a trigger).

## 6. Runtime behavior

`loadProductionCanon` reads cards (production + show), the bible and earlier
episodes; `constraintsFor` adds `animation`, `cast` (cards only) and
`deceased`; `planProductionFor` adds the sections; `planFilm` validates and
then `applyCast`s; `persistPlan` links cards, copies their voices and fields,
stores designs and the show's episode row. `video.processor` routes drawn
shots to the still-motion engine, which downloads the still, runs the camera
move, probes the result and uploads it.

## 7. Persistence

`characters` card fields + `source_character_id`; `project_cast`;
`show_bibles`; `projects.series_id`, `episode_number`, `mode 'show'`;
`episodes.project_id`. Checks: style values, design shape, height range, one
bible per show, episode ⇔ show + number (1–500), one-pass series 1–5, a show
container is a DRAFT series.

## 8. Failure behavior

Validator issues trigger the one surgical revision, then
`DIRECTOR_OUTPUT_INVALID`; a missing show throws; a drawn shot without its
still is unrecoverable with the reason; a casting insert failure marks the
project FAILED with the message.

## 9. Observability

Plan request text (decision log) shows every section; validator issue codes;
still-motion clips carry `measuredBy` and an execution report; the usage
ledger records the seed image and zero GPU-ms.

## 10. Acceptance tests

`packages/movie/src/intelligence/cast.test.ts` (ids, applyCast, CAST_*,
DECEASED_APPEARS, DESIGN_MISSING, sections, design in prompts, recaps,
returning characters); `apps/worker/src/director/studio.test.ts` (cards →
cast, bible, episode 7 knows episode 1, one-pass season + remake, missing
show refused, bad plans skipped); `apps/worker/src/animation/still-motion.media.test.ts`
(real FFmpeg: every camera move, exact frames, timing gate ACCEPTED, no
freeze); `packages/shared/src/production.test.ts`; `packages/model-adapters/src/cost.test.ts`;
`packages/db/supabase/tests/0046_*.test.sql`, `0047_*.test.sql`.

## 11. Integration test

Not yet run end to end against live providers: a cartoon with a cast card,
then episode 2 of a show, through `film:accept` with an animation brief.

## 12. Production readiness

FUNCTIONAL — built and tested, migrations live; not yet exercised by a live
run, and the prompt versions are unscored until `bench:live`.
