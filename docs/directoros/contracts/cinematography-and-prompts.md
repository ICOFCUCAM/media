# Contract — Cinematography Engine and Prompt Compiler (W4)

Requirements: DOS-11, 12, 13, 14, 32.5, 91.
Code: `packages/movie/src/cinema/engine.ts`, `packages/movie/src/prompt/`
(canonical.ts, compilers.ts), `packages/movie/src/compile/compile.ts`,
`apps/worker/src/director/director.service.ts` (`planDegradations`),
`apps/worker/src/processors/video.processor.ts` (seed prompt, preamble).

## 1. Purpose

Hold every planned shot to film grammar, describe each shot once in
CineForge's canonical language, and translate that description into the
syntax and limits of the engine that will render it. Not responsible for
inventing coverage (the Director plans it in the master call), for audio
prompts (W7) or for image models that are not in the registry yet (W6).

## 2. Inputs

A validated Film IR (shots now carry `side` A/B/neutral and
`screenDirection` left/right), the world state, and a registry model id.

## 3. Outputs

- `cinemaIssues(pkg)` → hard issues (stage `cinema`); `cinemaAdvisories(pkg)`
  → advisories.
- `compileGeneration(pkg, sceneId, shotIndex)` → `CanonicalMediaRequest`
  (shotId, visualIntent with each subject's canonical look and holdings,
  camera, environment, style, continuity references and relationships,
  audio); `canonicalHash(request)`.
- `compileFor(modelId, request)` → `{ prompt, negativePrompt, dropped[], hash }`.

## 4. Dependencies

The World State Engine and Continuity Engine (corrected context). Nothing
else: pure functions, no I/O, no model calls.

## 5. Forbidden behavior

- A model prompt written from anything but the canonical request.
- Dropping part of the request silently: every omission is in `dropped` and
  recorded as `PROMPT_LIMITED`.
- Failing a plan on a craft preference (grammar is advisory; only the 180°
  line and eyeline matches fail).
- Re-describing continuity in a second text block for Film IR shots (the
  legacy preamble is for projects planned before W2).

## 6. Runtime behavior

Planning: the validator's `cinema` stage rejects a cut straight across the
action line (A→B without a neutral shot) and a reverse whose eyelines do not
meet; the surgical revision fixes them like any other issue. Advisories
(no establishing wide in a new place, three equal sizes, wide → ECU without a
smash cut, a subject's screen direction flipping) and model limits are
recorded as `CINEMA_ADVISORY` / `PROMPT_LIMITED` degradations.
Compilation: every Film IR shot's prompt is `compileFor(project.modelId,
compileGeneration(...))`; seed stills use `compileFor("openai-image", …)`.
Model profiles: Wan (1200 chars, negative prompt, motion), Hunyuan (1500),
OpenAI image (still, structured: scene, subject, action, framing, style,
constraints, intended use), default for other registered video models
(1000 chars, no negative prompt). Over-long prompts drop lowest-priority parts
first (look, light, camera, place) — the subject and action always stay.

## 7. Persistence

`shots.prompt`, `shots.negative_prompt`, `shots.prompt_hash` (hash of the
compiled prompt) and `shots.cache_key` (over the compiled prompt, size,
length, seed, model, framed characters). The canonical request is not
stored: it is a pure function of the stored Film IR and is recomputed.

## 8. Failure behavior

Hard cinema issues → revision → `DIRECTOR_OUTPUT_INVALID`. Everything else is
recorded and production proceeds.

## 9. Observability

`production_degradations` rows (`CINEMA_ADVISORY`, `PROMPT_LIMITED`) on the
project page; the compiled prompt on each shot row.

## 10. Acceptance tests

`packages/movie/src/cinema/cinema.test.ts` (180°, neutral crossing, eyeline,
advisories never failing, pre-W4 plans not judged on missing fields),
`prompt/prompt.test.ts` (request content; determinism; a coat change changes
exactly the shots that show the coat; Wan order and negative prompt; OpenAI
still structure and dropped motion; prompt limits keep the subject; default
profile reports what it cannot take), `compile/compile.test.ts` (identity,
wardrobe, holdings and place in the compiled prompt; Hunyuan syntax for the
same canon), `apps/worker/src/director/director.test.ts` (plan degradations).

## 11. Integration test

`apps/worker/src/canon/revision.db.test.ts` persists compiled prompts through
the production `persistPlan` and re-keys only affected shots on a canon change
(real Postgres, CI). Pending (W10): a GPU run comparing Wan output from
compiled vs pre-W4 prompts on the same plan.

## 12. Production readiness

The W10 comparison run; prompt profiles tuned on real output per engine;
Flux/SDXL/ComfyUI compilers with the image runtime (W6).
