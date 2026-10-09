# Contract — World and time: Film Bible, story clock, weather and sun, shot record, shot end state (W20)

Requirements: gap analysis §W20; Part 1 §3, §6, §10, §32.3, §33 and §36.2.

Code:
- `packages/movie/src/ir/schema.ts` (FilmBible, StoryTime.clock, Scene.weather, Shot composition / depthOfField / focus)
- `packages/movie/src/world/state.ts` (`sunPhase`, `clockFitsTimeOfDay`, weather carried through the day)
- `packages/movie/src/ir/validate.ts` (clock and weather checks)
- `packages/movie/src/world/end-state.ts` (`endStateOf`, `previousEndState`)
- `packages/movie/src/prompt/canonical.ts`, `packages/movie/src/prompt/compilers.ts`, `packages/movie/src/compile/`
- `packages/movie/src/review/visual.ts`
- `packages/movie/src/intelligence/prompts.ts` (director.master v7, director.revision v6)
- `apps/worker/src/processors/video.processor.ts`

## 1. Purpose

Make time, weather and the full shot record part of canon, checked and
carried into generation, and say in data where each shot ended.

## 2. Inputs

The Film IR, with the optional new fields.

## 3. Outputs

- **World state:** the clock, sun, weather and whether the weather was
  inherited, per scene.
- **Validator issues:** `CLOCK_OUTSIDE_TIME_OF_DAY`, `TIME_REGRESSION`,
  `CONTINUOUS_TIME_JUMP`, `WEATHER_CHANGE_IN_CONTINUOUS_ACTION`.
- **Canonical requests:** `environment.clock`, `sun` and `weather`;
  `camera.composition`, `depthOfField` and `focus`;
  `continuity.continuesFrom`.
- **Model prompts and `camera_plan`:** carry the new fields.
- **Clip media versions:** `derivation.endState`.

## 4. Dependencies

None new.

## 5. Forbidden behavior

- Changing the request, prompt or hash of a plan without the new fields.
- Letting the previous shot's end state change this shot's canonical hash.
- Carrying weather into another story day or a flashback.
- Inventing a clock or weather the plan does not give.

## 6. Runtime behavior

- `materializeWorld` derives the sun and carries the weather.
- `validateCanon` checks the clock and weather.
- `compileGeneration` adds the environment, camera record and
  `continuesFrom`.
- `compileFor` writes them into each model's prompt, inside its length
  limit; they are dropped and reported if they do not fit.
- The video processor records each clip's end state.

## 7. Persistence

- The Film IR (`screenplays.raw`).
- `shots.camera_plan`.
- `media_versions.derivation.endState`.

No migration.

## 8. Failure behavior

The new checks are canon issues: the plan is revised, as with the others.

## 9. Observability

- The validator issue codes.
- The end state on every clip version.

## 10. Acceptance tests

- `packages/movie/src/world/environment.test.ts`
- `packages/movie/src/prompt/environment.test.ts`

## 11. Integration test

The existing prompt and compile tests, unchanged and passing, prove that
older plans compile exactly as before. The new tests prove the end state
crosses a continuous scene boundary and stays out of the hash.

## 12. Production readiness

Requires real plans from the Director carrying the new fields, scored on the
benchmark (`director.master` v7). Until then: FUNCTIONAL.
