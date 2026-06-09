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
