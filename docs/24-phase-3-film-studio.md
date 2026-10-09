# 24 — Phase 3: Cinematic AI Film Studio & Feature-Film Engine

Phase 3 turns the platform from an AI movie generator into a professional AI
film **studio**: 30/60/90-minute films, multi-episode series, feature-length
productions, and a creator ecosystem.

This document does two things:
1. **Critically evaluates** the Phase 3 vision and identifies what's missing or
   under-specified to actually ship feature-length, episodic content at scale.
2. **Fills those gaps** with concrete systems that build on what already exists
   in this repo: the GPU Lifecycle Manager ([23](23-gpu-lifecycle-manager.md)),
   model-adapter layer ([22](22-video-models.md)), BullMQ flows
   ([13](13-queues.md)), realtime status (Supabase Realtime, [25](25-supabase.md)), and the FFmpeg
   engine ([10](10-ffmpeg-render.md)).

---

## A. What the Phase 3 vision gets right
AI Director 2.0 (Story→Scene→Shot layering), cinematic shot/camera vocabulary,
character memory, advanced continuity, episodic hierarchy, multi-GPU,
QC + AI critic, trailer/social export, advanced audio/voice, collaboration,
marketplace, API platform, multi-region. These are the right *features*.

The problem: a feature list is not an architecture. Below are the load-bearing
problems the vision omits — the ones that decide whether a 90-minute film is
watchable, affordable, reproducible, and legal.

---

## B. Critical evaluation — missing & under-specified

### B1. Long-form temporal coherence (the actual hard problem)
The vision assumes "character memory + continuity" yields coherent films. It
doesn't. A 90-min film ≈ **1,080+ five-second clips**. The dominant failure mode
is **inter-clip seams**: lighting/color drift, identity flicker, motion
discontinuity at every cut. Missing: last-frame/keyframe conditioning between
adjacent shots, color matching, optical-flow interpolation, and shot-boundary
strategy. → **Fill C1.**

### B2. Dialogue timing, A/V sync, and real lip-sync
"Dialogue stored separately from video" is correct but incomplete. Missing: how
a 5s generated clip aligns to a 12s line; SMPTE timecode/timeline model;
**actual lip-sync** (audio-driven mouth motion), not just "lip-sync metadata";
and the fact that **multi-language dubbing requires re-lip-syncing per
language**. → **Fill C2, C6.**

### B3. Identity at feature scale (embeddings ≠ consistency)
Storing face embeddings doesn't keep a face consistent across 1,000 shots.
Missing: a **vector store** for the embeddings, and an operational
**per-character LoRA / IP-adapter pipeline** (when to train, where LoRAs live,
versioning, cost). → **Fill C3.**

### B4. Story Memory Graph has no source-of-truth or persistence plan
"Create a graph database" alongside the existing relational continuity, plus
embeddings, plus "world simulation" state = **polyglot persistence with no
defined source of truth**. Risk: divergence between Postgres, the graph, and the
vector store. Missing: which store is canonical, how they sync, and **event
sourcing** so you can query "world state at episode N, scene M". → **Fill C4.**

### B5. Retroactive edits & canon (unaddressed, series-breaking)
"Episode 5: village destroyed → future scenes reflect change" is the easy
direction. The hard one: a writer **edits Episode 2** after Episodes 3–10 exist.
Do they re-render? Which assets invalidate? Is there **canon branching**?
Without this, series production is impossible. → **Fill C4, C7.**

### B6. Multi-GPU section regresses to static partitioning
"Worker 1: scenes 1–25, Worker 2: 26–50" is **worse** than what Phase 1 already
has. Static slices cause stragglers and idle GPUs. Missing: dynamic
work-stealing (the queue already does this), a **fair scheduler** across tenants,
**preemption**, spot-instance interruption handling, and heterogeneous GPU
routing (A40/A100/H100 have very different throughput). → **Fill C5.**

### B7. No cost governor / FinOps for feature-length jobs
~1,080 shots × audio × render is real money. Missing: a **per-project budget
ceiling**, pre-flight cost estimate + user confirmation, real-time spend metering
(extend `UsageRecord`/`creditsMs`), and **margin protection** when a render
overruns. "Generation Cost" appears only as an analytics column. → **Fill C8.**

### B8. No durable, resumable orchestration for multi-hour jobs
A 90-min render that dies at 80% must **resume**, not restart. BullMQ flows are
fine for a short film; a feature-length, multi-stage, multi-day series needs a
**durable workflow** (saga) with checkpoints, idempotency, and compensation.
→ **Fill C9.**

### B9. "Re-render without regenerating" needs a real caching architecture
The Editor Timeline promise requires a **deterministic, content-addressed asset
cache**: every shot keyed by hash(prompt + seed + modelVersion + refs), a
dependency graph, and **partial invalidation**. Not specified. → **Fill C7.**

### B10. QC / AI Critic with no action loop or human gate
"Review every scene" and "score the film" — then what? Missing: the
**regenerate-budget loop** (retry caps, escalation), and **human-in-the-loop
approval gates** that reconcile with "minimal human intervention". → **Fill
C10, C13.**

### B11. Trust & Safety — the biggest omission for a studio + marketplace
No content moderation at scale, no **likeness/deepfake** protection (generating
real people), no **voice-clone consent**, no marketplace **IP/copyright**
enforcement. This is existential, not optional. → **Fill C11.**

### B12. Legal, rights, provenance, DRM
Selling films/characters/voices and cloning voices raises: output ownership,
likeness rights, training-data provenance, **C2PA content credentials +
watermarking** for AI media, **EU AI Act** disclosure, and **DRM** for paid
streaming. Absent. → **Fill C11, C12.**

### B13. Global infra vs. data residency
"US/EU/Africa/ME + automatic failover" conflicts with **GDPR / data-residency**:
you cannot freely fail EU user data over to another region. Missing: residency
constraints in the failover policy. → **Fill C14.**

### B14. No evaluation / regression harness
"Consistency improved" — proven how? Missing: a **golden-film eval set**,
automated consistency/identity/continuity metrics tracked over time, and model
A/B before promotion. → **Fill C15.**

### B15. Observability for long jobs
Phase 1 metrics aren't enough. Missing: **per-job distributed tracing** across
many GPUs, **cost attribution per project/tenant**, SLOs for time-to-first-scene
and stuck-render alerts. → **Fill C16.**

### B16. World Simulation is unbounded scope
"Track economy, wars, politics, religion, population" as a live simulation is
infinite work. It must be reframed as a **narrative state machine** driven by the
screenplay (a finite, queryable canon), not an agent-based world sim.
→ **Fill C4.**

### B17. Other gaps
Accessibility (SDH captions, audio description, WCAG studio UI); a **migration
path** for Phase 1/2 projects when models change (reproducibility vs.
improvement); marketplace payments/escrow/tax; and connecting the **trailer
generator to highlight detection** (it needs the AI Critic's per-scene scores).
→ **Fill C13, C17.**

---

## C. The additions (what to build)

### C1. Inter-clip Coherence Engine
Make adjacent clips continuous, not just individually good.
- **Last-frame conditioning:** feed the final frame(s) of shot *n* as the
  init/reference image for shot *n+1* within a continuous take (model-adapter
  gains an optional `initImageKey`).
- **Color/exposure matching:** FFmpeg/`colormatch` or histogram transfer across
  shots in a scene (extends `commands.ts`).
- **Boundary policy:** hard cut vs. crossfade (`xfadeArgs` already present) vs.
  motion-matched cut, chosen by the Shot Director.
- **Interpolation:** optical-flow frame interpolation (e.g., RIFE) on seams.
- **QC seam check:** measure inter-clip color/identity delta; regenerate on
  threshold (extends the Quality Checker, [09](09-scene-pipeline.md)).

### C2. Dialogue-driven timeline & A/V sync
- A **Timeline** model (per scene): tracks placed at SMPTE timecode; shot
  durations **derived from dialogue length** (a 12s line → enough shots to
  cover it), not fixed 5s.
- Generation requests carry a target duration; the Scene Director allocates
  shots to fill spoken time + action beats.
- Render reads the timeline (extends the FFmpeg engine) instead of naive concat.

### C3. Identity stack: vector store + LoRA pipeline
- **Vector store** for face/voice embeddings: `pgvector` (reuse Postgres) at
  first, Qdrant/Milvus if it grows. The schema's `embedding Json` becomes a
  `vector` column (migration). Used by QC for cosine identity checks.
- **Per-character LoRA training** (Studio/Enterprise): a GPU job trains a
  lightweight LoRA from reference images once a character is locked; LoRAs are
  versioned in S3 and selected by the model-adapter (`loraKeys`). Cost-gated.

### C4. Story Memory Graph + canonical state (source-of-truth defined)
- **Postgres is canonical.** The graph and vector store are **projections**
  rebuilt from it — no divergence.
- **Event-sourced canon:** a `StoryEvent` append-only log ("King loses son",
  "Village destroyed", episode/scene-stamped). Continuity snapshots
  ([06](06-continuity-engine.md)) become **materialized views** of the event log
  → "state at episode N, scene M" is a deterministic fold.
- **Graph projection** (Apache AGE on Postgres, or Neo4j as a read replica) for
  relationship/causality queries the Director uses for foreshadowing/callbacks.
- **World "simulation" = narrative state machine:** finite, screenplay-driven
  facts (kingdoms, factions, locations, statuses), not an agent sim. Bounded.

### C5. Multi-GPU scheduler (dynamic, fair, heterogeneous, preemptible)
> **Implemented:** model routing policy + cluster router + fair scheduling +
> multi-GPU dispatch.
> - **Tier gating:** `@cineforge/model-adapters/policy.ts` (`isModelAllowed`,
>   `allowedModels`, `resolveModel`); `POST /generate-film` rejects
>   `MODEL_NOT_ALLOWED`. Tested.
> - **Heterogeneous routing:** `@cineforge/gpu/cluster.ts` `GpuClusterRouter`
>   picks the worker with the lowest throughput-normalized load (A40/A100/H100
>   weights), skips unhealthy workers, tie-breaks toward the faster GPU; env
>   parsing via `parseClusterFromEnv`. Tested.
> - **Fair scheduling:** `@cineforge/gpu/fairness.ts` `tierPriority` +
>   `DeficitFairScheduler` (weighted, no starvation). The film flow enqueues
>   video/audio jobs with **per-tier BullMQ priority** so one epic can't starve
>   others. Tested.
> - **Multi-GPU dispatch:** `RunpodClient` is routing-aware (`resolveBaseUrl`);
>   `buildClusterRegistry` round-robins across `WAN_GPU_URLS`/`HUNYUAN_GPU_URLS`
>   so a pool of GPUs is actually utilized. The video worker uses it.
> - Remaining: live load/health feeding the router from the RunPod API +
>   preemption/spot-interruption handling (the selection core + lifecycle hooks
>   are in place; this is the live-infra integration).

Generalizes the Phase 1 GPU Lifecycle Manager from one pool to a cluster.
- **Dynamic work-stealing** via the existing queues — *delete* static slicing.
- **Heterogeneous routing:** the scheduler knows per-GPU throughput
  (A40/A100/H100) and `estimateCost`/duration from the adapters; routes premium
  models to capable GPUs.
- **Fair scheduling:** weighted-fair queueing per tenant/tier so one 90-min epic
  can't starve others; priority lanes tie to monetization.
- **Preemption & spot:** checkpoint a shot, preempt low-priority work for SLA
  jobs; handle spot interruptions by re-queue (idempotent shots already support
  this).
- **Per-pool lifecycle:** each pool keeps the reference-counted auto-shutdown
  rule from [23](23-gpu-lifecycle-manager.md); the cluster's *last* GPU follows
  the exact `ACTIVE==0 && QUEUED==0 && IDLE>=grace` predicate.

### C6. Lip-sync & dubbing pipeline
- **Audio-driven lip-sync** pass (e.g., LatentSync/Wav2Lip-class) after voice +
  video for dialogue shots; produces synced video.
- **Dubbing = re-run TTS + re-run lip-sync per language**, reusing the same
  video base. Track per-language audio + synced-video variants.
- Phoneme/viseme timing stored on `DialogueLine` for alignment.

### C7. Deterministic asset cache & partial re-render
> **Implemented (first pass):** provenance + content-addressed cache.
> - Pure hashing in `@cineforge/shared` (`computeCacheKey`, `computePromptHash`,
>   `deterministicSeed`) + tests.
> - Director assigns each shot a deterministic `seed`, `promptHash`, `cacheKey`,
>   and `modelVersion` (`director.service.ts`).
> - `video.processor` reuses an existing READY clip with the same `cacheKey` in
>   the project (zero GPU spend) before generating — this is what makes editor
>   re-renders cheap. Schema: `Shot.cacheKey/promptHash/modelVersion` (+ index).
> - Remaining: dependency-graph invalidation UI + canon branching.

- **Content-addressed cache:** every shot/audio/render keyed by
  `hash(inputs + seed + modelVersion + refVersions)`. Identical inputs → cache
  hit, no GPU spend.
- **Provenance** on every asset: `seed`, `modelId`, `modelVersion`, `promptHash`
  (schema additions) → reproducibility + cache keys.
- **Dependency graph + partial invalidation:** editing one scene re-renders only
  the affected scene(s) + final mux; everything else is a cache hit. This is what
  makes the Editor Timeline real.
- **Canon branching:** editing past episodes forks a canon version; downstream
  episodes show a "stale vs. re-render" diff instead of silent corruption.

### C8. Cost governor / FinOps
> **Implemented (first pass):** pre-flight estimate + credit gate + metered debit.
> - Pure estimator in `@cineforge/model-adapters` (`estimateShotMs`,
>   `estimateFilmMs`, shared single cost formula adapters delegate to) + tests.
> - `GET /projects/:id/estimate` returns `{ estimatedMs, creditsMs, affordable }`.
> - `POST /generate-film` rejects with `INSUFFICIENT_CREDITS` (non-Enterprise)
>   and records `Project.estimatedMs` as the budget ceiling.
> - `video.processor` meters `UsageRecord` and debits `User.creditsMs` only for
>   real generation (cache hits cost 0).
> - **Live pause/resume:** `video.processor` tracks `Project.spentMs` and, once
>   spend passes `estimate × 1.25` (`shouldPauseForBudget`, tested), sets the
>   project `PAUSED` (the UI sees it through Supabase Realtime on `projects`; the
  `project.paused` WS event went with the deleted realtime gateway); queued shots then fail-fast at a
>   pause gate so the GPU drains and shuts down. `POST /projects/:id/resume`
>   (optionally `{ addBudgetMs }`) re-checks affordability, restarts the GPU, and
>   re-enqueues the flow **without re-planning** — completed shots short-circuit,
>   audio tracks are skipped, so resume is idempotent and cheap.
> - **Margin alerts:** `GET /admin/cost` aggregates GPU spend (total + by kind)
>   and lists projects that paused over budget — the FinOps view for the admin
>   dashboard.

- **Pre-flight estimate:** sum adapter `estimateCost` over the planned shots +
  audio + render → show the user a cost/time estimate and require confirmation
  for feature-length jobs.
- **Per-project budget ceiling** in `creditsMs`; the scheduler **stops and
  pauses** a project that hits its cap (resumable) rather than overrunning.
- **Real-time metering** (extend `UsageRecord`) + **margin alerts**; cost
  attribution per project/tenant in the admin dashboard.

### C9. Durable workflow orchestration
- Adopt a **durable workflow engine (Temporal)** for the film/series saga:
  checkpointed, resumable, idempotent activities; BullMQ remains the GPU
  work-dispatch layer underneath. A render that dies at 80% resumes at 80%.
- Long jobs become inspectable workflows with retries/compensation, not opaque
  multi-hour queue chains.

### C10. QC + AI Critic action loop
- **Regenerate budget:** each shot gets N retries with escalating conditioning;
  exceed → flag for review, don't loop forever or silently ship garbage.
- **AI Critic scores feed actions:** low scene score → targeted regenerate;
  per-scene scores also drive **trailer highlight selection** (C13).
- Scores stored per scene/film for the eval harness (C15).

### C11. Trust & Safety
- **Prompt + output moderation** at scale (policy classifiers in + frames out),
  with audit + appeals (extends [17](17-security.md)).
- **Likeness/deepfake controls:** block generation of real, identifiable people
  without verified consent; detect celebrity likeness.
- **Voice-clone consent:** require signed consent attestation + sample
  ownership before cloning; watermark cloned-voice output.
- **Marketplace IP enforcement:** copyright/likeness screening on listed
  characters/worlds/films; DMCA workflow; takedowns.

### C12. Legal, rights, provenance, DRM
- **C2PA content credentials** + invisible watermark on all generated media
  (disclosure + traceability); **EU AI Act** "AI-generated" labeling.
- **Rights model:** output ownership terms per tier; training-data provenance
  recorded; per-asset license metadata in the marketplace.
- **DRM/packaging** for paid films: CMAF + Widevine/FairPlay, signed playback,
  per-title encoding (extends the streaming pipeline).

### C13. Workflow state machine (reconciles automation vs. collaboration)
"Minimal human intervention" = the **default path is fully automated**; human
gates are **optional, role-gated checkpoints**:
`DRAFT → PLANNED → GENERATING → QC → (REVIEW?) → APPROVED → PUBLISHED`.
Producers/Directors can insert review gates; without them, it auto-advances.
Collaboration roles map to permissions on these transitions.

### C14. Global infra with data residency
- **Residency-aware placement:** EU user data stays in EU; failover only to
  **compliant** regions. Per-region buckets/DBs; metadata vs. asset separation.
- Active-active for stateless tiers; regional primaries for stateful data with
  documented RPO/RTO ([20](20-deployment-plan.md)).

### C15. Evaluation & regression harness
- **Golden eval set** of prompts → films; automated metrics: identity
  consistency (embedding variance), continuity-rule violations, seam deltas,
  prompt adherence (CLIP), audio sync error.
- Track metrics over time; **gate model promotions** on no-regression; A/B new
  models behind the adapter layer before defaulting.

### C16. Observability for long jobs
- **Distributed tracing** (OpenTelemetry) across API→queue→scheduler→GPU→render
  for a single film; **cost attribution** spans.
- SLOs: time-to-first-scene, stuck-render detector, per-tenant fairness
  dashboards (extends [18](18-devops.md)).

### C17. Accessibility & migration
- **SDH captions + audio description** tracks; WCAG-compliant studio UI.
- **Migration/compat:** existing projects pin their `modelVersion` for
  reproducibility; "upgrade with newer model" is an explicit, cost-estimated
  re-render, never silent.

---

## D. Schema additions (see `packages/db/prisma/schema.prisma`)
Phase 3 extends the schema additively (existing Phase 1 relations unchanged):
- **Episodic hierarchy:** `Series`, `Season`, `Episode`; `Scene.episodeId?`.
- **Provenance & caching:** `Shot.modelVersion`, `Shot.promptHash`,
  `Shot.cacheKey`; `Film.version`.
- **Canon log:** `StoryEvent` (append-only, episode/scene-stamped) — the
  event-sourced source of truth for continuity/world state (C4).
- **Identity:** `Character.loraKey?`, `loraVersion?`; embeddings move to a
  `vector` column via a `pgvector` migration (C3).

## E. Phasing within Phase 3
- **3a — Episodic & coherence:** episodic schema, inter-clip coherence (C1),
  dialogue timeline (C2), provenance + asset cache (C7), cost governor (C8).
- **3b — Scale & quality:** multi-GPU scheduler (C5), durable workflows (C9),
  identity/LoRA + vector store (C3), QC/critic loop (C10), eval harness (C15).
- **3c — Studio & ecosystem:** lip-sync/dubbing (C6), story graph + world state
  (C4), trust & safety + legal/DRM (C11/C12), marketplace, global residency
  (C14), collaboration state machine (C13), accessibility (C17).

## F. Revised success criteria (with guardrails)
> User enters: *"Create a 90-minute historical epic."*

System: estimates **cost + time and gets confirmation** → builds world/canon →
characters (with LoRAs) → screenplay/episodes/scenes → generates video with
**inter-clip coherence** and **identity locking** → voice + **lip-sync** + music
→ continuity validated against the **canon event log** → QC + critic with a
**bounded regenerate loop** → renders via the **multi-GPU scheduler** under a
**budget ceiling**, **resumable** if interrupted → trailer from **critic-scored
highlights** → **moderated, watermarked (C2PA), rights-cleared** → published with
**DRM + adaptive streaming**, **residency-compliant**, and **reproducible**
(seed + model version pinned). Fully automated by default; optional human gates.
