# Contract — Film IR, validator chain and Production Compiler (W2)

Requirements: DOS-22, 23, 24, 25, 59 (upper stages), 64, 85–87, 94, 96.
Code: `packages/movie/src/ir/` (schema, validate, json-schema),
`packages/movie/src/compile/`, `apps/worker/src/director/director.service.ts`.

## 1. Purpose

Define the one structured object a planning model may hand to CineForge — the
Film Production Package — check it completely before anything executes, and
compile it deterministically into the rows the production pipeline runs on.
Not responsible for model-specific prompts (W4) or canon versioning (W3/W8).

## 2. Inputs

- Validator: an untrusted `unknown` (model output) and `ProductionConstraints`
  (scene count, scene length and tolerance, max shots per scene, max shot
  length, film length and tolerance) derived from the paid-for estimate.
- Compiler: a validated `FilmPackage`.

## 3. Outputs

- Validator: `{ ok: true, pkg }` or `{ ok: false, issues[] }`, each issue
  `{ stage, code, path, message }`.
- Compiler: `CompiledFilm` — screenplay (acts with purposes), characters,
  locations, props, scenes (dialogue lines by character, per-character state,
  bridge, mood, music, camera summary) and shots (duration, camera plan, prompt,
  negative prompt).

## 4. Dependencies

zod and zod-to-json-schema. Nothing else: no I/O, no model calls.

## 5. Forbidden behavior

- Filling a missing or invalid field with an invented default.
- Executing (persisting, enqueuing) any part of a package that failed.
- Letting model text reach a renderer without passing the compiler.
- A plan that breaks the estimate (more scenes, shots or seconds than charged).

## 6. Runtime behavior

Stages in order: schema → references (every id resolves; speakers are present;
wardrobe belongs to its character; reveals go to people present) → story
(scene order, acts never regress, setups before payoffs, a protagonist exists)
→ canon (W3: time, continuous action, prop holders, knowledge, foreshadowing,
mysteries, shots against the world state — see world-state.md) → production (scene count, shots
per scene, shot length, scene length) → budget (film length). The compiler is a
pure function; the same package always yields the same rows.

## 7. Persistence

Done by the worker: canon rows (characters, locations, world_objects),
`screenplays` (acts; `raw` = the full package + which provider/model planned it
and whether it was revised), scenes, scene_characters, dialogue_lines, shots
(`camera_plan`, planned `duration_sec`, compiled prompt, cache key).

## 8. Failure behavior

Invalid output never executes. After one surgical revision a still-invalid plan
is `DIRECTOR_OUTPUT_INVALID` with the issues; the project fails with a readable
message and no credits are used.

## 9. Observability

`director.planned` log line (provider, model, revised, issues fixed, scene and
cast counts); the decision log (see intelligence-layer.md).

## 10. Acceptance tests

`packages/movie/src/ir/validate.test.ts` (every stage), `compile/compile.test.ts`
(whole cast, planned durations and camera, identity + wardrobe in prompts,
structured dialogue, determinism), `apps/worker/src/director/director.test.ts`
(constraints vs the estimate, stand-in validity, failure mapping).

## 11. Integration test

Pending (W10): a real planning call for a 30 s and a 3 min brief whose package
validates, compiles and persists; the persisted rows read back equal the
compiled film.

## 12. Production readiness

Migrations 0031–0032 applied; the W10 real-provider planning test passing
nightly; a week of production plans with revision rate and invalid rate tracked
from `ai_decisions`.
