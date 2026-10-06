# Cineforge — AI Film Generation Platform

> Generate long-form films (5 minutes → 2+ hours) from a single prompt, using
> open-source video models (Wan 2.1, Hunyuan Video) self-hosted on RunPod GPUs.

Type:

> _"Create a 30-minute cinematic movie about an African kingdom fighting for independence."_

…and the platform writes the screenplay, casts and locks characters & locations,
plans every shot, generates video / voice / music / SFX, enforces continuity,
assembles the cut with FFmpeg, and streams the finished MP4.

Cineforge is architected to compete with Runway, Kling, Pika, and Luma at a
fraction of the operating cost by running open-source models on autoscaled,
idle-shutdown GPU workers — and to go where they don't: finished films, not clips.

## What works today (live in production)

- **Films from one sentence** — Claude writes the screenplay + continuity,
  OpenAI paints per-scene stills, video engines animate them, FFmpeg
  assembles the narrated cut. Two engines: self-hosted Wan (own RunPod A40,
  auto start/stop) and **Cinematic** (frontier models via fal.ai, parallel shots).
- **Narration + 20-language dubbing** — story voiceover per scene (TTS),
  auto-translated/dubbed variants per film (`final_{lang}.mp4`), incl.
  Igbo, Lingala, Luganda, Zulu, Nigerian Pidgin.
- **Voice Lab** — clone a voice from a 30s sample (fal MiniMax), read
  unlimited-length speeches in any registry language; community voice
  marketplace with owner terms + admin approval.
- **Talking avatars** — a portrait photo lip-synced to any reading.
- **Social Launchpad** — upload a video (or pick a finished film), Claude
  writes per-platform launch kits, one button posts to YouTube / TikTok /
  Instagram / Facebook (real APIs, env-gated; X scaffold).
- **Self-healing pipeline** — persistent queue, stalled-job reclaim, and a
  progress-based watchdog that re-fans-out stalled films; failures land on
  the row, never silently.
- **Business layer** — five plans (docs/33) with Stripe checkout + webhook
  fulfillment (Supabase Edge Functions), credit ledger enforced in the
  worker, tier gates (engines, film length, seats), admin console
  (roster, credit grants, moderation), brand-kit white-label outros.

---

## Documentation map

The design is the deliverable. Start here — or see the full
**[docs index](docs/README.md)** for the by-area map and the continuity/identity
overview.

| # | Document | What it covers |
|---|----------|----------------|
| — | [docs/README.md](docs/README.md) | **Docs index** + continuity & identity overview |
| 00 | [docs/00-overview.md](docs/00-overview.md) | Vision, glossary, end-to-end flow |
| 01 | [docs/01-architecture.md](docs/01-architecture.md) | System architecture + all diagrams |
| 02 | [docs/02-database-schema.md](docs/02-database-schema.md) | Postgres schema (mirrors `prisma/schema.prisma`) |
| 03 | [docs/03-folder-structure.md](docs/03-folder-structure.md) | Monorepo layout |
| 04 | [docs/04-api-spec.md](docs/04-api-spec.md) | REST + WebSocket API, request/response examples |
| 05 | [docs/05-director-ai.md](docs/05-director-ai.md) | The Director AI (screenplay → shot list) |
| 06 | [docs/06-continuity-engine.md](docs/06-continuity-engine.md) | Continuity Engine (design — implemented in **28**) |
| 07 | [docs/07-character-bible.md](docs/07-character-bible.md) | Character Bible |
| 08 | [docs/08-world-bible.md](docs/08-world-bible.md) | World Bible |
| 09 | [docs/09-scene-pipeline.md](docs/09-scene-pipeline.md) | Scene generation pipeline + long-film batching |
| 10 | [docs/10-ffmpeg-render.md](docs/10-ffmpeg-render.md) | FFmpeg render engine |
| 11 | [docs/11-audio-systems.md](docs/11-audio-systems.md) | Voice, music, sound-effects systems |
| 12 | [docs/12-runpod-gpu.md](docs/12-runpod-gpu.md) | RunPod GPU workers, autoscale, idle shutdown |
| 13 | [docs/13-queues.md](docs/13-queues.md) | BullMQ queue architecture |
| 14 | [docs/14-storage.md](docs/14-storage.md) | S3 storage layout |
| 15 | [docs/15-monetization.md](docs/15-monetization.md) | Tiers, quotas, pricing |
| 16 | [docs/16-admin-dashboard.md](docs/16-admin-dashboard.md) | Admin dashboard |
| 17 | [docs/17-security.md](docs/17-security.md) | Security architecture |
| 18 | [docs/18-devops.md](docs/18-devops.md) | Docker, CI/CD, monitoring |
| 19 | [docs/19-scaling-cost.md](docs/19-scaling-cost.md) | Scaling 10 → 1M users, cost optimization |
| 20 | [docs/20-deployment-plan.md](docs/20-deployment-plan.md) | Production deployment plan |
| 21 | [docs/21-roadmap.md](docs/21-roadmap.md) | Future roadmap |
| 22 | [docs/22-video-models.md](docs/22-video-models.md) | Models (Wan/Hunyuan) & "own API" cost strategy |
| 23 | [docs/23-gpu-lifecycle-manager.md](docs/23-gpu-lifecycle-manager.md) | **Auto GPU Lifecycle Manager** (start-on-demand, auto-shutdown) |
| 24 | [docs/24-phase-3-film-studio.md](docs/24-phase-3-film-studio.md) | **Phase 3** — feature-film/series engine: critique + the missing systems |
| 25 | [docs/25-supabase.md](docs/25-supabase.md) | Supabase (auth, Postgres, Realtime, storage) |
| 26 | [docs/26-storyboard-mode.md](docs/26-storyboard-mode.md) | Storyboard mode — the scene as a production object + Hybrid |
| 27 | [docs/27-deploy-worker.md](docs/27-deploy-worker.md) | Deploying the worker (Docker, Compose, Render) |
| 28 | [docs/28-continuity-engine.md](docs/28-continuity-engine.md) | **Continuity Engine (implemented)** — memory graph, bridges, identity stack |
| 35 | [docs/35-studio-design-system.md](docs/35-studio-design-system.md) | **Studio design system** — rooms, tokens, shell, primitives, rules |
| 36 | [docs/36-site-review.md](docs/36-site-review.md) | **Site review** — critique, upgrade roadmap, responsive baseline |
| 37 | [docs/37-homepage-frames-and-motion.md](docs/37-homepage-frames-and-motion.md) | **Homepage frames & motion** — real-frame slots, generator, motion inventory |
| — | [docs/design/](docs/design/README.md) | Page designs and how each was implemented in the app |

## Code map

```
apps/
  web/        Next.js 14 (App Router) + Tailwind — user app & admin dashboard
              (components/cf = the studio shell + design system, docs/35)
  api/        NestJS REST + WebSocket gateway, JWT auth, BullMQ producers
  worker/     BullMQ consumers: director, scene, audio, render orchestration
  gpu-worker/ Python FastAPI service that runs on RunPod (Wan 2.1 / Hunyuan)
packages/
  model-adapters/  Pluggable video-model abstraction layer (Wan, Hunyuan, …)
  shared/          Shared TS types, DTOs, zod schemas, queue contracts
  db/              Prisma client + schema
infra/
  docker/     Dockerfiles
  runpod/     GPU worker image + serverless template
  k8s/        Helm charts (production)
  monitoring/ Prometheus + Grafana
```

## Quick start (local dev)

```bash
pnpm install
cp .env.example .env
docker compose up -d            # postgres, redis, minio
pnpm --filter @cineforge/db prisma migrate dev
pnpm dev                        # turbo runs web + api + worker
```

See [docs/18-devops.md](docs/18-devops.md) for the full developer setup,
and [docs/20-deployment-plan.md](docs/20-deployment-plan.md) for production.

## Status

This repository is a **production-grade architecture + working scaffold**. The
documentation set is complete and implementation-ready. Implemented in code:

- Monorepo (pnpm + Turborepo), Prisma schema, shared queue contracts.
- **Model abstraction layer** — Wan 2.1 (primary) + Hunyuan (premium) adapters + registry.
- **Auto GPU Lifecycle Manager** (`packages/gpu`) — start-on-demand + reference-counted
  auto-shutdown, **unit-tested** (`pnpm --filter @cineforge/gpu test`).
- **End-to-end queue fan-out** — `film → scene → video/audio → render` via a BullMQ flow
  (Director planner persists scenes/shots; processors drive the lifecycle to a `Film` row).
- **API wiring** — `POST /generate-film` (starts GPU then enqueues), `GET /admin/gpu`.

Stubbed (clearly marked, shapes match the schema so swap-in is local): the Director
LLM calls, GPU inference, audio adapters, and FFmpeg assembly. See each doc's
"Implementation checklist".
