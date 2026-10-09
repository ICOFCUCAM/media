# DirectorOS gap analysis and implementation map

Status: analysis of Parts 1–4 (454 requirement IDs) against the CineForge code
at merge `9c957bf` (2026-10-08). **Progress:** W1 (truth layer) and W2 (intelligence layer,
Film IR, master call, compiler) are implemented — see [docs/44](../44-truth-layer.md)
and [docs/45](../45-directoros-intelligence.md); the scoreboard and index reflect them. Read-only study; no code was changed to
produce it. Every status in [requirements-index.md](requirements-index.md) is
filled from this document.

How it was done: the as-built system was traced first (web → database → poller
→ queues → worker → Director → GPU → audio → render → storage → playback, plus
the data model, doctrine in `docs/38`–`43`, deployment and CI), and the live
Supabase project was checked read-only for which migrations are applied. Only
then was each DirectorOS section judged against that baseline, on behaviour,
not names. A type, table or UI page with no working logic behind it is
"shallow".

**Status values.** `built` real, working, tested · `shallow` exists but thin,
stubbed, UI-only, unpersisted or unvalidated · `poorly built` exists but is
structurally wrong against the spec · `not built` · `n/a` an author's remark,
comparison or process instruction (process rules still become artifacts, see
W1).

**Action values.** BUILD (new) · UPGRADE (extend what exists) · CHANGE (replace
a design that contradicts the spec) · KEEP.

---

## 1. Verdict in one paragraph

CineForge has a **real, tested media engine** and a **thin intelligence layer**.
Below the Director, the work of the last phases is solid: the Media Runtime
Gateway, the verified GPU image chain, the Master Production Clock, the runtime
contract with timing reports, the timeline / ledger / media-version data model,
the A/V Sync Engine and the narration-overrun protection. Above it, the
"Director" is one Claude tool call that returns one protagonist, one location
and a list of scene beats; shots are produced by formula (fixed 5 s, size
cycled `i % 4`), prompts are string concatenation, continuity is a name-keyed
map of free-text strings guessed by regex, and nothing reviews the output before
it is marked READY. The DirectorOS specification is therefore **mostly not
built or shallow in the intelligence, canon, shot-design, review and voice
layers, and mostly compatible with the doctrine** of `docs/38`: it sits on top
of the media engine rather than replacing it. The most urgent problems are not
missing features but **untruthful behaviour**: 23 silent-degradation paths
(stub films on LLM failure, placeholder GPU clips returned as success, films
shipped without audio or with missing shots, self-certified READY) that the
spec's Reality Gate / No Fake Completion / No Silent Degradation rules forbid.

### Scoreboard (by requirement ID)

| Part | built | shallow | poorly built | not built | n/a | IDs |
|---|---|---|---|---|---|---|
| 1 Movie Intelligence (§0–59) | 17 | 66 | 4 | 52 | 1 | 140 |
| 2 Engineering contract & intelligence layer (§60–107) | 55 | 32 | 13 | 16 | 22 | 138 |
| 3 Voice Clone Talker (§108–129) | 0 | 15 | 0 | 21 | 16 | 52 |
| 4 Voice Engine (§130–176) | 0 | 15 | 18 | 65 | 26 | 124 |
| **Total** | **72** | **128** | **35** | **154** | **65** | **454** |

Counts are generated from the index (section-level status with per-ID overrides). The low `built` count is not a verdict on CineForge as a whole: DirectorOS specifies the layers **above** the media engine, and the media engine's strengths (gateway, clock, runtime contract, timeline, A/V sync) are what the new layers will stand on. Those strengths show up below as KEEP and as reuse, not as `built` IDs.

---

## 2. CineForge as built (the baseline)

### 2.1 The real production path

```
apps/web create studios (film / series / trailer / shorts / advert)
   │  useCreateRun → SupabaseRun  (LiveRun only if NEXT_PUBLIC_API_URL; DemoRun = client simulator)
   ▼
Supabase  projects row  status=PLANNING, mode=auto        (apps/api is NOT deployed and not on this path)
   ▼
worker poller  (apps/worker/src/orchestration/project-poller.ts, every 5 s)
   │  credit gate → claim PLANNING→GENERATING → film-queue "plan"
   ▼
film.processor → moderation (OpenAI, fails open) → DirectorService.plan
   │  director/llm.ts: ONE Claude call, forced tool submit_film_plan
   │  → 1 protagonist, 1 location, N scene beats; stub film on any failure
   │  director.service.ts: scenes (18 s) × shots (5 s), template prompts, cacheKey
   ▼
BullMQ flow (orchestration/film-flow.ts)
   render-final ← scene-finalize ×N ← { video "shot" ×k, audio "voice", audio "music" }
   ▼
video.processor: cache hit? → gpt-image-1 seed still → continuity preamble + refs + LoRA
   → gateway-authorized adapter.generate (Wan/Hunyuan on RunPod, Kling via fal)
   → timing gate (record) → ledger (no-op: table not live) → READY  ("QC gate omitted")
audio.processor: OpenAI tts-1 "onyx" per scene; one fal score on scene 0; SFX never
scene.processor: duration = sum of requested shot durations → READY
render.processor: concat → amix + loudnorm −16 → mux (no -shortest; overrun = fail)
   → HLS, poster, outro, films upsert → READY   (default path re-encodes at fps=16)
   ▼
Supabase Realtime → web progress;  HlsPlayer / StreamingChannel playback
```

Operator-only, not in the path: `timeline:build`, `avsync:check`.
Dead or unconsumed: `apps/api` (undeployed; the web calls routes it lacks),
`packages/realtime` events (no subscriber in production), `publish-queue` (no
producer), render kinds `preview` / `scene`.

### 2.2 Data model

48 Prisma models (`packages/db/prisma/schema.prisma`; SQL in
`packages/db/supabase/migrations`). Live Supabase has **0001–0026**;
**0027–0030 are not applied** (no `production_timelines`, `media_versions`,
`video_generations`, `sync_policies`, `characters.lora_sha256`).

- Strongly structured and DB-enforced: timelines (bigint µs, rational fps,
  immutable once approved), media versions, generation ledgers, sync policies,
  sync reports and repair jobs (0028–0030, not live); gateway tables (0026, live,
  0 rows).
- Free text or JSON where the spec needs structure: `Screenplay.acts/raw`,
  `Scene.dialogue/camera/mood/music`, `Character.appearance/arc`,
  `Scene.bridge/statePatch`, `Shot.prompt`.
- Exist but unused by the worker: `Series`, `Season`, `Episode`, `StoryEvent`,
  `ContinuityState`, `Wardrobe`, `Relationship`, `WorldObject`, `DialogueLine`
  (0 live rows), `RenderJob`, `Shot.cameraPlan`, `Character.voiceProfile`.

### 2.3 Doctrine already binding (docs/38 v2.6)

- §0 CineForge owns intelligence; DeployPro owns infrastructure.
- Model neutrality (§E, §H): no application code may know the production model;
  the registry/router decides. Wan 2.2 candidate, Wan 2.1 legacy.
- §AF portability: Docker, env config, `/livez` `/readyz` `/metrics`, no
  permanent lock to Vercel, Render, RunPod, OpenAI images or third-party video.
- §AT.2 ComfyUI is an execution runtime behind `WorkflowRuntime`; users never
  touch graphs; workflows versioned; routing and licensing stay in CineForge.
- §AV.1 22 binding decisions, including: gateway authorizes workflow and model;
  licence/territory enforced before execution; **COMPLETE only after the Final
  Quality Gate**; no silent timing change; Master Clock is the sole temporal
  authority; no silent narration truncation.
- §AX.2 governing order: 1 GPU security → 2 Clock → 3 Runtime contract →
  4 Timeline data model → 5 A/V Sync → 6 ComfyUI → 7 Workflow Registry →
  8 Approved models → 9 Repair → 10 Final Quality Gate → 11 Mastering →
  12 DeployPro GPU.
- §AY status: 1 implemented but **not operational** (report mode, no keys, no
  deployment, S3 keys on the pod); 2–3 done; 4 code done, **migrations not
  applied**; 5 analysis, operator-run; 6–12 not started.

### 2.4 Deployment and tests

Web on Vercel (Supabase direct from the browser). Worker moving from suspended
Render to DeployPro (root `Dockerfile`, `health.ts`; no worker currently
running: live projects stuck in PLANNING/GENERATING). One RunPod GPU pod
(`cineforge-gpu@sha256` image). Supabase Postgres + Storage + 3 edge functions.
Third parties: Anthropic, OpenAI, fal, Resend.

CI tests for real: clock math, sync engine, timing classification, real-FFmpeg
conform and overrun, gateway crypto and enforce-mode probes, SQL constraints of
0026–0030. Mocked or placeholder: all GPU inference (grey FFmpeg clips), every
LLM / OpenAI / fal / Stripe call; `apps/web` has no tests; no end-to-end test.

### 2.5 Where docs and code already disagree

| Doc claim | Code |
|---|---|
| docs/38 header "Implementation NOT APPROVED" | §AY records Phases 1–5 implemented |
| docs/38 §AY "render conform executes the clock's plan" | only when `RENDER_NORMALIZE=1`; default re-encodes at `fps=16` (`render-engine.ts:85`) |
| docs/05 multi-pass Director with zod contracts | one Claude tool call, no zod |
| docs/06 continuity in `apps/api/src/continuity` | `packages/shared/src/continuity.ts` (+ a web copy) |
| docs/09 QC gates (black/frozen, identity, CLIP, NSFW, ffprobe) | none in the path |
| docs/11 ElevenLabs + XTTS | OpenAI tts-1 + fal MiniMax |
| docs/12 `apps/worker/src/gpu/autoscaler.ts` | does not exist |
| docs/13 DLQs | none |
| docs/39 `packages/runtime-gateway` | `packages/model-adapters/src/gateway` + `apps/worker/src/gateway` |
| `apps/web/lib/system.ts` "Implemented" badges | hand-written, not from tests |

---

## 3. How DirectorOS fits the existing doctrine

DirectorOS is **the layer docs/38 does not specify**: docs/38 governs the media
engine (runtime, clock, timeline, sync, mastering, GPU, models), while
DirectorOS specifies the intelligence, canon, shot-design, review and voice
layers above and beside it. They meet at four seams:

| Seam | DirectorOS | docs/38 | Resolution |
|---|---|---|---|
| Film IR → timeline | Film IR, Movie Compiler (§22–23, §59, §87) | Timeline as authoritative IR (§AU, §AW) | Film IR compiles **into** `production_timelines`; the timeline stays the temporal authority. |
| Prompt Compiler → runtime | model-specific compilers (§13), ImageProvider (§105) | `WorkflowRuntime`, Workflow Registry, router (§AT.6–8, §H) | Compilers emit a canonical request; the Workflow Builder turns it into a registered workflow. No second router. |
| QC → repair | Visual Reviewer, quality gates (§16–17, §39) | Repair engine, Final Quality Gate (§AU.12–13, Phases 9–10) | DirectorOS adds creative/visual review; docs/38 owns technical validity and `COMPLETE`. One gate chain. |
| Voice Engine → audio | Voice Engine (§143–176) | Audio Engine interface, mastering (§AU.6, §AU.17) | The Voice Engine is the Audio Engine's speech provider; mastering stays in the media engine (both documents agree). |

Conflicts to settle (decisions in §10):

1. **Provider of the brain.** Part 1 recommends the OpenAI Responses API; the
   Director runs on Claude. Part 2 §88 resolves it: a provider-neutral
   intelligence layer with a router. Neither vendor is foundational.
2. **ComfyUI timing.** Part 2 §101–103 makes ComfyUI the image execution graph
   and §76 asks for real ComfyUI tests; docs/38 gates ComfyUI (Phase 6) on
   Phase 1 being operationally complete. The gate stands; DirectorOS work that
   does not need ComfyUI (W1–W5, W8) proceeds in parallel.
3. **OpenAI image is foundational today** (`director.service.ts:55`,
   `video.processor.ts:217`), against Part 2 §106 and docs/38 §Z (planned
   removal). Becomes a registry entry, off by default, once a self-hosted image
   path exists.
4. **Voice Engine placement.** Spec says `services/voice-engine/`; the
   workspace only globs `apps/*` and `packages/*`. Place as
   `packages/voice-contracts` + `apps/voice-api` + `apps/voice-worker` +
   `apps/voice-gpu-worker` (same boundary, no workspace change).
5. **DOS-3.2 path** `cineforge/movie/canon/…` maps to a new `packages/movie`
   (canon, IR, compilers), not a top-level folder.
6. **GPU tiers.** DOS-59.2 names L4 / 5090 / L40S / H100; `packages/gpu`
   `GpuType` is A40 / A100 / H100. Capability-based tiers per docs/38 §0/§AI.

---

## 4. Part 1 — Movie Intelligence (§0–59)

| § | Status | Evidence | Action |
|---|---|---|---|
| 0 Stance | shallow | plan → flow with no Intelligence/Canon/QC stages (`film.processor.ts:244`, `video.processor.ts:323`) | BUILD the missing stages around the existing flow |
| 1 Director, not engine | **built** | LLM only plans; FFmpeg/GPU/scheduling are code | KEEP; widen what the Director decides |
| 2 Four layers | poorly built | Layer A = `draftFilm`; Layer C mixed into `director.service.ts` with persistence and prompt strings; Layer D real | CHANGE: separate intelligence / canon / production modules with typed boundaries |
| 3 Film Bible | shallow | `Screenplay` = logline, synopsis, genre, tone, `acts` (hard-coded 1 act, `director.service.ts:80`) | BUILD a typed, versioned FilmBible (25 fields of DOS-3.3), single source for every stage |
| 4 Character Bible | shallow | free-text `appearance`; exactly one protagonist (`llm.ts:243`); ID→refs+LoRA retrieval real (`video.processor.ts:142-155`) | UPGRADE to structured identity (face, body, hair, wardrobe, voice) for a full cast; every scene/shot references `characterId` |
| 5 Character state | poorly built | name-keyed `Record<string,string>`, regex-inferred (`shared/continuity.ts:29-350`); `ContinuityState` table unused | CHANGE to typed, ID-keyed, versioned state at story time T with event transitions, persisted |
| 6 World Bible | shallow | `Location` name/kind/description; one per film; weather/time free text | UPGRADE Location + per-time LocationState |
| 7 Prop Bible | shallow | `WorldObject` written by web only, never read by the worker | BUILD Prop entity with owner/state/possession events into shots' `requiredProps` |
| 8 Story graph | not built | linear index; `dependsOn = [i-1]`; `StoryEvent`, `Relationship` unused | BUILD typed nodes/edges with reference and cycle validation |
| 9 Scene graph | poorly built | free-text dialogue/camera/mood; `DialogueLine` never written | CHANGE to purpose, emotional arc, beats, structured dialogue tied to `characterId` |
| 10 Shot Architect | not built | shot count by formula (`planning.ts:13`); `cameraPlan` never written | BUILD the full DOS-10.2 shot record, persisted structurally |
| 11 Cinematography | not built | size cycled `i % 4`; GPU ignores `camera` | BUILD rule-based coverage grammar with LLM override |
| 12 Prompt Compiler | shallow | string concatenation (`director.service.ts:188`, `video.processor.ts:176`) | BUILD a pure, deterministic compiler for 6 prompt kinds |
| 13 Model compilers | not built | adapters pass prompts verbatim (fal truncates at 2000) | BUILD per-model compilers keyed by registry id |
| 14 Canonical media request | shallow | `ShotRequest` is the closest analogue | CHANGE: `CanonicalMediaRequest` in shared; persisted per shot for provenance |
| 15 Image generation | shallow | one gpt-image-1 still per shot, `n:1` | UPGRADE to N candidates as image jobs, each a `MediaVersion` |
| 16 Visual Reviewer | not built | `Shot.qcScore` never set; QC statuses unused | BUILD multimodal reviewer → structured scores → PASS/REVISE loop (bounded) |
| 17 Video review | shallow | timing gate + black/freeze validator; avsync CLI-only | BUILD frame extraction + visual/continuity/motion evaluators → PASS/REGENERATE via repair planner |
| 18 Audio architecture | built (W16) | `movie/src/sound/plan.ts`, audio processor | Done: per-scene ambience beds and shot-anchored effects generated and placed beside dialogue and score (docs/61) |
| 19 Voice identity | built (W7b, W15) | `voice/film.ts` | Done: each character speaks in the chosen or a fixed built-in voice with fixed traits (docs/51, docs/60) |
| 20 Audio continuity | built (W16) | `ffmpeg/commands.ts`, `sync/mix.ts` | Done: dialogue-anchored mix, score and ambience ducked, stem levels and loudness/true peak from the production profile, ambience beds as room tone (docs/61) |
| 21 Editor Agent | built (W13) | `packages/movie/src/edit`, `apps/worker/src/editor`, Editor panel | Done: typed `EditOperation`s, whole-cut review, owner-approved apply (docs/58) |
| 22 Compilable movie | shallow | pipeline real; timeline IR CLI-only | BUILD persisted stage compilers Source→Film→Scene→Shot→Media→Timeline→Master |
| 23 Film IR | not built | no IR; `FilmDraft` thin | BUILD `packages/movie` IR schemas (zod + JSON Schema) |
| 24 Validator | shallow | tool schema + lenient `coerceDraft` defaults (`llm.ts:203-235`) | BUILD schema→canon→continuity→production→budget validators; CHANGE coerce to fail-and-revise |
| 25 Never "just text" | shallow | forced tool for the plan; JSON-scrape and stub fallback; translate/social free text | UPGRADE every production LLM op to typed IR; remove stub in production |
| 26–27 Agents | not built | one monolithic prompt | BUILD 6 typed roles (Director, Story, Visual, Audio, Continuity, Editor/QC) behind the router; no vendor multi-agent framework |
| 28 Director controls flow | shallow | brief→plan→shots→media→render only | UPGRADE `DirectorService` into the staged orchestrator |
| 29 Interrupt anywhere | not built | re-plan deletes scenes; no edit API | BUILD edit command API → affected set → targeted regeneration |
| 30 Dependency graph | shallow | `dependsOn [i-1]`; cacheKey only reuse primitive | BUILD entity→scene→shot→media edges + invalidation |
| 31 Version everything | shallow | immutable timelines/media_versions exist, but processors overwrite shots/films in place | UPGRADE: append-only versions for canon, scenes, shots, films |
| 32 Continuity Engine | shallow | presence heuristic + one regex (`continuity.ts:153-190`) | UPGRADE to typed rules for 5 categories + vision identity + 180°/eyeline (audio category built in W14, docs/59) |
| 33 Temporal continuity | not built | `timeOfDay` string only | BUILD story-time model |
| 34 Visual memory | shallow | only character refs + LoRA reach generation | UPGRADE typed reference assets for both image and video |
| 35 Reference pack | not built | refs capped at 4 character frames | BUILD per-scene `ReferencePack` assembler |
| 36 Shot-to-shot memory | not built | shots run in parallel, no last-frame conditioning | BUILD end-state records + optional sequential edges |
| 37 Scene lock | not built | no APPROVED/LOCKED status | BUILD DB-enforced lock (0028 trigger pattern) |
| 38 Film lock | shallow | timeline `frozen` status, no workflow | BUILD film-lock transaction; master renders from locked versions |
| 39 Quality gates | not built | QC omitted; scenes READY unconditionally | BUILD 6-pass gate chain; failure → revise, not export |
| 40 Technical QC | shallow | strong primitives not in the path; DOS-40.2 **built** | UPGRADE: run `analyzeSync` + probes as a blocking stage |
| 41 Cost optimization | shallow | estimate, budget pause, cache; auto mode skips storyboard approval | BUILD approval gate: no video without an approved storyboard |
| 42–43 Two/three-pass | not built | single pass | BUILD STORY→PREVIS→FINAL pass state; three-pass default |
| 44 UI | shallow | StoryboardStudio + RunPanel | BUILD 3-column workspace + timeline strip |
| 45–47 Chat, NL edit, "why" | not built | — | BUILD on W8 edit API |
| 48 Decision log | shallow | media generation ledgers only | BUILD `ai_decisions` written by the router |
| 49 Prompt versioning | not built | prompts hard-coded | BUILD prompt registry |
| 50 Evaluation | not built | unit tests; sync tolerances uncalibrated | BUILD benchmark harness in CI |
| 51 Model router | shallow | media registry real; LLM hard-wired | BUILD `IntelligenceProvider` router; KEEP media registry |
| 52 Not one vendor | poorly built | Anthropic SDK called directly in 3 files | CHANGE all call sites to the router |
| 53–54 DirectorOS / persistent world | not built | director inside the worker | BUILD `packages/movie` + DirectorOS service boundary |
| 55 World State Engine | shallow | folded string maps | BUILD event-sourced typed world state per shot |
| 56–58 Knowledge, audience, foreshadowing | not built | — | BUILD knowledge sets, audience track, plant→payoff graph + validators |
| 59 Movie Compiler | shallow | lower half real (queue, GPU, media engine) | BUILD upper graph stages; capability-based GPU tiers |

## 5. Part 2 — Engineering contract and intelligence layer (§60–107)

| § | Status | Evidence | Action |
|---|---|---|---|
| 60, 63 Three levels; contract everywhere | not built (process → artifact) | index had no level column | BUILD level column (L1/L2/L3) with CI: an L3 row must link a test |
| 61 12-field contract | not built | closest: docs/38 §AT.6 + `runtime/contract.ts` | BUILD `docs/directoros/contracts/*.md` + CI field check |
| 62 Character Continuity contract | poorly built | string state; no `ContinuityResult`/severity | UPGRADE + Maya red→blue acceptance test |
| 64 Director contract | shallow | one call; Director also builds prompts | CHANGE: Director outputs validated Film IR only |
| 65 Story Engine proof | not built | 1 act, no threads/arcs | BUILD StoryGraph + setup→payoff validator |
| 66 Scene Architect proof | shallow | no purpose/beats; duration = requested | UPGRADE; duration from measured media |
| 67 Shot Architect proof | poorly built | `AVG_SHOT_SEC=5` formula; clock not tied to planning | BUILD ShotIR; assert Σshots = scene on the clock |
| 68 Prompt Compiler protection | poorly built | the named anti-pattern (concatenation) | BUILD `compileGeneration(state, shot, refs, modelCaps)` + wardrobe test |
| 69 Image Engine contract | shallow | no checksum/seed/revision; `data:` URL fallback | UPGRADE to `ImageGenerationResult` + artifact row |
| 70 Never self-certify | poorly built | READY from adapter claim (`video.processor.ts:325-336`); GPU reports requested, not actual, size | CHANGE: HEAD + ffprobe + sha256 + QC before READY |
| 71 Audio regression | **built** | `planNarrationFit`; `media-regression` CI | KEEP; make it a required check |
| 72 Zero hidden TODOs | not built (gate) | no TODO markers, but stub fallbacks; no lint rule | BUILD CI stub-pattern gate |
| 73 Reality Gate | not built | `web/lib/system.ts:83-97` hand-written "Implemented" | CHANGE: 7-state status from CI results |
| 74 No Fake Completion | n/a → artifact | — | BUILD rule into CONTRACT header + CLAUDE.md |
| 75 No Silent Degradation | poorly built | 23 paths, §6 | CHANGE each to FAILED / UNAVAILABLE / visible degraded flag |
| 76 Real provider tests | not built | all mocked; gateway-e2e uses placeholder GPU | BUILD gated nightly real-provider workflow verifying artifact bytes |
| 77 Capability Registry | shallow | pieces without `status`/`realExecution`; pod over-claims `supportsRefVideo`/`supportsLora` | BUILD runtime-computed registry; fix the pod's claims |
| 78 UI obeys registry | not built | web hard-codes `MODELS`; offers 4K/1080p the backend can't deliver | BUILD `/capabilities` read by the UI |
| 79–80, 82 Claude protocol & phases | n/a → artifact | — | BUILD `execution-protocol.md` reconciled with docs/38 §AX.2 |
| 81 3-minute acceptance test | not built | no end-to-end test | BUILD `e2e/film-acceptance` (16 checks of §81.2), nightly, real providers |
| 83–86, 93, 99–100 Master call / Production Compiler | shallow | one planning call exists, returns a thin draft | UPGRADE to a full Film Production Package + deterministic `ProductionCompiler` |
| 87 Film IR contract | not built | no IR types, no zod, coerced output | BUILD zod IR → JSON Schema for the tool; strict validation |
| 88 Provider-neutral layer | not built | Anthropic direct; `ANTHROPIC_MODEL` only | BUILD `IntelligenceProvider` + task→provider router |
| 89–90, 97, 104 Brain vs hands | **built** | LLM never touches GPU/FFmpeg | KEEP; move image-prompt content into IR |
| 91 Change propagation | shallow | cacheKey excludes continuity state → **stale clips** after a wardrobe edit | BUILD invalidation; key on the compiled generation spec |
| 92 Film State in DB | shallow | canon tables exist, unversioned, mostly unused | UPGRADE + context compiler for targeted calls |
| 94 Proposed → validated → executed | not built | — | BUILD validator between IR and execution |
| 95, 105 ImageProvider | shallow | one implementation (OpenAI) hard-wired | UPGRADE to registry-routed providers |
| 96 Revised architecture | not built | composite | BUILD (W2+W4+W5) |
| 98 Batch reasoning | shallow | translation per scene × language, again for dubbing | CHANGE to one batched call per language, reused |
| 101–103 ComfyUI execution graph | not built | `ComfyUIRuntime` "arrives in Phase 6" | BUILD per docs/38 §AT (gated, see §3) |
| 106 OpenAI image optional | poorly built (inverted) | only image path, auto-on by key | CHANGE to registry entry, off by default |
| 107 Intelligence vs generation | n/a | — | KEEP as principle |

## 6. Silent degradation and fake completion register

Each must become a failure, an explicit `UNAVAILABLE`, or a degraded flag that
is stored and shown to the user (Part 2 §73–75; docs/38 §AV.1 decisions 14, 18,
21). Ordered by harm.

| # | Where | What happens today |
|---|---|---|
| 1 | `apps/worker/src/director/llm.ts:240,265-272` | no key or any LLM error → hard-coded "Adisa / The Kingdom" stub film, produced and billed |
| 2 | `apps/gpu-worker/app/pipeline.py:83-85,206,334` | no CUDA → automatic placeholder mode; grey clip with the prompt as text returned as success; no `real` flag; `WanAdapter` never checks |
| 3 | `processors/render.processor.ts:82-86` | missing or failed shot clips filtered out → film assembled with gaps |
| 4 | `ffmpeg/render-engine.ts:217-221` | audio mix failure → film ships with no audio |
| 5 | `processors/video.processor.ts:323-336` | READY from the provider's claim; QC omitted; timing gate record-only |
| 6 | `pipeline.py:216-219`, `server.py:366,381` | width/height/frames silently clamped (832×480, 25 frames = 1.56 s); requested size reported |
| 7 | `video.processor.ts:170`, `director.service.ts:48` | project resolution ignored; always 1280×720 requested |
| 8 | `apps/web` create studios, `lib/projects.ts:11-40` | aspect ratio and production kind never persisted; 9:16 shorts produced at 16:9 |
| 9 | `render.processor.ts:23,45-47` | 4K upscale skipped or failed silently while the UI sells 4K |
| 10 | `director/translate.ts:282,303-309` | translation failure stores English as `fr`/`de` subtitles and dub |
| 11 | `director/moderation.ts:231-256` | fails open on missing key, HTTP error or exception |
| 12 | `llm.ts:203-235` | invalid model output masked by invented defaults ("Beat N.", "The Location") |
| 13 | `director.service.ts:100-115` | blank continuity filled by regex heuristic, unflagged |
| 14 | `video.processor.ts:214,297-304` | seed-image failure or missing OpenAI/S3 → silent text-to-video |
| 15 | `pipeline.py:237` | reference frames ignored when `WAN_I2V_MODEL_ID` unset; `/capabilities` still claims ref video and LoRA |
| 16 | `pipeline.py:251` | LoRA load failure printed, job continues without identity |
| 17 | `pipeline.py:369-373` | no S3 credentials → upload skipped, key returned (phantom artifact) |
| 18 | `render.processor.ts:140-144` | no S3 → READY film row with a non-existent `mp4Key` |
| 19 | `processors/audio.processor.ts` | FIXED (W1, W16): a missing provider or failed score/sound is recorded as TRACK_MISSING; ambience and effects are generated |
| 20 | `localize.processor.ts:97`, `openai.ts:113` | TTS input truncated at 4000 characters |
| 21 | `processors/lora.processor.ts:37` | trainer not configured → skip; identity silently weaker |
| 22 | `packages/model-adapters/src/policy.ts:25-27` | disallowed model silently falls back to `wan-2.1` |
| 23 | `apps/web/lib/system.ts:83-97` | hand-written "Implemented" badges |

Also: `runtime/ledger.ts:72` and avsync persistence degrade with one log line
until 0027–0030 are applied (documented, acceptable until W0 step 2).

**W1 status (2026-10-08): all 23 are fixed.** Items 1–22 now fail the job or
record a degradation the owner sees; item 23 is replaced by Reality Gate
maturity and the live capability registry. Before/after per item:
[docs/44 §1](../44-truth-layer.md).

## 7. Parts 3–4 — Voice Clone Talker and Voice Engine (§108–176)

**Bottom line: there is no Voice Engine.** Two unconnected hosted-provider
paths exist: film narration = OpenAI `tts-1` "onyx" for every film
(`audio.processor.ts:36-55`); Voice Lab = fal MiniMax cloning and speech, fal
SadTalker/Kling avatars (`voice-lab.processor.ts`). Film narration cannot use a
user's cloned voice.

| § | Status | Evidence | Action |
|---|---|---|---|
| 108, 120–123, 127, 130–135, 137–138, 140, 142 | n/a | concepts, model comparison, decision | inform W7; licence and benchmark items become artifacts |
| 109, 112–113, 128, 143, 156 Voice Engine, model-independent | not built | processors call OpenAI/fal directly | BUILD the Voice Engine; CHANGE both processors to call it |
| 110, 115, 118 Enroll once, private identity | shallow | "enrollment" stores MiniMax `provider_voice_id`; every call goes to fal | CHANGE: profile and artifacts owned by CineForge |
| 111, 117 Avatar, presenter, dubbing, conversation | built / shallow (W15) | `worker/src/voice/reading.ts`, Voice Studio | Done: narrator and presenter readings on the Voice Engine, avatar from a finished reading, scripted multi-voice conversations (docs/60); open: lip-synced dubbing, LLM-driven live conversation |
| 116, 176 Script controls | built (W15) | `voice-contracts/src/reading.ts`, `VoiceLab.tsx` | Done: modes and delivery controls (emotion, energy, speed, pitch) in API, worker and UI (docs/60); 176's single end-state screen still to unify |
| 119 Voice Studio | shallow | `VoiceLab.tsx` | UPGRADE: enrollment wizard, quality report, consent, modes, controls |
| 114, 129, 136, 139, 141 Licensing + benchmark | built (W14) | `voice-contracts/src/licences.ts`, `worker/src/bench/voice.ts` | Done: licence registry enforced by the router, `voice:bench` (WER, RTF, consistency, licensing); similarity, naturalness, VRAM not measured (docs/59) |
| 124–125 Voice worker | not built | GPU worker has video endpoints only | BUILD voice GPU image reusing gateway, token, `/capabilities` |
| 126, 145–146, 159, 162, 173 API | not built | web inserts rows directly | BUILD the frozen six endpoints of §173 |
| 147, 158 `VoiceEngine` interface | not built | one-method `TtsAdapter` (`openai.ts:27`) | BUILD the interface |
| 148, 161 Profiles + engine artifacts | poorly built | `voices.provider`, `provider_voice_id` model-specific columns | CHANGE to `voice_profiles` + `voice_engine_artifacts` |
| 160 Quality analysis | not built | primitives in `ffmpeg/analysis.ts` | BUILD analyzer (duration, rate, clipping, SNR, speech ratio) that rejects poor recordings |
| 149, 165 Segmentation | built (W15) | `worker/src/voice/ledger.ts` | Done: every narration and line segmented, mastered and ledgered in `audio_generations` on the Master Clock (docs/60) |
| 150, 166 Mastering outside the model | shallow | mix-level only; AAC; no 48 kHz WAV, de-click, denoise | UPGRADE: per-clip mastering stage in the media engine |
| 151, 167–168 Router, config, capabilities | not built | env vars pick models | BUILD config router + capability matching |
| 152–153, 171–172 Workers, cloud/self-hosted | not built | lifecycle and gateway reusable | BUILD `voice-gpu-qwen` on the same lifecycle/gateway; compose services |
| 154–155 Cache, batch | built / shallow (W14) | `voice-contracts/src/cache.ts`, `worker/src/voice/cache.ts`, migration 0049 | Done: content-hash speech cache, hits never billed (docs/59); batch endpoint exists, GPU-side batching waits on Phase 1 |
| 163–164 Jobs, states | shallow | PENDING/CLONING/SPEAKING/READY/FAILED | CHANGE to the spec's 8 states |
| 169 Storage layout | shallow | `voiceovers/{user}/{id}.mp3` | CHANGE to `voices/<id>/…`, `audio/<job>/raw|processed|final.wav` |
| 170 Security | built (W7, W15) | migrations 0036, 0050, 0051 | Done: owner or active per-use licence, consent required; enforced by a database trigger and in the worker (docs/60) |
| 174 "What not to do" | built (W15) | every speech path through the Voice Engine | Done: no direct provider calls, no model columns, no model names in the UI (docs/60) |
| 175 Development sequence | n/a | — | becomes W7's order |

---

## 8. Implementation map — workstreams

Each workstream lists what is BUILT new, UPGRADED, CHANGED and KEPT, where it
lives, and the proof that closes it (Part 2: a feature is done only at Level 3,
with a test that exercises real behaviour).

### W0 — Operational foundation (prerequisite; owner actions)

Not DirectorOS, but nothing above it can be proven on a system that is not
running. From docs/38 §AY and docs/43:

1. Deploy the worker on DeployPro (docs/43); hosted Redis with `noeviction`.
2. Verify the GPU image chain and deploy the pinned digest to RunPod.
3. Finish Phase 1 operationally: keys, deployment registered and approved,
   enforcement, S3 key rotation (docs/39 §10). **Owner decision.**
4. Apply migrations 0027–0030 (docs/41). **Owner decision.**
5. Decide `WAN_MAX_FRAMES` (25 → 81) so a 5 s shot is 5 s.
6. Make the clock conform the default render path (remove the `fps=16`
   default; `RENDER_NORMALIZE` becomes the only path).

### W1 — Truth layer (Reality Gate, No Fake Completion, No Silent Degradation)

**Done 2026-10-08** (docs/44; contract in contracts/truth-layer.md). Remaining
to reach `VALIDATED`: the end-to-end integration test (W10) and migration 0031
on the live database (owner).

Start first: it makes every later claim checkable. Code-only; no production
change until merged.

- BUILD `packages/shared/src/capabilities.ts`: `{capability, provider, status
  (7-state), realExecution, supports}` computed at runtime from env + probes;
  the GPU `/capabilities` reports `real: false` in placeholder mode.
- CHANGE every path in §6 to fail, report `UNAVAILABLE`, or set a stored,
  user-visible `degraded` flag. Placeholder mode only by explicit
  `GPU_PLACEHOLDER=1`, never automatic in production.
- CHANGE `apps/web/lib/system.ts` badges and `MODELS` to read the registry;
  the create UI offers only capabilities that are real (4K, 1080p, 9:16).
- BUILD `docs/directoros/contracts/` (12 fields per subsystem) and
  `execution-protocol.md`; CI checks fields and that named tests exist.
- BUILD a CI stub-pattern gate (Part 2 §72).
- Proof: tests that each §6 path now fails or flags; a CI job that fails when
  a capability claims `realExecution` without a passing real test.

### W2 — Intelligence layer (Film IR, master call, router, validator)

**Done 2026-10-08** (docs/45; contracts film-ir.md, intelligence-layer.md). Not
done in W2 and carried forward: the six separate agent roles (Part 1 §26–27 —
the master call + surgical revision of Part 2 §93 covers planning; role calls
come with W5 review and W8 editing), batched translation (W11), prompt scores
(W10).

- BUILD `packages/movie/ir`: Film / Act / Sequence / Scene / Shot / Character
  / Location / Prop / Dialogue / AudioPlan / Camera / Continuity schemas in zod,
  exported to JSON Schema for tool definitions.
- BUILD `packages/movie/intelligence`: `IntelligenceProvider` (Claude, OpenAI,
  local) + task→provider router + `ai_decisions` log (agent, prompt version,
  input hash, schema, cost, rationale) + prompt registry
  (`prompts/<domain>/<name>@<version>`).
- UPGRADE `draftFilm` into the **master call** returning a Film Production
  Package (bible, cast, world, story graph, scenes, shot plans, audio plans);
  batched per scene where the context is too large (Part 2 §98).
- BUILD the validator chain (schema → canon → continuity → production →
  budget); CHANGE `coerceDraft` defaults into fail-and-revise (one surgical
  revision call, then fail).
- BUILD the six roles of Part 1 §27 as typed functions over IR, called by the
  router — surgical calls only where reasoning is required (Part 2 §97).
- CHANGE `director.service.ts` into a deterministic `ProductionCompiler`
  (IR → rows → jobs) with no prompt strings and no `deleteMany` re-plan.
- Proof: golden briefs produce IR that validates; a corrupted IR is rejected;
  provider swap test (same IR contract from two providers).

### W3 — Canon and world state

**Done 2026-10-08** (docs/46; contracts world-state.md, continuity-engine.md).
Built in the Film IR rather than as parallel tables: canon is the versioned
package in `screenplays.raw` (content-hash `canonVersion`, append-only
`canon_revisions`), and world state is derived from it, never stored twice.
Follow-ups done the same day: relationships and dead/alive state, the
wardrobe reference pack (0034), the Visual Reviewer (first W5 slice, record
mode), the revision flow on a real database in CI, and migrations 0027–0034
applied live. Carried forward: the live GPU run of the revision flow
(`canon:live-check`, after the worker deploy), goals and plot state (W5 story
review), reviewer calibration before enforce (W5/W10), the creator-facing canon
editor with charged regeneration and locks (W8), merging the web storyboard's
text continuity copy (W8), cinematography continuity — axis, eyeline, screen
direction (W4), audio continuity (built in W14: ambience, music, room tone, voice — docs/59).

- UPGRADE existing tables rather than adding parallel ones: `Character`
  (structured identity, `voiceId`, cast of N), `Location` + `LocationState`,
  `WorldObject` → Prop with owner/state, `Wardrobe` (validFrom/To),
  `Relationship`, `StoryEvent`, `ContinuityState`, `DialogueLine`.
- BUILD the story graph (nodes, typed edges, reference and cycle validation),
  story time, character knowledge, audience knowledge, foreshadowing
  (plant → payoff) with validators.
- CHANGE `shared/continuity.ts` to an ID-keyed, typed, event-sourced World
  State Engine materialized per shot; one client-safe module instead of the
  duplicated web copy.
- Version canon (append-only revisions).
- Proof: Maya red→blue test (Part 2 §62); knowledge-violation and unpaid-setup
  fixtures fail validation.

### WA — Ads Studio (product line)

Owner direction 2026-10-08: a website-to-advertisement studio that can be sold
on its own domain (pay as you go from $10 per ad, or monthly). A1 done
2026-10-09: the `/ads` page from the owner's design, hand-off of its brief to
the real advert pipeline, own-domain routing. A2 website intelligence (rides
on W2/W5), A3 brand assets into production (W4/W6), A4 standalone billing
(after cost measurement), A5 scene-level editing of the live project (W3/W8).
Details: docs/47.

### W4 — Shot design and compilation

**Done 2026-10-09** (docs/48; contract cinematography-and-prompts.md).
Cinematography Engine (180° and eyeline enforced, grammar advised),
Canonical Media Request, compilers for Wan / Hunyuan / OpenAI image / default,
compiled prompts in every Film IR shot and seed still, cache key over the
compiled prompt. Decided differently: no separate Shot Architect model call —
the master call plans coverage under the engine's rules (one-pass doctrine,
Part 2 §93). Carried forward: Flux/SDXL/ComfyUI compilers (W6), TTS/music/SFX
compilers (W7), scene timing from measured media (W5 timeline).

- BUILD Shot Architect (LLM-planned ShotIR per scene) and Cinematography
  Engine (coverage grammar, 180°, eyeline, lens rules, LLM override).
- BUILD the Prompt Compiler: pure
  `compileGeneration(worldState, shotIR, referencePack, modelCapabilities)` →
  `CanonicalMediaRequest` for image, video, voice, music, SFX, ambience.
- BUILD model-specific compilers keyed by registry id (Wan, Flux/SDXL,
  ComfyUI workflow slots, TTS, music, SFX).
- CHANGE the cache key to hash the compiled request (fixes stale reuse,
  Part 2 §91); persist the request per shot.
- Tie shot timing to the Master Clock: Σshots = scene; scene duration from
  measured media.
- Proof: compiler unit tests (wardrobe constraint, identity tokens, model
  capability limits); clock assertion tests.

### W5 — Review and quality gates

**Done 2026-10-09** (docs/49; contract quality-gates.md; migration 0035,
applied live). Every clip measured before READY (unusable clips never pass),
bounded regenerate-with-new-seed on a blocking result, Final Quality Gate on
the master before delivery, the gate chain recorded per project. Modes:
`QUALITY_GATES=record` (default) / `enforce`; `VISUAL_REVIEW` as before.
Moved to W8, built in W13 (docs/58): the Editor Agent. The editorial gate in
the gate chain is still recorded as skipped: the Editor proposes, the owner
decides. Carried forward: hands/objects/motion
judgement, codec and dropped-frame checks, calibration before enforce (W10).

- CHANGE "never self-certify": HEAD + ffprobe + sha256 + technical QC before
  READY; timing policy `enforce` once calibrated.
- UPGRADE `analyzeSync` and `ffmpeg/analysis.ts` into a blocking technical QC
  stage in the render path (no longer CLI-only).
- BUILD the Visual Reviewer (image) and video evaluators (identity, hands,
  motion, continuity) → structured scores → PASS / REVISE / REGENERATE, bounded
  retries, via `repair-planner`.
- BUILT in W13: the Editor Agent (typed `EditOperation`s, docs/58).
- BUILD the 6-pass gate chain (story → visual → continuity → audio → technical
  → editorial) and fold it into docs/38 Phases 9–10 (repair, Final Quality
  Gate). `COMPLETE` only after the gate.
- Proof: seeded bad clips (black, frozen, wrong face, truncated) are caught;
  §AW.11 regression tests remain required.

### W6 — Image engine and visual memory

**Partly done 2026-10-09** (docs/50; contract images-and-references.md).
Built: the ImageProvider registry (`IMAGE_PROVIDERS`, seed frames and
wardrobe stills through it, Capability Registry follows it), N seed
candidates picked by the Visual Reviewer and kept as media versions, the
Reference Pack assembler, shot-to-shot end-frame memory with optional
sequential edges (`SEQUENTIAL_SHOTS=1`). **Blocked by the owner's rule:** the
ComfyUI runtime, Workflow Registry and approved image models wait on Phase 1
being operationally complete (the registry lists `comfyui` as gated);
OpenAI stays the default image provider until then. Carried forward:
location/prop reference generation, video candidates (cost), the
real-provider ComfyUI test (W10).

- UPGRADE `ImageModelAdapter` to an `ImageProvider` registry routed by the
  docs/38 router; OpenAI image becomes optional, off by default (Part 2 §106).
- BUILD ComfyUI runtime, Workflow Registry and approved image models **per
  docs/38 Phases 6–8, gated on Phase 1 complete** (W0).
- BUILD N candidates per shot, each a `MediaVersion`; Visual Reviewer picks.
- BUILD Reference Pack assembler and shot-to-shot end-state memory with
  optional sequential edges in the flow.
- Proof: real-provider ComfyUI test (W10); candidate selection recorded.

### W7 — Voice Engine (Parts 3–4)

**W7a done 2026-10-09** (docs/51; contract voice-engine.md; migration 0036
applied live). Built: `packages/voice-contracts` (VoiceEngine interface,
eight job states, frozen `/v1` schemas, segmentation, recording judge,
config router), recording analysis and mastering in the worker, fal MiniMax
and OpenAI engines behind the interface, `voice_jobs` with the eight states,
`voice_engine_artifacts`, consent on every voice, and the six `/v1` routes
in `apps/api` (owner-only, 404 to others). Placement differs from the plan:
the API lives in `apps/api` and the worker side in `apps/worker` until the
self-hosted engines need their own apps. **Blocked by the owner's rule:**
Qwen3-TTS / CosyVoice / GPT-SoVITS adapters, the voice GPU worker, licence
registry and benchmark harness wait on Phase 1 (the router lists them as
gated). **W7b done 2026-10-09:** each scene's voice-over and dialogue are
spoken on the Voice Engine — every character in the voice the owner chose
(carried from the Casting Room by name) or a stable built-in voice, each line
mastered and timed (`dialogue_lines.audio_key`, `start_ms`), a chosen voice
that cannot be used reported as `VOICE_SUBSTITUTED`; the plan validator
checks that speech fits each scene (`SPEECH_TOO_LONG`); the render joins
mixed-format voice tracks. **W7c done:** dubbing runs on the engine — every
line translated and spoken by its own character's voice in the new language.
Carried forward: the Voice Lab reader and avatars still call fal directly; content-hash cache,
deleting recordings and provider clones with the voice, per-use licence for
community voices.

Placement: `packages/voice-contracts` (types, `VoiceEngine`, capabilities,
job states; the only thing CineForge imports), `apps/voice-api`
(`/v1/voices`, `/v1/speech`, `/v1/speech/batch`, `/v1/voices/:id`,
`/v1/jobs/:id`, `DELETE /v1/voices/:id`; router config; licence registry;
cache; owns `voice_*` tables), `apps/voice-worker` (enrollment analysis,
mastering), `apps/voice-gpu-worker` (Python; one image per engine via
`MODEL_NAME`, Qwen3-TTS first; reuses the gpu-worker gateway, token and
`/capabilities`). Extract shared FFmpeg analysis into `packages/audio`.

Order (Part 4 §175, adapted): contracts → API + auth → `voice_profiles` /
`voice_engine_artifacts` + consent → object storage layout → BullMQ jobs with
the 8 states → Qwen3-TTS adapter → GPU worker → per-clip mastering (de-click,
denoise, trim, per-speaker R128, 48 kHz WAV) → CineForge integration
(narration, dialogue by `Character.voiceId`, dubbing via batch) → fal MiniMax
as a legacy adapter → CosyVoice 3 → GPT-SoVITS → router + benchmark harness.

Gate before production: licence registry entry for the exact checkpoint
(Part 4 §130.2, §141.1) and owner approval. Proof: benchmark report with the
user's own voice; ownership test (another user's `voice_id` refused);
consent-required test; cache hit test.

### W8 — Versioning, dependencies, locks and passes

**W8a done 2026-10-09** (docs/52; contract versions-and-locks.md; migrations
0037–0038 applied live). Built: every accepted clip, scene voice track and
master is an append-only `media_versions` row (masters under `film/v<N>/`);
scene and film locks enforced by database triggers (only finished scenes and
films lock; a locked scene's shots, lines and audio are frozen); canon edits
touching a locked scene are refused; a Locks and versions panel on the
production page. **W8b done 2026-10-09** (docs/53; contract
passes-and-edits.md; migrations 0039–0041 applied live): STORY → PREVIS →
FINAL passes with database-enforced approvals (opt-in at creation), the edit
command (edit_requests → canon revision → only affected shots regenerate),
dependency edges per shot, scene snapshots before any re-plan or canon edit,
play/restore earlier takes. Carried forward: three passes as the default
(owner decision), rough voice/timing in previs. The Editor Agent is W13.

- BUILD entity → scene → shot → media dependency edges at compile time;
  invalidation re-queues only affected shots.
- CHANGE in-place overwrites (`Shot.videoKey`, `films` upsert, re-plan
  delete) to append-only versions on `media_versions`.
- BUILD scene and film lock (DB-enforced, 0028 trigger pattern); the master
  renders from locked versions on an approved timeline.
- BUILD the pass state machine STORY → PREVIS → FINAL (three-pass default);
  no video job for a scene without an approved storyboard; merge with the
  docs/38 §AU.18 production state machine (one machine, one column).
- BUILD the edit command API (entity change → affected set → targeted
  regeneration).
- Proof: change one wardrobe → only dependent shots regenerate; locked scene
  cannot be modified.

### W9 — Director workspace UI

**Done 2026-10-09** (docs/54; contract director-workspace.md; migration 0042
applied live): the three-column workspace (bible · scenes & shots · Director)
with a timeline strip (production timeline, or the plan) and a decision log
whose rows carry the why (`ai_decisions.summary`); plain-language
instructions read as one canon change and filed as edit requests; the Voice
Lab became the Voice Studio (consent, quality report, no model names);
Storyboard Studio links into the workspace; the chat is offered only when a
planning model is configured. Carried forward: tone/cinematography/timing
instructions applied (Editor Agent), editable bible in the workspace.

- BUILD the 3-column workspace (bible/assets · scenes/shots · director chat),
  timeline strip bound to `production_timelines`, decision log panel with
  "why" from `ai_decisions`, NL editing → edit API.
- UPGRADE StoryboardStudio, VoiceLab → Voice Studio.
- The UI shows only registry-real capabilities (W1).

### W10 — Evaluation and acceptance

**Done 2026-10-09** (docs/55; contract evaluation-and-acceptance.md; migration
0043 applied live): real-provider probes that decode and measure every
artifact (planning, image, Wan/Hunyuan/fal video, TTS, music; ComfyUI and
self-hosted voices reported GATED); `@cineforge/bench` — 100 scenes, 50
characters, 30 locations, 75 labelled cases (21 controls), score 1.0 as the CI
baseline, prompt lock that fails an unversioned prompt edit, live planning
benchmark that scores a prompt version; sync instrument calibration (all 60
tolerances resolved; MP3 durations read up to 68 ms long); `film:accept` with
the sixteen §81.2 checks proven on real masters. The Evaluation workflow runs
them manually (nightly probes opt-in). Not yet run live — owner credentials.
Expected first acceptance verdict: FAIL on audio (no SFX generator).

- BUILD gated (secret-protected, nightly or manual) real-provider tests:
  Claude/OpenAI plan, Wan on RunPod, ComfyUI image, TTS; verify artifact bytes.
- BUILD the benchmark harness (story, continuity, dialogue, cinematography,
  voice) run on prompt or model changes; calibrate sync tolerances.
- BUILD `e2e/film-acceptance`: the 3-minute film with the 16 checks of
  Part 2 §81.2.

### W11 — Platform hygiene found during the trace

**Done 2026-10-09** (docs/56; contract platform.md; migrations 0044–0045
applied live): production types are project data (format, medium, animation
style, episodes) that pace the plan, shape the plan request (`director.master`
v5) and style every prompt; series → season → episodes persisted; the public
API kept and made deployable on Supabase auth (roles from the database, Voice
API at `/v1/voices`, compiled image booted in CI; Render entry left for the
owner); `packages/realtime`, the Socket.IO gateway, `LiveRun`,
`publish-queue` and render kinds `preview`/`scene` removed; every paid call
metered (LLM, TTS, image, music, moderation, hosted video) with owner-set
`METER_RATES`; Stripe grants atomic and idempotent (`apply_stripe_grant`,
edge function redeploy pending); `/livez` `/readyz` `/metrics` on worker and
API; provider hosts from env; §2.5 doc drift fixed.

- Persist production kind and aspect ratio; series/trailer/shorts/advert
  become real production types, not prompt strings.
- Decide `apps/api`: deploy it (fix the HS256 guard to Supabase JWT, add the
  routes the web calls) or remove it and the dead `LiveRun` path.
- `packages/realtime` has no consumer; `publish-queue` has no producer; render
  kinds `preview`/`scene` are no-ops — wire or remove.
- Metering covers video GPU-ms only; add LLM, TTS, image, music; make credit
  grants atomic (`stripe-webhook/index.ts:29-34`).
- Fix doc drift listed in §2.5; update docs/11 to point at the Voice Engine.
- §AF portability: `/readyz`, `/metrics`, provider hosts from env.

### W12 — Animation Studio (Part 5, DOS-177–186)

**Done (docs/57, 2026-10-09).** Character Cards, the Show Bible with episode
productions that read every earlier episode, the still-motion engine for
storybook and motion comic, the Animation Studio workspace and Create menu,
and animated character design in the Film IR and every prompt — on the
existing engines, migrations 0046–0047 live.

- BUILT reusable Character Cards (age, height, hair, eyes, clothing,
  personality, style, animated design, Voice Studio voice) with "Use
  character": a cast card is planned with its exact identity (CAST section,
  CAST_MISSING / CAST_RENAMED / CAST_UNUSED, identity restored after
  planning) and its production copy links back (§179.2, §183).
- BUILT the Show Bible and episode productions: SHOW BIBLE, EPISODE and
  PREVIOUSLY sections (audience knowledge, deaths, relationships), returning
  characters with their identities, the dead only in flashbacks
  (DECEASED_APPEARS) (§184).
- BUILT the still-motion engine: each storybook page or comic panel is the
  shot's drawn still, moved by the camera in FFmpeg — no video model, no GPU;
  measured timing and execution reports; same quality gates (§181.4–6).
- BUILT the Animation Studio (/create/animation) and Create menu entries:
  Cartoon, Short Film, Story, Motion Comic, Episode, Character (§185).
- BUILT animated design (proportions, palette, movement) per character:
  required for animation (DESIGN_MISSING), carried into image and video
  prompts and the reviewer's context (§179.4).
- FIXED a W11 gap: a one-pass series held up to 52 episodes but the Film IR
  has at most 5 acts — one-pass seasons are now 1–5 episodes; longer shows
  are made episode by episode.
- OPEN: a generated character image on the card (§183.1); character
  animation within storybook pages and comic panels (§181.4–5); a
  sound-effect generator (§178.4, §180, §181.5); seasons beyond Season 1
  (§178.2).

### W13 — Editor Agent and the directorial roles (Part 1 §21, §26–27, §46)

**Done (docs/58, 2026-10-09; migration 0048 applied live).**

- BUILT structured edit operations: CUT_SHOT, TRIM_SHOT, EXTEND_SHOT,
  SHORTEN_SCENE, MOVE_SCENE, ADD_INSERT, REMOVE_LINE — a closed vocabulary,
  applied as a pure function on the Film IR, validated like a canon revision
  (story, canon, film grammar, lines never cut short) (§21.2–21.3).
- BUILT Editorial Intelligence (`editor.review` v1): the nine questions of
  §21.1 over the cut on its timecodes, with proposals; every proposal is
  dry-run and dropped with its reason when impossible (§21.1).
- BUILT timing requests: the Director chat hands "make the opening 15 seconds
  faster" to the Editor (`director.edit` v2), which proposes the exact edits
  (§46).
- BUILT the apply: approved edits together; re-cuts keep their clips
  (`shots.cut_sec`, the render trims to it), cut shots go, extensions and
  inserts regenerate, removed lines re-voice the scene; stale reviews and
  locked scenes/films refused; the film resumes and the master renders as a
  new version.
- BUILT the Editor panel in the Director workspace.
- BUILT the directorial roles registry (§27.2): Director, Story, Visual,
  Audio, Continuity, Editor/QC — every prompt belongs to exactly one.
- OPEN: separate Script/Shot/Music agents (§26.1) are not built, by design
  (§27, Part 2 §85); music is one score bed and is not re-timed by an edit;
  transitions other than hard cuts are not rendered.

---

### W14 — Voice operations without a GPU (Part 3 §114, §129; Part 4 §136, §139, §141, §154; Part 1 §32.6)

**Done (docs/59, 2026-10-09; migration 0049 applied live).**

- BUILT the voice licence registry: code licence, commercial use, exact
  checkpoint, training data, dependencies, source and date per model; an owner
  approval names the checkpoint (`VOICE_MODEL_APPROVALS`); `routeVoice` never
  uses an uncleared engine (§114, §129, §139, §141.1).
- BUILT the speech cache: a content hash of engine version, voice, text,
  language and style; clips in `audio_cache/`, rows in `speech_cache`; it wraps
  the metered engine so hits are never billed; a deleted voice's clips are
  never served and are purged (§154).
- BUILT `voice:bench`: the same original scripts (30 s / 2 min / 10 min,
  emotional, documentary, conversational; no/en/fr) in the owner's cloned
  voice through every usable engine; WER, real-time factor, loudness and pace
  consistency, licence status; recorded in `benchmark_runs` (§136).
- BUILT audio continuity: ambience, music and room tone on the plan; a
  character's voice and the built-in engine on the spoken film (§32.6).
- OPEN: self-hosted models stay gated (Phase 1) and uncleared; voice
  similarity, naturalness and VRAM are not measured; sound effects are not
  compared.

---

### W15 — Voice Studio on the Voice Engine (Part 1 §19.2; Part 3 §116–117; Part 4 §149, §170, §174)

**Done (docs/60, 2026-10-09; migrations 0050–0051 applied live).**

- BUILT readings on the Voice Engine: the Voice Studio reader no longer calls a
  speech provider; narrator, presenter and scripted conversation (up to four
  voices) modes with delivery controls (§116–117, §128, §143, §156, §174).
- BUILT per-use licences to community voices: accept the owner's terms
  (snapshotted), revocable; a database trigger and the worker refuse any voice
  the user neither owns nor licenses, or one withdrawn (§170).
- BUILT character voice traits: pitch, pace and loudness kept in every scene
  and dub (§19.2).
- BUILT the speech ledger: each spoken part an `audio_generations` row on the
  Master Clock (§149).
- OPEN: LLM-driven live conversation through an avatar (§117.4), lip-synced
  dubbing (§117.3), the self-hosted voice worker (Phase 1).

---

### W16 — Sound design (Part 1 §18, §20; Part 5 §178–181)

**Done (docs/61, 2026-10-09; no migration).**

- BUILT the sound plan: each scene's ambience becomes a loopable soundscape
  request and each planned effect is anchored to the shot whose action it
  belongs to (§18).
- BUILT generation: ambience and sfx jobs per scene on a cloud text-to-audio
  model, content-addressed (the same place keeps the same room tone, paid
  once), metered, ledgered, TRACK_MISSING when a sound cannot be made.
- BUILT the mix: ambience and effects as stems placed on the cut's scene
  spans; dialogue anchors the mix; stem levels from the production profile's
  mix spec; loudness and true peak from the sync policy, used by the master
  gate too (§20).
- OPEN: narration placed per scene on the timeline, per-shot audio cues in
  the IR, loop-seam crossfades.

---

## 9. Sequenced roadmap

DirectorOS work is placed **inside** the docs/38 §AX.2 order, not beside it.
Workstreams that need no new runtime start now; those that need ComfyUI or
approved models wait for docs/38 gates.

| Stage | Contents | Gate to start | Can run in parallel with |
|---|---|---|---|
| **S0** | W0 operational foundation | owner actions | S1 |
| **S1 Truth** | W1 complete | none (code only) | S0 |
| **S2 Intelligence core** | W2 (IR, router, validator, master call, decision log, prompt registry); W3 schemas | S1 merged | S0 |
| **S3 Canon + compiler** | W3 world state, story graph, knowledge; W4 Shot Architect, cinematography, Prompt Compiler, cache key | S2 IR merged | — |
| **S4 Review** | W5 never-self-certify, technical QC in path, Visual Reviewer (on today's images), Editor Agent; docs/38 Phase 9 repair | S0 steps 4–6, S3 | S5 |
| **S5 Voice** | W7 up to Qwen3-TTS integration | licence check + owner approval of the model | S3, S4 |
| **S6 Versioning + passes** | W8 | S3 | S4, S5 |
| **S7 Runtime** | W6 ComfyUI, Workflow Registry, approved models (docs/38 Phases 6–8) | docs/38 Phase 1 complete | S4–S6 |
| **S8 Gate + master** | docs/38 Phases 10–11 with the W5 gate chain | S4, S7 | — |
| **S9 Workspace** | W9 | S2–S6 APIs | S7, S8 |
| **S10 Acceptance** | W10 real-provider tests and the 3-minute film | S8 | — |
| **S11 Infrastructure** | docs/38 Phase 12 DeployPro GPU | DeployPro G1–G4 | any |
| **S12 Animation** | W12 Animation Studio (Part 5) | W11 production types | S10, S11 |
| **S13 Editor** | W13 Editor Agent and directorial roles | W8 versions, W9 workspace | S12 |
| **S14 Voice operations** | W14 licence registry, speech cache, voice benchmark, audio continuity | W7 Voice Engine, W10 benchmark | S13 |
| **S15 Voice Studio** | W15 readings on the Voice Engine, per-use licences, voice traits, speech ledger | W7, W14 | S14 |
| **S16 Sound design** | W16 ambience, effects, profile-driven mix | W7, W10 | S15 |

W11 hygiene items ride along with whichever stage touches the same files.

---

## 10. Decisions needed from the owner

1. **Brain provider policy.** Keep Claude as the default behind the new router,
   with OpenAI available per task (recommended), or make OpenAI the default as
   Part 1 suggests.
2. **W0 production steps.** Deploy keys, enforcement, migrations 0027–0030,
   `WAN_MAX_FRAMES`. These change production and wait for you.
3. **Fail behaviour.** Confirm that a film with a missing shot, missing audio
   or a stub plan must **fail** (spec) rather than ship (today).
4. **Voice model.** Approve Qwen3-TTS as Engine #1 after its licence check;
   whether fal MiniMax stays as a legacy adapter.
5. **`apps/api`.** Deploy or remove.
6. **Pass default.** Three-pass (story → previs → final) as the default for
   auto mode, which changes today's one-click behaviour.

## 11. Totals

Generated from [requirements-index.md](requirements-index.md):

487 IDs: 289 built, 103 shallow, 0 poorly built, 21 not built, 74 n/a. Of the 413 IDs that are requirements, 289 (70%) are built; 103 exist but need upgrading or changing; 21 must be built — all of them GPU/ComfyUI work gated on Phase 1. (Updated after W16, 2026-10-09.)
