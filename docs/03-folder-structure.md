# 03 — Folder Structure

A **pnpm + Turborepo monorepo**. Shared types and the model-adapter layer live
in `packages/` and are consumed by every app, guaranteeing one source of truth
for queue contracts and DTOs.

```
cineforge/
├─ apps/
│  ├─ web/                         # Next.js 14 (App Router) + Tailwind
│  │  ├─ app/
│  │  │  ├─ (marketing)/           # landing, pricing
│  │  │  ├─ (app)/                 # authed user app
│  │  │  │  ├─ projects/
│  │  │  │  ├─ studio/[projectId]/ # prompt → film, live progress
│  │  │  │  └─ watch/[filmId]/     # HLS player
│  │  │  ├─ admin/                 # admin dashboard
│  │  │  └─ api/                   # route handlers (BFF, webhooks)
│  │  ├─ components/
│  │  ├─ lib/                      # api client, ws client, auth
│  │  └─ package.json
│  │
│  ├─ api/                         # NestJS REST + WS gateway
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ auth/                  # JWT, guards, refresh
│  │  │  ├─ users/
│  │  │  ├─ projects/
│  │  │  ├─ films/
│  │  │  ├─ scenes/
│  │  │  ├─ director/              # Director AI service + LLM client
│  │  │  ├─ continuity/            # Continuity Engine
│  │  │  ├─ bibles/                # Character + World Bible
│  │  │  ├─ render/                # render job orchestration
│  │  │  ├─ billing/               # tiers, quotas, Stripe
│  │  │  ├─ queue/                 # BullMQ producers + flow definitions
│  │  │  ├─ realtime/              # WebSocket gateway (Redis adapter)
│  │  │  ├─ storage/               # S3 service, presigned URLs
│  │  │  ├─ admin/                 # admin endpoints
│  │  │  └─ common/                # filters, interceptors, rate-limit
│  │  └─ package.json
│  │
│  ├─ worker/                      # BullMQ consumers (Node/TS)
│  │  ├─ src/
│  │  │  ├─ main.ts                # worker bootstrap + graceful shutdown
│  │  │  ├─ processors/
│  │  │  │  ├─ film.processor.ts   # screenplay -> fan-out scenes
│  │  │  │  ├─ scene.processor.ts  # prompt build -> video jobs
│  │  │  │  ├─ video.processor.ts  # call GPU adapter, QC
│  │  │  │  ├─ audio.processor.ts  # voice/music/sfx
│  │  │  │  └─ render.processor.ts # FFmpeg assemble
│  │  │  ├─ ffmpeg/                # render engine wrapper
│  │  │  └─ gpu/                   # RunPod client, autoscale signals
│  │  └─ package.json
│  │
│  └─ gpu-worker/                  # Python service deployed on RunPod
│     ├─ app/
│     │  ├─ server.py              # FastAPI: /generate /health /capabilities
│     │  ├─ models/
│     │  │  ├─ wan21.py
│     │  │  └─ hunyuan.py
│     │  ├─ pipeline.py            # load model, run inference, upload to S3
│     │  └─ warm.py                # model warm/keepalive
│     ├─ Dockerfile
│     └─ requirements.txt
│
├─ packages/
│  ├─ shared/                      # @cineforge/shared
│  │  ├─ src/
│  │  │  ├─ types/                 # domain types
│  │  │  ├─ dto/                   # zod schemas / DTOs
│  │  │  ├─ queue/                 # queue names + job payload contracts
│  │  │  └─ index.ts
│  │  └─ package.json
│  ├─ model-adapters/              # @cineforge/model-adapters
│  │  ├─ src/
│  │  │  ├─ types.ts               # VideoModelAdapter interface
│  │  │  ├─ registry.ts            # ModelRegistry
│  │  │  ├─ wan/wan.adapter.ts
│  │  │  ├─ hunyuan/hunyuan.adapter.ts
│  │  │  └─ index.ts
│  │  └─ package.json
│  └─ db/                          # @cineforge/db
│     ├─ prisma/schema.prisma
│     ├─ src/index.ts              # PrismaClient singleton
│     └─ package.json
│
├─ infra/
│  ├─ docker/                      # Dockerfiles for web/api/worker
│  ├─ runpod/                      # GPU image + serverless template
│  ├─ k8s/                         # Helm charts
│  └─ monitoring/                  # prometheus.yml, grafana dashboards
│
├─ docs/                           # this documentation set
├─ docker-compose.yml             # local pg + redis + minio
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
└─ .env.example
```

### Conventions

- **One queue-contract source:** `packages/shared/src/queue` defines every job
  payload. API (producer) and worker (consumer) import the same types.
- **No model code in apps/web or apps/api:** model knowledge lives only in
  `packages/model-adapters` and `apps/gpu-worker`.
- **DB access only via `@cineforge/db`** — the Prisma client singleton.
