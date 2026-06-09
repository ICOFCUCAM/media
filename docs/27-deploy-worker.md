# 27 — Deploying the worker

The **web app** runs on Vercel; the **worker** (`apps/worker`) is the background
engine — it runs the Director (Anthropic), seed frames + narration (OpenAI),
the video model (Wan/Hunyuan or an external provider), the BullMQ flow and the
FFmpeg render. It needs Redis (queues) + Postgres (Prisma) and a place to run a
long-lived process; Vercel functions can't host it.

The image runs `apps/worker` **from source via `tsx`** (workspace packages are
consumed as source, so there's no build step), and bundles **ffmpeg**.

## What it needs

| Var | Purpose |
|---|---|
| `REDIS_URL` | BullMQ queues + realtime pub/sub (**required**) |
| `DATABASE_URL` | Postgres for Prisma — the Supabase **pooled** connection string (**required**) |
| `S3_*` | Asset storage (`S3_BUCKET/REGION/ENDPOINT/ACCESS_KEY/SECRET_KEY`) |
| `ANTHROPIC_API_KEY` (+`ANTHROPIC_MODEL`) | Director |
| `OPENAI_API_KEY` (+`OPENAI_TTS_VOICE`…) | seed frames (`gpt-image-1`) + narration (`tts-1`/`onyx`) |
| `ASSET_PUBLIC_BASE_URL` | lets providers fetch seed frames / reference videos by URL |
| `EXTERNAL_VIDEO_API_URL/KEY` **or** `WAN_GPU_URL`/`HUNYUAN_GPU_URL`+`RUNPOD_API_KEY` | the video model |

The worker boots with only `REDIS_URL`/`DATABASE_URL`; the AI/provider keys
unlock real generation (without them, status still advances but media is empty).
**Run migrations once** against `DATABASE_URL`: `prisma migrate deploy`
(or `pnpm db:migrate` in dev). The Supabase schema is already applied to the live
project (`packages/db/supabase/migrations`); for a fresh Postgres use the Prisma
migrations.

## Local (Docker Compose)

`docker-compose.yml` ships Postgres + Redis + MinIO. Bring up the worker too:

```bash
cp .env.example .env            # add ANTHROPIC_API_KEY / OPENAI_API_KEY / provider keys
docker compose up -d postgres redis minio createbuckets
pnpm db:migrate                 # apply Prisma schema to local postgres
docker compose --profile worker up --build worker
```

## Build the image directly

```bash
# from the repo root (build context = .)
docker build -f apps/worker/Dockerfile -t cineforge-worker .
docker run --env-file .env cineforge-worker
```

## Render (managed worker + Redis)

`render.yaml` is a Blueprint: a Docker **worker** service + a **Key Value**
(Redis) instance. Push to GitHub → Render → *New > Blueprint*, then fill in the
`sync: false` secrets (`DATABASE_URL`, `S3_*`, the AI/provider keys) in the
dashboard. Run `prisma migrate deploy` against `DATABASE_URL` once.

The same image runs on any container host (Fly.io, Railway, ECS, a VM) — provide
`REDIS_URL` + `DATABASE_URL` + the keys. For GPU inference, point
`WAN_GPU_URL`/`HUNYUAN_GPU_URL` at `apps/gpu-worker` (its own CUDA Dockerfile on
RunPod), or set `EXTERNAL_VIDEO_API_URL` for a hosted provider.
