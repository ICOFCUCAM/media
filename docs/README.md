# Cineforge — documentation index

One natural-language prompt → a finished, streamable long-form film, on
self-hosted open-source video models. Start with [00-overview](00-overview.md)
and [01-architecture](01-architecture.md); this page is the map.

## By area

**Product & architecture**
- [00 — Overview](00-overview.md) · vision, end-to-end flow, glossary
- [01 — System architecture](01-architecture.md) · services + diagrams
- [03 — Folder structure](03-folder-structure.md)
- [21 — Roadmap](21-roadmap.md) · [24 — Phase 3 film studio](24-phase-3-film-studio.md)

**Story brain (Director + continuity)**
- [05 — Director AI](05-director-ai.md) · screenplay/scene/shot planning
- [07 — Character Bible](07-character-bible.md) · [08 — World Bible](08-world-bible.md)
- [06 — Continuity Engine (design)](06-continuity-engine.md) →
  **[28 — Continuity Engine (implemented)](28-continuity-engine.md)**
- [26 — Storyboard mode](26-storyboard-mode.md) · the scene as a production object + Hybrid mode

**Generation pipeline**
- [09 — Scene pipeline](09-scene-pipeline.md) · [10 — FFmpeg render](10-ffmpeg-render.md)
- [11 — Audio systems](11-audio-systems.md)
- [22 — Video models](22-video-models.md) · adapter contract, image-/video-to-video
- [12 — RunPod GPU](12-runpod-gpu.md) · [23 — GPU lifecycle manager](23-gpu-lifecycle-manager.md)
- [13 — Queues](13-queues.md) · [14 — Storage](14-storage.md)

**Platform**
- [02 — Database schema](02-database-schema.md) · [25 — Supabase](25-supabase.md)
- [04 — API spec](04-api-spec.md) · [17 — Security](17-security.md)
- [15 — Monetization](15-monetization.md) · [16 — Admin dashboard](16-admin-dashboard.md)
- [18 — DevOps](18-devops.md) · [19 — Scaling & cost](19-scaling-cost.md)
- [20 — Deployment plan](20-deployment-plan.md) · [27 — Deploy the worker](27-deploy-worker.md)

**Distribution & growth**
- [29 — Multilingual export](29-multilingual.md) · one film → many languages
- [30 — Ads & licensed stock](30-ads-and-stock.md) · ad presets + Pexels/Pixabay
- [31 — Social publishing](31-social-publishing.md) · push to YouTube/TikTok/…

**Media engine — governing architecture and phases** ([38 §AX.2](38-media-engine-architecture.md) order; status in §AY)
- [38 — Media engine architecture](38-media-engine-architecture.md) · runtime gateway, Master Production Clock, A/V sync, ComfyUI plan
- [39 — Phase 1: GPU security](39-phase1-gpu-security-plan.md) · gateway, execution tokens, verified image chain, **rollout runbook §10**
- [40 — Phases 2–3: clock and runtime contract](40-phase2-3-clock-and-runtime-contract.md) · µs timebase, timing reports, outcome classification
- [41 — Phase 4: timeline data model](41-phase4-timeline-data-model.md) · migrations 0028–0030 (applied live 2026-10-08)
- [42 — Phase 5: A/V Sync Engine](42-phase5-av-sync-engine.md) · analyzers, validators, repair planner, `avsync:check`
- [43 — Worker on DeployPro](43-deploypro-worker.md) · root Dockerfile, health check, runbook

**DirectorOS — the intelligence layers above the media engine**
- [DirectorOS specification and gap analysis](directoros/README.md) · Parts 1–4, 454 requirement IDs, [gap analysis](directoros/gap-analysis.md), [execution protocol](directoros/execution-protocol.md), [contracts](directoros/contracts/README.md)
- [44 — Truth layer (W1)](44-truth-layer.md) · failures vs recorded degradations, capability registry, truth gate; migration 0031 (applied live 2026-10-08)
- [45 — Intelligence layer and Film IR (W2)](45-directoros-intelligence.md) · one master call, validator chain, Production Compiler, provider router, decision log; migration 0032 (applied live 2026-10-08)
- [46 — Canon, world state and continuity (W3)](46-directoros-world-state.md) · World State Engine, story time, knowledge, foreshadowing, Character Continuity Engine, canon revisions that regenerate only affected shots, story state, wardrobe reference pack, Visual Reviewer; migrations 0027–0034 **applied live**
- [47 — CineForge Ads Studio](47-ads-studio.md) · `/ads`: website-to-advertisement studio page (owner design), hand-off to the real advert pipeline, own-domain routing (`ADS_STUDIO_HOSTS`), planned pay-as-you-go/monthly model
- [48 — Cinematography and the Prompt Compiler (W4)](48-directoros-shots-and-prompts.md) · 180°/eyeline rules, grammar advisories, canonical media request, per-model prompt compilers (Wan, Hunyuan, OpenAI image), cache key over the compiled prompt
- [49 — Quality gates (W5)](49-directoros-quality-gates.md) · every clip measured before READY, bounded regenerate with a new seed, Final Quality Gate on the master, gate chain recorded (migration 0035, applied live)
- [50 — Image providers, seed candidates and visual memory (W6)](50-directoros-images-and-references.md) · image provider registry (ComfyUI gated on Phase 1), reviewer-picked seed candidates, reference pack, shot-to-shot end frames
- [51 — Voice Engine (W7a–W7c)](51-directoros-voice-engine.md) · model-independent voice service: consent, recording quality check, engine router, eight-state jobs, mastering, the `/v1` API (migration 0036, applied live; self-hosted models gated on Phase 1); film narration, each character's dialogue in their own voice, and dubs in the same voices

## Continuity & identity — the coherent-movie spine

Scenes are not isolated clips. Every scene **inherits the folded state of all
prior scenes** and **writes its own changes**, so story facts *and* visual
identity carry forward and can never silently contradict. Full detail in
[28 — Continuity Engine](28-continuity-engine.md); the moving parts:

- **Project Memory Graph** — characters / relationships / locations / world /
  goals / timeline, folded from each scene's `state_patch` (pure engine in
  `packages/shared/src/continuity.ts`, mirrored client-side for the storyboard).
- **Scene Bridge** — `{ whatJustHappened, whatChanged, whatCarriesForward,
  nextSceneRequirements }`; the next scene auto-consumes the previous bridge.
- **Continuity score + dependency graph + timeline**, surfaced on every
  storyboard card.
- **Auto-fill** — the Director (Claude, via forced-tool structured output) and a
  deterministic fallback both propose each scene's bridge + state from the script.
- **Identity stack** — one stable asset id drives four reinforcing signals:
  **prose** (preamble) → **seed frame** → **IP-adapter reference frames**
  (`Character.referenceUrls`) → **per-character LoRA** (`Character.loraKey`,
  trained by the `lora-queue`).

```
studio / Director ─► Supabase + Prisma ─► worker (BullMQ)
        │  continuity fold ─► prompt preamble + referenceImageKeys + loraKeys + reference video
        │                                   │
        │                          video-queue ─► Wan/Hunyuan adapter ─► gpu-worker /generate
        │                                                                 (loads LoRA + refs + v2v)
        └─ framed-but-untrained character ─► lora-queue ─► gpu-worker /train ─► Character.loraKey ─┐
                                                                                                   │
                                                           (the next render picks up the LoRA) ◄───┘
```

### Deploy the pipeline

The web app runs on Vercel; the worker is the background engine. See
[27 — Deploy the worker](27-deploy-worker.md) for the Dockerfile, Compose, and
Render blueprint. Drop in keys to light up each stage: `ANTHROPIC_API_KEY`
(Director) · `OPENAI_API_KEY` (seed frames + narration) ·
`EXTERNAL_VIDEO_API_URL` **or** `WAN_GPU_URL`/`HUNYUAN_GPU_URL` (video) ·
`LORA_TRAINER_URL` (identity LoRA). The GPU side (`apps/gpu-worker`) is
scaffolded to honor reference frames, video-to-video, and LoRA load/train — the
only remaining work is dropping real model weights into the marked integration
points.
