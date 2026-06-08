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
idle-shutdown GPU workers.

---

## Documentation map

The design is the deliverable. Start here:

| # | Document | What it covers |
|---|----------|----------------|
| 00 | [docs/00-overview.md](docs/00-overview.md) | Vision, glossary, end-to-end flow |
| 01 | [docs/01-architecture.md](docs/01-architecture.md) | System architecture + all diagrams |
| 02 | [docs/02-database-schema.md](docs/02-database-schema.md) | Postgres schema (mirrors `prisma/schema.prisma`) |
| 03 | [docs/03-folder-structure.md](docs/03-folder-structure.md) | Monorepo layout |
| 04 | [docs/04-api-spec.md](docs/04-api-spec.md) | REST + WebSocket API, request/response examples |
| 05 | [docs/05-director-ai.md](docs/05-director-ai.md) | The Director AI (screenplay → shot list) |
| 06 | [docs/06-continuity-engine.md](docs/06-continuity-engine.md) | Continuity Engine |
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

## Code map

```
apps/
  web/        Next.js 14 (App Router) + Tailwind — user app & admin dashboard
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
