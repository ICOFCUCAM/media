# 00 — Overview

## Vision

Cineforge turns a single natural-language prompt into a finished, streamable
long-form film. It is built to:

- Produce films from **5 minutes to 2+ hours**.
- Run on **self-hosted open-source video models** (Wan 2.1 primary, Hunyuan
  Video premium) on **RunPod A40 48GB** GPUs to keep marginal cost low.
- **Scale from 10 to 1,000,000 users** via stateless services, horizontal
  queue workers, and autoscaled GPU pools.
- Stay **model-agnostic** through an adapter layer so Kling / Veo / CogVideoX /
  future providers plug in without touching the frontend.

## End-to-end flow

```
User prompt
  └─> Director AI ───────────────► Screenplay (acts → scenes → shots)
        │                          Character Bible + World Bible populated
        │                          Continuity Engine state initialized
        ▼
  Scene breakdown (N scenes, ~hundreds for long films)
        ▼
  For each shot:
     Prompt Builder ─► Video Generation (GPU) ─► Quality Checker ─► Storage
     Voice (TTS/clone) ─┐
     Music (mood-aware) ─┼─► Audio mix
     SFX (scene-aware)  ─┘
        ▼
  FFmpeg Render Engine: stitch shots, transitions, audio, subtitles, intro/outro
        ▼
  Final MP4 ─► S3 ─► Streaming (HLS) + Download
```

## Why these choices

| Concern | Choice | Reason |
|---------|--------|--------|
| Frontend | Next.js 14 + Tailwind | SSR, streaming UI, one app for user + admin |
| API | NestJS (TypeScript) | Modular, DI, guards, WS gateway, scales cleanly |
| DB | PostgreSQL + Prisma | Relational continuity data, migrations, typed access |
| Queue | BullMQ + Redis | Mature, observable, supports priorities & flows |
| Models | Adapter pattern | Swap/extend models without frontend changes |
| GPU | RunPod serverless + pods | Idle shutdown, per-second billing, A40 48GB |
| Storage | S3-compatible (MinIO dev) | Cheap, streamable, presigned uploads |
| Render | FFmpeg | Industry standard, scriptable, deterministic |

## Glossary

- **Project** — a user's film, top-level container.
- **Screenplay** — structured story: acts → scenes → shots → dialogue.
- **Scene** — a continuous unit of action in one location/time.
- **Shot** — the atomic generation unit (one clip from the video model).
- **Bible** — canonical, reusable definitions (Character Bible, World Bible).
- **Continuity state** — the evolving truth of who/what/where at story time T.
- **Render job** — assembly of shots+audio into the final or preview cut.
- **GPU worker** — RunPod-hosted service that runs the video model.

## Non-goals (v1)

- Real-time (sub-second) generation. Films render asynchronously.
- Frame-perfect lip-sync at launch (roadmap item).
- Editing timeline UI (roadmap; v1 is prompt-driven with regenerate controls).
