# 55 — Evaluation and acceptance (DirectorOS W10)

**Status:** implemented in code (2026-10-09); migration 0043 **applied live**.
Contract: [evaluation-and-acceptance.md](directoros/contracts/evaluation-and-acceptance.md).
None of the live runs below has been run against production yet — each needs
the owner's credentials (see §6).

W10 is how CineForge stops saying "it looks better to me" (Part 1 §50.3). It
has three parts, each verified on the artifact or state it produced, never on
a provider's word.

## 1. Real-provider tests (Part 2 §76)

`pnpm --filter @cineforge/worker providers:live [--only …] [--record]`

One small, paid call per provider the platform can route to, through the same
adapter production uses, and then the artifact is checked:

| Probe | What is verified |
|---|---|
| `planning:anthropic`, `planning:openai` | a 2-scene master plan that passes the Film IR validator chain and compiles to shots; answered by that provider only |
| `image:openai` | the bytes are PNG/JPEG/WebP, decode, ≥ 256 px, and are not a flat colour |
| `image:comfyui` | **GATED** — ComfyUI waits on docs/39 Phase 1 |
| `video:wan`, `video:hunyuan` | a 2 s clip through the Media Runtime Gateway, downloaded and QC'd (not black, not frozen, right length); the runtime must report **real model execution** — a placeholder clip fails |
| `video:fal` | the hosted tier's clip, downloaded and QC'd |
| `voice:openai-tts`, `voice:fal-minimax` | a spoken line: an audio stream, not silent, long enough, and mastered to −16 LUFS ±1 |
| `voice:qwen3-tts`, `cosyvoice-3`, `gpt-sovits` | **GATED** — self-hosted voice models wait on Phase 1 and a licence entry |
| `music:fal` | a 10 s cue, measured |

Result: `REAL_PROVIDERS: PASS` only when every required capability has a
passing provider and no configured provider failed. Nothing configured is
**INCOMPLETE** (exit 3), never green. GitHub: the **Evaluation** workflow
(`run: providers`), manual, or nightly once the repository variable
`LIVE_PROVIDER_TESTS_NIGHTLY=true` is set. `GPU_JWT_SIGNING_KEY` is never
given to the workflow; for signed GPU calls run the command on the worker host.

## 2. The benchmark (Part 1 §50)

New package `@cineforge/bench`.

**Corpus:** 10 generated films × 10 scenes = **100 scenes, 50 characters, 30
locations, 300 shots**, every film valid and exercising canon (story days, a
continuous scene carrying an injury, a death, a reveal a later line relies on,
a mystery answered for the audience, a setup paid off, a relationship that
changes, props, matched reverses).

**Labelled cases** — one known change to a good film, with the exact finding
expected (or, for a control, none):

| Suite | Cases | Examples |
|---|---|---|
| continuity | 20 defects + 2 controls | wardrobe change in continuous action, dead character appears, knowledge violation, wrong hair/injury/mark requested |
| dialogue | 20 (10 defects, 10 controls) | speaker not present, speech too long, knowledge from another scene, segmentation limits |
| cinematography | 20 (11 defects, 9 property checks) | crossing the line, eyelines, size jump, every compiled Wan prompt carries size, lens, move, identity, wardrobe, place, time, direction |
| voice | 13 | recording quality judgements, the engine router (never a gated engine, no silent default) |

**Metrics (DOS-50.2):** story consistency, character consistency, prompt
adherence, continuity, dialogue, cinematography, voice, compile latency.
Visual and audio quality of generated media and cost are measured by the live
runs and reported as `null` offline, not guessed.

**Today:** 75 of 75 cases pass, 21 controls with 0 false positives, every
metric 100 % → `BENCHMARK_SCORE: 1`. That is the committed baseline
(`packages/bench/baseline.json`); CI fails on any regression.

**Prompt changes (DOS-49):** every registered prompt is fingerprinted (system
text, rendered request, output schema) in `packages/bench/prompts.lock.json`.
CI fails if a prompt changes without a version bump. After a bump,
`pnpm --filter @cineforge/bench bench lock` marks the version **unscored**.

**Live planning benchmark:** `pnpm --filter @cineforge/worker bench:live`
runs the master prompt on five fixed briefs (including the §81 railway
station) and scores validity, first-pass validity, adherence to the brief,
story and character consistency of the plan, latency and cost
(`BENCH_PRICES="model=in:out"`, USD per Mtok — no built-in prices). The score
is recorded in `benchmark_runs` and, with `bench score <report.json>`,
written to the prompt lock. All six prompts are **unscored** until it runs.

## 3. Sync tolerance calibration

`pnpm --filter @cineforge/worker sync:calibrate`

Media with known truth (exact frame counts at 16/24/25/30 fps; speech-like
tones after known silences over room noise in WAV, MP3 and AAC; a flash and a
beep a known distance apart at 16/24/25 fps; one programme at known gain
steps) measured with the A/V Sync Engine's own functions. Results with FFmpeg
6.1:

| Measurement | p95 error |
|---|---|
| clip duration (frames counted) | ≤ 1 µs |
| onset of sound | 2 ms |
| end of sound | 5 ms |
| audio/picture offset | 0.7 ms |
| loudness difference | 0.00 LU |

Every tolerance of every profile (60) is **resolved** (≥ 3 × the noise); the
tightest, 40 ms, sits 8× above it. One finding: **MP3 durations read up to
68 ms long** (encoder padding) — speech is mastered to WAV before it is
measured, so no gate depends on it. This is instrument calibration only;
whether the tolerances are right for viewers is a human judgement, so
`calibrated` stays false on every sync policy.

## 4. The ultimate acceptance test (Part 2 §81)

`pnpm --filter @cineforge/worker film:accept --user <ownerUuid>`

Creates the §81.1 production exactly as the studio does (3 minutes, the
railway-station brief, a project in PLANNING that the worker claims), waits
for it to finish, then runs the **sixteen checks** of §81.2 on the delivered
master (measured with ffprobe/ffmpeg, fully decoded) and on the database:

file exists · MP4 readable · expected duration · expected resolution ·
expected FPS · audio present (voice for every spoken scene, a score, and
ambience/SFX when planned) · audio/video synchronized · loudness valid ·
no corrupt frames · scenes present · shots present · character continuity ·
location continuity (canon + every shot visually reviewed with no mismatch) ·
generated assets registered (versions, master hash) · provenance recorded ·
no failed jobs hidden.

The run is stored in `acceptance_runs`; the database refuses a `PASS` row
without sixteen passed checks. `--project <id>` checks a finished film.
GitHub: Evaluation workflow, `run: film-acceptance`.

**Expected today: FAIL on `audio_present`** — SFX/ambience has no generator
(`sfx_generation` is not implemented), and the plan always asks for
ambience. The check names it; nothing pretends.

## 5. Evidence (migration 0043)

`benchmark_runs` (offline, live planning, providers, sync calibration) and
`acceptance_runs`: append-only, written by the worker, readable by admins.

## 6. Owner steps

1. Set the secrets the Evaluation workflow reads (ANTHROPIC_API_KEY,
   OPENAI_API_KEY, FAL_KEY, S3_*, DATABASE_URL, WAN_GPU_URL) and optionally
   the variables OPENAI_PLAN_MODEL, BENCH_PRICES.
2. Run **Evaluation → providers**, then **planning-benchmark**; commit the
   score with `bench score`.
3. Run **film-acceptance** once the worker and GPU are deployed (docs/43).
   Expect the SFX failure above until a sound-effects generator exists.
