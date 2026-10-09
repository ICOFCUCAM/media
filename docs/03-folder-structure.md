# 03 — Folder Structure

A **pnpm + Turborepo monorepo**. Shared types and the model-adapter layer live
in `packages/` and are consumed by every app, guaranteeing one source of truth
for queue contracts and DTOs.

> **Status (2026-10-09):** the tree below is the original plan; several folders
> were never created. Notably `apps/api/src` today holds only `admin/`,
> `auth/` (Supabase session-token guard), `films/`, `gpu/`, `health/` and
> `voices/`; there is no WebSocket gateway (`apps/api/src/realtime` and
> `packages/realtime` were deleted), and `apps/web/lib` has no API or WS client
> (`apps/web/lib/api.ts` was deleted — the web app talks to Supabase directly,
> with live status from Supabase Realtime). `packages/` also holds `movie`
> (DirectorOS), `voice-contracts` and `bench`.

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
│  │  ├─ lib/                      # Supabase client + Realtime, auth (no API/WS client)
│  │  └─ package.json
│  │
│  ├─ api/                         # NestJS REST (/v1, /livez, /readyz, /metrics)
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ auth/                  # Supabase session-token guard, role from users.role
│  │  │  ├─ users/
│  │  │  ├─ projects/
│  │  │  ├─ films/
│  │  │  ├─ scenes/
│  │  │  ├─ director/              # Director AI service + LLM client
│  │  │  ├─ continuity/            # Continuity Engine
│  │  │  ├─ bibles/                # Character + World Bible
│  │  │  ├─ render/                # render job orchestration
│  │  │  ├─ gpu/                   # GpuService -> @cineforge/gpu (ensureRunning, status)
│  │  │  ├─ billing/               # tiers, quotas, Stripe
│  │  │  ├─ queue/                 # BullMQ producers + flow definitions
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
│  │  │  └─ main.ts                # processors + GPU lifecycle reconcile loops
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
│  ├─ gpu/                         # @cineforge/gpu — Auto GPU Lifecycle Manager
│  │  ├─ src/
│  │  │  ├─ active-job-tracker.ts  # reference-counted active jobs (BullMQ state)
│  │  │  ├─ runpod-control.ts      # start/stop RunPod pod/serverless + health
│  │  │  ├─ lifecycle-manager.ts   # start-on-demand + grace-period auto-shutdown
│  │  │  ├─ factory.ts             # createGpuManagers(env): one per model pool
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
