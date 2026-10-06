# 38 — Cineforge Media Engine & DeployPro Infrastructure Architecture

Status: **PROPOSED — for review. No implementation until approved.**
Version: **2** (2026-10-06) · Supersedes nothing; extends docs/12, 22, 23, 25, 28.

| Version | Change |
|---|---|
| 1 | Image Intelligence & Generation Engine; model-neutral Video Engine; registry, router, schemas, queues, GPU, security, billing, identity, continuity, migration, phases (§A–§AE). |
| 2 | **DeployPro** adopted as Cineforge's long-term infrastructure and media-render platform. Added: Cineforge/DeployPro separation of concerns (§0), portability rules (§AF), DeployPro capability and gap analysis from its repository (§AG), `GpuProvider` abstraction (§AH), model-aware GPU scheduling (§AI), media render pipeline (§AJ), `StorageProvider` abstraction (§AK), database portability (§AL), Redis/BullMQ on DeployPro (§AM), private networking (§AN), container deployment model (§AO), control-plane contract (§AP), GPU pool (§AQ), combined product + infrastructure migration roadmap (§AR), requirement traceability for both directives (§AS). Sections A, B, M, N, O, P, Z, AA, AB, AC, AD revised to be provider-neutral. |
| 2.3 | **Synchronized production** (Part IV, §AU): Master Production Clock (integer-µs timebase, rational fps), audio-first planning, Audio Engine, A/V Synchronization Engine and validators, lip-sync validation, music/SFX/ambience anchoring, automatic repair loop, Final Quality Gate, mastering pipeline, production state machine, timeline/audio/sync/repair/version/provenance tables; verified current-code gaps (e.g. silent `-shortest` truncation, 16 vs 24 fps); analysis-tool licenses checked. |
| 2.2 | **Workflow Runtime / ComfyUI integration** (§AT): ComfyUI as an execution runtime behind `WorkflowRuntime` (with `DiffusersRuntime`), versioned Workflow Registry, Workflow Builder, ComfyUI worker design, security, license obligations (ComfyUI is GPL-3.0; its server has no authentication), promotion pipeline; provenance columns added to §J/§K; images, phases, traceability and decisions updated. |
| 2.1 | **Model neutrality clarified** (review directive): the Video Engine names no primary model; Wan 2.2 is the initial license-safe production candidate; LTX and HunyuanVideo are pluggable candidates subject to their licenses. Model **eligibility** dimensions and **lifecycle statuses** added to the registry (§H). Character identity defined as a Cineforge-owned system (§R). GPU security requirements restated as non-negotiable (§O). Universal metering incl. rendering (§Q). |

This document designs (1) a proprietary, self-hosted **Image Intelligence &
Generation Engine**, (2) a **model-neutral Video Engine**, and (3) the path for
all of Cineforge to run on **infrastructure controlled through DeployPro**,
while the current Vercel / Render / RunPod / Supabase environment keeps working
throughout the migration. It extends the architecture that exists today; it
does not replace it.

> **Video Engine is model-neutral.** Wan 2.2 is the initial license-safe
> production candidate. LTX and HunyuanVideo remain pluggable candidates
> subject to their applicable commercial, territorial and usage licenses.
> Wan 2.1 remains the current legacy fallback until the migration criteria
> (§Z) are satisfied. No application code knows — or may depend on — which
> video model is currently in production; the registry and router decide per
> generation (§H).
>
> **Image Engine (proposed, provisional):** Qwen-Image for generation and
> Qwen-Image-Edit for editing / reference images, subject to final
> primary-source license verification; Z-Image-Turbo for drafts; SDXL
> Inpainting for mask-based editing; Real-ESRGAN for upscaling; Depth Anything
> V2 Small for depth control. **No excluded model is used, directly or as a
> hidden dependency** (§C, §D).

> **Synchronized production:** the production timeline is authoritative. One
> Master Production Clock governs picture, dialogue, music, effects, ambience,
> subtitles and events; a film is COMPLETE only after A/V synchronization and
> the Final Quality Gate pass (§AU).
>
> **Workflow runtime:** Cineforge builds versioned, validated workflows from
> production intent and executes them through interchangeable runtimes —
> ComfyUI first, Diffusers and future runtimes through the same
> `WorkflowRuntime` abstraction (§AT). Users never operate raw ComfyUI graphs.

---

## 0. Layering: Cineforge is the application, DeployPro is the infrastructure

```
                         DEPLOYPRO
                             │
              ┌──────────────┼──────────────┐
              │              │              │
           COMPUTE        STORAGE        NETWORK
              │              │              │
       ┌──────┼──────┐       │              │
       │      │      │       │              │
      CPU    GPU    GPU      │          CDN / TLS
       │      │      │       │
       └──────┼──────┘       │
              │              │
              └──────┬───────┘
                     │
                  CINEFORGE
                     │
       ┌─────────────┼─────────────┐
       │             │             │
     IMAGE         VIDEO         AUDIO
    ENGINE        ENGINE        ENGINE
       │             │             │
       └─────────────┼─────────────┘
                     │
                FINAL MEDIA
```
**No permanent public-render dependency.** Render, Vercel and RunPod may be
used temporarily during development and migration; no new Cineforge service is
designed around them.

| Cineforge owns | DeployPro owns / controls |
|---|---|
| creative intelligence | compute (CPU and GPU) |
| projects | GPU infrastructure |
| characters | workers (placement, lifecycle) |
| worlds | networking (edge, private network, TLS) |
| scenes | deployment (images, releases, rollbacks) |
| shots | storage infrastructure (object storage, volumes, backups) |
| images | scaling |
| videos | service orchestration |
| models (which model, which version, licenses, routing) | resource management (which machine, which GPU) |
| generation orchestration (jobs, retries, fairness, billing) | logs, metrics, health, secrets, domains, deployment history, resource usage |
| production workflows | |
| assets | |
| user experience | |

Contract between the two: **Cineforge asks for capabilities, never machines.**
It says "give me a GPU capable of running model version X with ≥ N GB VRAM
for an estimated T ms at priority P"; it never says "run this on
192.168.x.x". DeployPro decides where the job runs (§AP, §AI).

The same split makes DeployPro reusable for other applications: Cineforge is
the film-production operating system; DeployPro is the infrastructure
operating system.

> **Read §D and §E first.** License verification surfaced three findings that
> change what can ship, independent of model quality:
> 1. **LTX-2 / LTX-2.x** forbids use "in any product, service, or application
>    that directly competes with Licensor's commercial products or services"
>    (Attachment A, item 20) without a separate commercial license, and requires
>    a paid license at ≥ US$10M annual revenue (affiliates aggregated).
>    Lightricks sells **LTX Studio**, an AI storyboard-to-film product — the
>    same category as Cineforge. **LTX cannot go to production without a written
>    commercial agreement with Lightricks (or a legal opinion that item 20 does
>    not apply).**
> 2. **HunyuanVideo (incl. 1.5)** is under the Tencent Hunyuan Community
>    License, whose Territory **excludes the European Union, the United Kingdom
>    and South Korea**, and which forbids using Outputs "to improve any other AI
>    model". It can only be offered to users outside those regions, and its
>    outputs can never feed Cineforge's own model training (Phase 16).
> 3. **Wan 2.1 / 2.2 are Apache-2.0** with no field-of-use, territory or
>    revenue restriction. Wan 2.2 is therefore the **leading production
>    candidate** pending the final technical benchmark; Wan 2.1 stays the
>    legacy fallback.

---

## A. Executive architecture

```
                              CINEFORGE (Next.js · Vercel)
                                         │  Supabase Auth · RLS · Realtime
                                         ▼
                    ┌────────────── SUPABASE (Postgres · Storage) ──────────────┐
                    │  projects · scenes · shots · characters · locations ·     │
                    │  world_objects · image_generations* · video_generations*  │
                    │  character_identities* · entity_images* · usage_records   │
                    └───────────────────────────┬───────────────────────────────┘
                                                │ row-first claim (existing poller)
                                                ▼
   WORKER (Node · BullMQ · Redis · Render)
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ CREATIVE INTELLIGENCE                 MEDIA ORCHESTRATOR                  │
   │  Director (existing)                  ImageEngine*   VideoEngine*         │
   │  Context Compiler* ──────────────────▶ (one run() per generation row)     │
   │  (project/scene/shot/character/       │                                   │
   │   world/cinematography bibles)        ▼                                   │
   │                                 MODEL ROUTER* (policy, plan, territory,   │
   │                                 license, capability, load, cost)          │
   │                                       ▼                                   │
   │                                 MODEL REGISTRY* (models · versions ·      │
   │                                 licenses · deployments)                   │
   │                                       ▼                                   │
   │                                 ADAPTERS (Image* / Video)                 │
   │                                       ▼                                   │
   │                                 GPU ORCHESTRATOR (existing packages/gpu,  │
   │                                 extended: pools per deployment)           │
   └───────────────────────────────────────┬──────────────────────────────────┘
                                           │ signed request (JWT, §O) +
                                           │ presigned storage URLs (§P)
                                           ▼
   GPU PROVIDER (GpuProvider abstraction §AH: RunPod today → DeployPro target)
   one model per GPU worker, existing apps/gpu-worker pattern
   ┌───────────────┬───────────────┬────────────────┬───────────────────────┐
   │ image pool    │ video pool    │ video pool     │ video pool (legacy)   │
   │ cf-image      │ 24–48 GB      │ 80 GB          │ Wan 2.1 fallback      │
   │ (Qwen, Z-Img) │ Wan 2.2 cand. │ Wan 2.2 A14B · │                       │
   │               │               │ LTX† · Hunyuan‡│                       │
   └───────────────┴───────────────┴────────────────┴───────────────────────┘
   † license_required (commercial-license review)  ‡ restricted (territory)
   Pools are named by GPU capability, never by a "primary" model; the router
   decides per generation which eligible version runs (§H).
                                           │
                                           ▼
     STORAGE PROVIDER (StorageProvider abstraction §AK: Supabase Storage today →
     DeployPro object storage target)   {bucket}/projects/{projectId}/…
   (* = new)
```

Target end state on DeployPro (the transitional providers above are adapters
behind the same interfaces):

```
                         INTERNET
                            │
                            ▼
                     DEPLOYPRO EDGE
                            │
                    ┌───────┴───────┐
                    │               │
                 CINEFORGE       OTHER APPS
                    │
              ┌─────┴─────┐
              │            │
           WEB/API      CONTROL
              │            │
              └─────┬──────┘
                    │
              PRIVATE NETWORK
                    │
        ┌───────────┼────────────┐
        │           │            │
     DATABASE      REDIS       STORAGE
        │           │            │
        └───────────┼────────────┘
                    │
                 BULLMQ
                    │
              DEPLOYPRO
               SCHEDULER
                    │
       ┌────────────┼────────────┐
       │            │            │
   CPU WORKERS   GPU WORKERS   RENDER WORKERS
                    │
          ┌─────────┼──────────┐
          │         │          │
        IMAGE      VIDEO      AUDIO
        ENGINE     ENGINE     ENGINE
          │         │          │
          │       ┌─┴────┐     │
          │       │      │     │
          │      LTX  Hunyuan  │
          │       │      │     │
          └───────┴──────┴─────┘
                    │
               MEDIA OUTPUT
   (model names in this diagram are pluggable candidates, eligible only per
    their license status and the registry rules in §H)
                    │
                 STORAGE
                    │
                 CINEFORGE
```

Unified creative/production layering inside Cineforge (unchanged by the
infrastructure move):

```
                         CINEFORGE
                             │
                ┌────────────┴────────────┐
                │                         │
       CREATIVE INTELLIGENCE       MEDIA ORCHESTRATOR
                │                         │
        ┌───────┼────────┐        ┌───────┼────────┐
        │       │        │        │       │        │
    CHARACTER  WORLD    STORY   IMAGE   VIDEO    AUDIO
     ENGINE   ENGINE   ENGINE  ENGINE  ENGINE   ENGINE
        │       │        │        │       │
        └───────┼────────┘        │       │
                │                 │       │
                └────────┬────────┘       │
                         │                │
                    MODEL REGISTRY        │
                         │                │
               ┌─────────┴─────────┐      │
               │                   │      │
          IMAGE MODELS        VIDEO MODELS
               │                   │
          Self-hosted          LTX
          Model A              HunyuanVideo
          Model B              Future
               │                   │
               └─────────┬─────────┘
                         │
                   GPU ORCHESTRATOR
                         │
              ┌──────────┼──────────┐
              │          │          │
             GPU        GPU        GPU
              │          │          │
              └──────────┼──────────┘
                         │
                    ASSET SYSTEM
                         │
                    CINEFORGE
```
PROJECT → STORY → SCENE → CHARACTER → WORLD → LOCATION → SHOT → STORYBOARD →
IMAGE → VIDEO → AUDIO → EDIT → MASTER all share the same project context,
identity, continuity and asset system.

Principles:
- **The product never names a model.** UI and job code ask for an operation and
  a quality class; the router picks a model version from the registry.
- **Row-first, idempotent.** Every generation is a database row before it is a
  job; workers claim rows exactly once; every GPU call is reproducible from the
  row (prompt, parameters, model version, seed, inputs).
- **License is a routing input**, not a footnote: a model whose license does not
  cover the user's territory or Cineforge's use is never selected.
- **GPU pods hold no secrets beyond their own auth key** and no storage
  credentials: inputs and outputs move via presigned URLs.
- **Infrastructure is an adapter.** Compute (GPU and CPU), object storage,
  Redis, Postgres hosting, edge/TLS and deployment are reached through
  provider-neutral interfaces (`GpuProvider`, `StorageProvider`, standard
  Postgres/Redis URLs, Docker images). RunPod, Supabase Storage, Render and
  Vercel are today's adapters; DeployPro is the target adapter (§AF–§AS).

---

## B. Current → target mapping

| Concern | Today | Target | Change type |
|---|---|---|---|
| Web app | Next.js 14, browser → Supabase | same | none |
| Job trigger | browser inserts rows; `project-poller.ts` claims; BullMQ | same; poller also claims `image_generations` | extend |
| Queues | film, scene, video, audio, render, localize, lora, publish, social, voice-lab | + `image`; `video` processor delegates to VideoEngine | extend |
| Video adapters | `VideoModelAdapter` + `ModelRegistry` (wan, hunyuan, fal, external) | same interface, + versions/licenses/deployments, + router | extend |
| Image adapters | `ImageModelAdapter` (prompt, size) → OpenAI only | new `ImageModelAdapter` v2 + `ImageModelRegistry` | replace interface (keep OpenAI as adapter during migration) |
| Seed frames | `resolveSeedKey` → gpt-image-1 | `resolveSeedKey` → ImageEngine → router → self-hosted | rewire |
| GPU service | `apps/gpu-worker` FastAPI, `/generate`, no auth | same codebase, multi-modality build, versioned `/v1/*`, mandatory auth | extend + fix |
| GPU lifecycle | `packages/gpu` (lifecycle, cluster, fairness) keyed by model | keyed by **deployment** (model version × pool) | extend |
| Storage | Supabase S3 API; pods hold bucket-wide keys; clips under `_generated/` | presigned URLs; outputs under `projects/{id}/…` | fix |
| Credits | debit `gpu_ms` for video only | metered `usage_records` for every kind; credit holds | extend |
| Character identity | `characters.lora_key` + stub trainer | `character_identities` (versioned) + real trainer | extend |
| Routing policy | `policy.ts` hard-codes `wan-2.1`/`hunyuan` × tier (no `AGENCY`) | DB-configured routing policies | replace |
| NestJS `apps/api` | legacy, not deployed (own JWT secret) | becomes `cineforge-api` only when Supabase-specific browser paths move behind a service boundary (§AL, §AO); auth switched to Supabase/GoTrue JWT verification | reuse later |

Infrastructure mapping (current provider → portable abstraction → DeployPro target):

| Layer | Current (development) | Portable abstraction | DeployPro target | Coupling found in code today |
|---|---|---|---|---|
| Web hosting | Vercel | Docker image `cineforge-web` (`next build`, standalone `next start`) | DeployPro web process + edge (Traefik, TLS) | `VERCEL_ENV`, `VERCEL_GIT_COMMIT_*`, `VERCEL_PROJECT_PRODUCTION_URL` in `PreviewBuildBadge.tsx` and `app/layout.tsx` (preview badge, noindex) → map to `DEPLOYPRO_ENV` / `DEPLOYPRO_GIT_SHA` / `DEPLOYPRO_URL` |
| Background workers | Render worker (`render.yaml`, `apps/worker/Dockerfile`) | Docker image `cineforge-worker` | DeployPro worker process (`--replicas N`) | none in code; only `render.yaml` |
| Queue | Render Key Value (Redis, free plan, no persistence) | `REDIS_URL` + BullMQ | Redis container on DeployPro private network, persistent volume | none |
| GPU | RunPod pods via proxy URLs; `packages/gpu/runpod-control.ts`, `RunpodClient` | `GpuProvider` / `GpuProviderAdapter` (§AH) | DeployPro GPU orchestrator + GPU node agents | `RUNPOD_*` env, `runpod-control.ts`, `RunpodClient` naming, `WAN_GPU_URL(S)`/`HUNYUAN_GPU_URL(S)` |
| Object storage | Supabase Storage (S3 API for worker/GPU; supabase-js for browser) | `StorageProvider` / `StorageAdapter` (§AK) | DeployPro S3-compatible object storage | browser `sb.storage.from(...).upload/createSignedUrl(s)`; worker `S3Storage` (already S3-generic); GPU boto3 |
| Database | Supabase Postgres (+ Auth, PostgREST, Realtime, RLS with `auth.uid()`) | PostgreSQL + Supabase-specific features behind a service boundary (§AL) | Postgres (+ self-hosted Supabase services, or `cineforge-api`) on DeployPro | `auth.uid()` in RLS; supabase-js from browser; Realtime channels; Prisma in worker (portable) |
| Serverless functions | Supabase Edge Functions (Deno): `stripe-checkout`, `stripe-webhook`, `team-invite` | HTTP handlers in `cineforge-api` | DeployPro web/API process | `/functions/v1/*` calls in `PricingPage.tsx`, `TeamsPage.tsx` |
| Secrets | Vercel / Render / RunPod / Supabase dashboards | env vars injected at runtime | DeployPro encrypted env (Fernet, per environment) | none |

---

## C. Image model shortlist

Evaluated against the 16 criteria in the directive. "Verified" = read from the
model's official repository on 2026-10-06 (§D). Quality/speed ratings are
**pre-benchmark expectations** and are re-scored in the Phase 5 bake-off (§AE).

| Model | License (verified) | Commercial use | Local | VRAM (bf16, est.) | T2I | I2I / Edit | Inpaint | Outpaint | Ref images | LoRA | Control | Speed | Quality | Cinematic | Production fit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Qwen-Image** (+ **Qwen-Image-Edit-2511**) | Apache-2.0 ✅ | Yes, unrestricted | Yes | ~40–56 GB; FP8/offload lower | ✅ | ✅ instruction edit | via diffusers inpaint pipeline (verify) | via canvas + inpaint (verify) | ✅ multi-image (2+) | ✅ | not native (per repo); edit model accepts structure via image | Medium; Lightning/LightX2V distills fast | High; strongest text rendering | High | **High** — diffusers day-0, ComfyUI native, active releases |
| **Z-Image-Turbo / Z-Image** (6B) | Apache-2.0 ✅ (Edit/Omni "pending") | Yes | Yes | **≤16 GB** (Turbo) | ✅ | Edit model pending | — | — | — | ✅ (base for fine-tune) | — | **Very fast** (8 NFE) | High photoreal | Medium-High | **High** for drafts; editing not yet released |
| **FLUX.2 [klein] 4B** | Apache-2.0 ✅ | Yes | Yes | ~8 GB | ✅ | ✅ single + multi-ref | — | — | ✅ multi-ref | ✅ | — | Fast | Medium-High | Medium | Medium-High (new) |
| FLUX.2 [klein] 9B / FLUX.2 [dev] | FLUX Non-Commercial ❌ | **No** (service use) | — | — | — | — | — | — | — | — | — | — | High | High | **Excluded** |
| FLUX.1 [dev] / Fill / Kontext / Depth / Canny / Redux / Krea | FLUX.1-dev Non-Commercial ❌ | **No** for production service (outputs OK, model use not) | — | — | — | — | — | — | — | — | — | — | High | High | **Excluded** |
| FLUX.1 [schnell] | Apache-2.0 ✅ | Yes | Yes | ~24–33 GB | ✅ | weak | — | — | — | ✅ | community | Fast (4 step) | Medium | Medium | Low-Medium (aging; no official fill/edit under Apache) |
| SDXL 1.0 (+ inpainting ckpt) | CreativeML Open RAIL++-M ✅ | Yes (use restrictions) | Yes | ~10–12 GB | ✅ | ✅ | ✅ **mature mask inpaint** | ✅ | IP-Adapter (non-face) | ✅ | ✅ ControlNet ecosystem | Fast | Medium (dated) | Medium | **High as inpaint/outpaint utility** |
| SD 3.5 Large/Medium | Stability Community License (**unverified** — source blocked) | Reportedly revenue-capped | Yes | ~18–24 GB | ✅ | ✅ | ✅ | — | — | ✅ | ✅ | Medium | Medium-High | Medium | **Not recommended** until verified; revenue cap risk |
| HiDream-I1 (Full/Dev/Fast) | MIT ✅ — **but requires Llama-3.1-8B-Instruct** (Llama license) | Yes, with Llama terms | Yes | ~40+ GB | ✅ | E1 edit (license not stated) | — | — | — | ✅ | — | Slow | High | High | Medium (dual-license dependency) |
| HunyuanImage (2.x/3.0) | Tencent Hunyuan Community (territory-restricted, per family license) | **Not in EU/UK/KR** | Yes | very large | ✅ | ✅ | — | — | — | — | — | Slow | High | High | **Excluded** (territory) |

Supporting models (verified):

| Component | Use | License | Verdict |
|---|---|---|---|
| Depth Anything V2 **Small** | depth control maps | Apache-2.0 ✅ | Use |
| Depth Anything V2 Base/Large/Giant | depth | CC-BY-NC-4.0 ❌ | Exclude |
| Real-ESRGAN | image upscaling | BSD-3-Clause ✅ | Use |
| InsightFace pretrained models (buffalo_l, antelopev2) | face embeddings | "non-commercial research purposes only" ❌ (commercial license available on request) | Exclude — this rules out **InstantID, PuLID, IP-Adapter-FaceID** and similar face-ID adapters unless we buy an InsightFace commercial license |
| Pose estimators (DWPose, OpenPose) | pose control | **not verified** | Verify before Phase 11 |

### Recommendation

**Proposed primary image model: Qwen-Image (T2I) + Qwen-Image-Edit-2511 (edit /
reference / identity), served as one "cf-image" family — subject to final
primary-source license verification** (archived license text for the exact
weights revision deployed, including its bundled components; see "No hidden
dependencies" below).
Reasons, in order: Apache-2.0 with no field, territory or revenue restriction;
the only shortlisted family that already combines high-quality T2I, instruction
editing, **multi-image reference input** and documented **character-identity
preservation** — the exact needs of storyboards and character continuity;
strongest text rendering (posters, key art, signage in frames); diffusers and
ComfyUI support from day 0; distilled fast variants exist.

**Draft / high-throughput model: Z-Image-Turbo** (Apache-2.0, 6B, 8 steps, fits
16 GB). Used for storyboard previews and bulk thumbnails; re-rendered with the
primary when the creator locks a frame.

**Mask inpaint / outpaint utility: SDXL inpainting** (Open RAIL++-M) until the
Qwen inpaint path is proven in the bake-off; **Real-ESRGAN** for upscaling;
**Depth Anything V2 Small** for depth control.

**Watch list:** FLUX.2 [klein] 4B (Apache, multi-ref, 8 GB) as a compact
alternative; Z-Image-Edit when released; Qwen-Image-2.0 (announced).

The registry makes any of these a configuration change, not a rewrite.

### No hidden dependencies

No excluded model may enter Cineforge indirectly. A model version is
registered only when **every component it loads** has a verified,
commercially compatible license recorded in `model_licenses`:
- text encoders (e.g. the vision-language/LLM encoders bundled with
  Qwen-Image, Z-Image or HiDream — HiDream's Llama-3.1 dependency is an
  example of a second license),
- VAEs, schedulers, tokenizers, safety checkers,
- ControlNets / adapters / preprocessors (depth: Depth Anything V2 **Small**
  only; pose estimators unverified → not used),
- LoRAs and identity adapters (no InsightFace-based face-ID adapters, §R),
- upscalers (Real-ESRGAN, BSD-3-Clause).

The GPU worker build fails if a backend references weights whose license id is
not in the approved list (enforced in the image build manifest), and ComfyUI
workflows, if ever used, are pinned and scanned for the same rule.

---

## D. Image model license verification

Method: licenses read on 2026-10-06 from each model's **official repository**
(GitHub org of the publisher, LICENSE files and README license tables). The
Hugging Face hub and stability.ai are blocked from the environment this was
written in; any license whose only primary source is on those hosts is marked
**unverified** and must be re-checked (and archived as PDF) before integration.

| Model | Source read | Finding |
|---|---|---|
| FLUX.1 [schnell] | github.com/black-forest-labs/flux README license table | `apache-2.0` |
| FLUX.1 [dev], Fill, Canny, Depth, Redux, Kontext, Krea | same table + `model_licenses/LICENSE-FLUX1-dev` | FLUX.1-dev Non-Commercial; Non-Commercial Purpose = no "direct or indirect payment"; "You may use Output for any purpose (including for commercial purposes)" but the **model** may not be used commercially without a BFL license |
| FLUX.2 [klein] 4B / 4B Base | github.com/black-forest-labs/flux2 | `apache-2.0` |
| FLUX.2 [klein] 9B, [dev] | same | FLUX Non-Commercial License |
| Qwen-Image, Qwen-Image-Edit (2509, 2511) | github.com/QwenLM/Qwen-Image | "Qwen-Image is licensed under Apache 2.0"; Edit releases under the same license |
| Z-Image (Turbo, base) | github.com/Tongyi-MAI/Z-Image | Apache-2.0; Edit / Omni-Base "Apache-2.0 (pending)" |
| SDXL 1.0 | Stability-AI/generative-models `model_licenses/LICENSE-SDXL1.0` | CreativeML Open RAIL++-M; royalty-free, commercial OK, Attachment A use restrictions |
| SD 3.5 | official license on stability.ai / HF (blocked) | **UNVERIFIED** |
| HiDream-I1 | github.com/HiDream-ai/HiDream-I1 | MIT; requires Meta-Llama-3.1-8B-Instruct ("agree to the license of the Llama model") |
| InsightFace models | github.com/deepinsight/insightface | code MIT; models "non-commercial research purposes only" |
| Depth Anything V2 | github.com/DepthAnything/Depth-Anything-V2 | Small Apache-2.0; Base/Large/Giant CC-BY-NC-4.0 |
| Real-ESRGAN | github.com/xinntao/Real-ESRGAN | BSD-3-Clause |

Governance: every model version in the registry carries a `license_id`
referencing an archived copy of the license text (stored in
`cineforge-assets/_legal/licenses/{license_id}.pdf`, admin-only), the date it was
read, the reviewer, and computed flags (`commercial`, `territory_excludes`,
`revenue_cap_usd`, `outputs_trainable`, `competing_use_restricted`). The router
enforces those flags (§H).

---

## E. Video model shortlist

| Model | License (verified) | Commercial | Territory | Revenue cap | Competing-use clause | Outputs may train our models | T2V | I2V | Max res / len (vendor) | VRAM | Diffusers | Fit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **LTX-2 / LTX-2.x** (incl. LTX-2.5) | LTX-2(.x) Community License (Jan 5 / Aug 11 2026) | Free < US$10M revenue (affiliates aggregated); paid above | Worldwide | **US$10M** | **Yes — item 20** | Restricted by use policy | ✅ | ✅ (+A2V, V2V, synced audio) | up to 4K, 24 fps | FP8/offload options; 13B-class | ComfyUI official; diffusers not stated for LTX-2 | **Technically excellent; legally gated** |
| LTX-Video 0.9.x (2B 0.9.5) | OpenRail-M (README: "New license for commercial use (OpenRail-M)") | Yes (use restrictions) | Worldwide | none stated | none stated | per OpenRAIL | ✅ | ✅ | < 720×1280 best; up to 60 s (long-gen) | 2B distilled very low | ✅ | Viable stop-gap; quality below LTX-2 |
| LTX-Video 13B 0.9.7/0.9.8 | license file on HF (blocked) | **UNVERIFIED** | — | — | — | — | ✅ | ✅ | HD in ~10 s on H100 (distilled) | high | ✅ | Verify |
| **HunyuanVideo / 1.5** | Tencent Hunyuan Community License | Yes; >100M MAU needs license | **Excludes EU, UK, South Korea** | — | — | **No** ("must not use … Output … to improve any other AI model") | ✅ | ✅ (I2V) | 1.5: 480p/720p native, 1080p via SR | 1.5: min 14 GB with offload; v1: 45–60 GB | ✅ | Premium **outside EU/UK/KR only** |
| **Wan 2.2** (TI2V-5B, T2V/I2V-A14B, S2V, Animate) | Apache-2.0 | Yes, unrestricted | Worldwide | none | none | Yes | ✅ | ✅ | 720p | TI2V-5B: 24 GB; A14B 720p: 80 GB | ✅ | **License-safe primary candidate** |
| Wan 2.1 (current) | Apache-2.0 ("We claim no rights over the your generated contents") | Yes | Worldwide | none | none | Yes | ✅ | ✅ (I2V-14B) | 480p/720p | 1.3B: 8.19 GB | ✅ | Legacy / fallback |

### Video strategy — model-neutral

**Video Engine is model-neutral. Wan 2.2 is the initial license-safe
production candidate. LTX and HunyuanVideo remain pluggable candidates subject
to their applicable commercial, territorial and usage licenses.**

The application never knows which video model is in production. Jobs ask the
VideoEngine for an operation and a quality class; the router (§H) selects an
eligible model version per generation. Changing the production model is a
registry change (status and routing policy), never a code change.

Initial registry classification (lifecycle statuses defined in §H):

| Model version(s) | Initial status | Why | Path to `production` |
|---|---|---|---|
| Wan 2.2 (TI2V-5B, T2V/I2V-A14B) | **`production_candidate`** (leading) | Apache-2.0: no field-of-use, territory or revenue restriction | pass the final technical benchmark (§AE) → canary → `production` |
| LTX-2 / LTX-2.x | **`license_required`** (evaluation as `candidate` only, internal accounts) | LTX-2(.x) Community License: competing-use clause (Attachment A item 20) and US$10M revenue threshold | written Lightricks commercial agreement or counsel opinion recorded on the license (`agreement_ref`) → `production_candidate` → benchmark → canary |
| HunyuanVideo / 1.5 | **`restricted`** with `territory_blocked` for EU, UK, KR | Tencent Hunyuan Community License: Territory excludes EU/UK/KR; outputs may not improve other models | eligible only where the license permits; never for users in excluded territories; outputs `outputs_trainable=false` |
| Wan 2.1 (T2V-1.3B, current) | **`production`** (legacy fallback) | current live engine, Apache-2.0 | → `deprecated` → `retired` when §Z removal criteria are met |
| fal "cinematic" (third-party API) | `production` (transitional) | existing premium path | → `deprecated` once a self-hosted model covers the cinematic class |

1. **LTX license review:** obtain a written commercial agreement from
   Lightricks covering Cineforge's use (resolving item 20 and the $10M
   threshold), or a counsel opinion that Cineforge is not "directly
   competing". Until then LTX runs only in internal evaluation.
2. **Wan 2.2 benchmark** (TI2V-5B and A14B) in the same bake-off as every
   candidate; if it passes, it becomes `production` for the standard class.
3. **HunyuanVideo** is registered with `territory_excludes = [EU, UK, KR]`; the
   router never assigns it to users in those regions (determined by billing
   country, §H), and its outputs are tagged `outputs_trainable = false` so the
   Model Lab can never ingest them.

---

## F. LTX integration strategy (pluggable candidate — `license_required`)

LTX is integrated as a **candidate** only. Everything below is the technical
plan for when (and if) its license status allows production use; until then
it runs in internal evaluation.


- **Deployment unit:** a new GPU image target `cf-gpu-video-ltx` built from
  `apps/gpu-worker` (shared server, auth, storage, observability modules; one
  model package per image). Pinned diffusers/ComfyUI-free runtime first; if
  LTX-2 requires its own inference package (official repo + ComfyUI nodes),
  wrap the vendor pipeline behind the same `VideoBackend` Python protocol.
- **Model versions registered:** `ltx/2.5-distilled` (draft), `ltx/2.5`
  (standard), optional `ltx/2.5-hq` (more steps / spatial upscaler). Quality
  classes map to *configurations of one deployment* (steps, guidance, upscaler)
  where possible, so draft vs standard does not need separate pods.
- **Capabilities declared:** T2V, I2V (seed frame = storyboard image), V2V
  (extend/style), keyframe conditioning, synchronized audio (disabled
  initially; Cineforge's audio engine stays authoritative), max duration,
  resolutions, fps.
- **Seed-frame contract:** storyboard images from the Image Engine are the
  default I2V conditioning; aspect ratio and resolution are chosen so the
  image needs no re-crop (ImageEngine renders at the video model's preferred
  buckets, read from capabilities).
- **Identity:** LoRA support via the Character Identity Engine (§R) — LTX
  LoRAs are trained per model family; identity remains reference-image-driven
  for models without a trained LoRA.
- **Rollout (only after license clearance):** shadow → internal → canary percentages set by routing policy (§Z). LTX has no reserved "primary" role; it competes on the same benchmark and eligibility rules as every candidate.

## G. HunyuanVideo integration strategy (pluggable candidate — `restricted` / `territory_blocked`)

Available only where its license permits use.


- Already present as `HunyuanAdapter` + `MODEL_NAME=hunyuan`. Upgrade target is
  **HunyuanVideo 1.5** (8.3B; 480p/720p native; 1080p SR; step-distilled I2V;
  diffusers + ComfyUI), which cuts VRAM from 45–60 GB to a 24–48 GB class.
- Registered as `hunyuan/1.5` (standard) and `hunyuan/1.5-sr1080` (cinematic,
  with super-resolution pass), class `premium`.
- **License enforcement:** `territory_excludes=[EU,UK,KR]`,
  `outputs_trainable=false`. Router excludes it for users whose billing country
  (or, absent billing, signup geo) falls in those territories; the UI shows the
  cinematic option as "not available in your region" rather than silently
  substituting.
- Existing v1 deployment stays until 1.5 passes the bake-off.

---

## H. Model Registry design

Two layers: a **code-defined catalog** (what an adapter *can* run) and a
**DB-configured registry** (what is *enabled*, where it runs, who may use it).
The worker loads the DB layer at start and refreshes every 60 s (or on a
`registry_changed` Postgres NOTIFY).

```
media_models            one row per model family      (qwen-image, ltx, hunyuan-video, wan, sdxl-inpaint…)
media_model_versions    pinned weights + capabilities (qwen-image/2511-edit, ltx/2.5-distilled, wan/2.1-t2v-1.3b…)
model_licenses          archived license + flags      (apache-2.0, ltx-2x-community, tencent-hunyuan-community…)
media_model_deployments where a version runs          (pool, GPU type, endpoint URLs, RunPod ids, min/max pods, status)
routing_policies        configurable routing rules    (ordered, JSON conditions → candidate list)
```

### Tables (DDL sketch — design, not migration)

```sql
create table public.model_licenses (
  id text primary key,                         -- 'apache-2.0', 'ltx-2x-community-2026-08'
  name text not null,
  source_url text not null,                    -- primary source read
  archived_key text,                           -- _legal/licenses/{id}.pdf
  read_at date not null,
  reviewed_by text,
  commercial boolean not null,
  revenue_cap_usd bigint,                      -- null = none
  territory_excludes text[] not null default '{}',  -- ISO-3166 / 'EU'
  outputs_trainable boolean not null,          -- may outputs train Cineforge models
  competing_use_restricted boolean not null default false,
  agreement_ref text,                          -- signed commercial agreement, if any
  notes text
);

create table public.media_models (
  id text primary key,                         -- 'qwen-image', 'ltx', 'hunyuan-video', 'wan'
  kind text not null check (kind in ('image','video','audio','upscale','control','embedding')),
  family text not null,
  display_name text not null,
  status text not null default 'enabled' check (status in ('enabled','disabled'))  -- lifecycle lives on versions
);

create table public.media_model_versions (
  id text primary key,                         -- 'ltx/2.5-distilled'
  model_id text not null references public.media_models(id),
  version text not null,                       -- weights revision / commit sha
  weights_uri text not null,                   -- repo@revision or s3 key
  license_id text not null references public.model_licenses(id),
  class text not null check (class in ('draft','standard','premium','cinematic','utility')),  -- quality class it serves; "legacy" is a status, not a class
  capabilities jsonb not null,                 -- ImageModelCapabilities | VideoModelCapabilities
  defaults jsonb not null default '{}',        -- steps, guidance, scheduler…
  cost_model jsonb not null default '{}',      -- est gpu-ms per megapixel / per second
  status text not null default 'candidate' check (status in
    ('candidate',            -- registered, internal evaluation only
     'production_candidate', -- license-cleared, eligible for benchmark + canary
     'production',           -- eligible for general routing
     'restricted',           -- eligible only where license_rules allow (e.g. territory)
     'license_required',     -- blocked until a license/agreement is recorded
     'territory_blocked',    -- version-wide block (use territory rules for partial blocks)
     'deprecated',           -- fallback only; not chosen when an eligible alternative exists
     'retired')),            -- never routed; kept for provenance
  canary_percent int not null default 0 check (canary_percent between 0 and 100),
  product_usage text[] not null default '{}',  -- uses permitted by license + policy: 'storyboard','character','poster','video_shot','training_data'…
  internal_policy jsonb not null default '{}',  -- e.g. {"plans":["STUDIO","ENTERPRISE"],"maxDurationSec":10,"adminOnly":false}
  created_at timestamptz not null default now()
);

create table public.media_model_deployments (
  id text primary key,                         -- 'ltx-h100-pool-a'
  version_id text not null references public.media_model_versions(id),
  pool text not null,                          -- logical pool by capability, e.g. 'image', 'video-48g', 'video-80g', 'video-legacy' (never 'primary')
  gpu_type text not null,                      -- 'L40S','A40','A100-80','H100'
  endpoints text[] not null default '{}',      -- base URLs (never sent to browsers)
  runpod jsonb not null default '{}',          -- pod/endpoint ids, template, volume
  min_pods int not null default 0,
  max_pods int not null default 1,
  status text not null default 'enabled'
);

create table public.routing_policies (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image','video')),
  priority int not null,                       -- lower = evaluated first
  name text not null,
  conditions jsonb not null,                   -- see RoutingCondition
  candidates text[] not null,                  -- ordered version ids
  rollout_percent int not null default 100 check (rollout_percent between 0 and 100),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
```
RLS: all five tables are **admin-only** (`is_admin()`); the browser reads a
filtered, license-safe projection through a `available_models(kind)` SECURITY
DEFINER RPC that returns only display names, classes and capabilities for the
caller's plan and territory — never endpoints.

### Eligibility, then routing (both modalities)

The architecture **never requires application code to know which model is
currently primary**. A model version is first tested for **eligibility** for
this specific generation; only eligible versions are scored.

Eligibility dimensions (all must pass; each failure is recorded with its reason):

| Dimension | Source | Rule |
|---|---|---|
| territory | `model_licenses.territory_excludes`, version `status=territory_blocked` | user's billing country (signup geo if no billing) not excluded |
| commercial eligibility | `model_licenses.commercial`, `revenue_cap_usd`, `competing_use_restricted`, `agreement_ref` | commercial use permitted for Cineforge now (cap not exceeded, competing-use resolved by agreement) |
| license status | `media_model_versions.status` ∈ {`production`, `production_candidate` within canary %, `restricted` within its rules, `deprecated` only as fallback}; `license_required`/`retired`/`candidate` excluded (candidate allowed for admin evaluation accounts) | |
| product usage | `media_model_versions.product_usage` | the generation's purpose (storyboard frame, character portrait, poster, video shot, training data…) is a permitted use |
| model version | pinned version id + weights revision | only versions registered and verified; `outputs_trainable` checked when purpose = training data |
| deployment availability | `media_model_deployments` + `GpuProvider.capacity()` | at least one enabled deployment can accept work (or queue within SLA) |
| generation type | capabilities | operation, resolution, duration, references, mask, LoRA family supported |
| account / plan | `internal_policy.plans`, routing policy conditions | plan allowed; per-plan limits |
| internal policy | `internal_policy`, routing policy, admin kill-switch | e.g. admin-only, max duration, safety holds, incident disable |

```
eligible = [v for v in candidates(policy) if all(dimension_ok(v, request))]
for v in eligible:
    score = w_quality·quality_class + w_cost·(1/est_gpu_ms) + w_load·(1/queue_depth)
            + w_warm·is_warm + w_pref·(v == user_preference)
pick max score
if none eligible: next matching policy; else ROUTE_UNAVAILABLE (with reasons)
```
Canary: a `production_candidate` receives `canary_percent` of eligible
traffic by stable hash of user id; promotion to `production` and demotion to
`deprecated` are registry updates.

Request context: `{ kind, operation, plan, userId, country, quality, width,
height, durationSec, hasRefImages, hasMask, loraFamilies, projectRequirements,
userPreferredModel? }`. Every decision is persisted on the generation row
(`routing` jsonb: policy id, candidates considered, rejections with reasons) so
"why did this run on X" is always answerable.

Seed policies (illustrative only — prices and final mapping are not decided):
| Policy | Conditions | Candidates |
|---|---|---|
| storyboard-draft | image, quality=draft | z-image/turbo, qwen-image/lightning |
| storyboard-final | image, quality=standard | qwen-image/2511-edit (refs) · qwen-image/base |
| video-draft | video, quality=draft | wan/2.2-ti2v-5b · wan/2.1-t2v-1.3b · ltx/2.5-distilled (only if eligible) |
| video-standard | video, quality=standard | wan/2.2-a14b · wan/2.2-ti2v-5b · wan/2.1 · ltx/2.5 (only if eligible) |
| video-cinematic | video, quality=cinematic, plan∈{STUDIO,AGENCY,ENTERPRISE} | wan/2.2-a14b · hunyuan/1.5-sr1080 (only where license permits) · ltx/2.5-hq (only if eligible) · fal cinematic (transitional) |

Candidate order is configuration; ineligible versions are skipped
automatically, so listing a candidate never makes it a dependency.

---

## I. Model Adapter interfaces (TypeScript contracts — design, not implementation)

Lives in `packages/model-adapters`. Existing `VideoModelAdapter`, `ShotRequest`
and `ModelCapabilities` are **extended**, not renamed, so current adapters keep
compiling during migration.

```ts
// ── Shared ───────────────────────────────────────────────────────────────
export type MediaKind = "image" | "video";
export type QualityClass = "draft" | "standard" | "premium" | "cinematic";

export interface ModelLicense {
  id: string; commercial: boolean; revenueCapUsd?: number;
  territoryExcludes: string[]; outputsTrainable: boolean;
  competingUseRestricted: boolean; agreementRef?: string;
}
export interface ModelVersionRef { modelId: string; versionId: string; version: string }
export interface ModelDeployment {
  id: string; versionId: string; pool: string; gpuType: string;
  endpoints: string[]; minPods: number; maxPods: number;
}
export interface GenerationContext {        // passed to every adapter call
  generationId: string; userId: string; projectId: string;
  traceId: string; attempt: number; deadlineMs: number;
}
export interface InputRef {                 // never a raw storage key at the GPU boundary
  role: "reference" | "init" | "mask" | "control" | "identity" | "style";
  url: string;                              // presigned GET, short TTL
  key: string;                              // provenance only
  weight?: number;
  controlType?: "depth" | "canny" | "pose" | "lineart" | "segmentation";
}
export interface LoraRef { key: string; url: string; family: string; scale: number; trigger?: string }
export interface OutputTarget { url: string; key: string; contentType: string }   // presigned PUT

// ── Image ───────────────────────────────────────────────────────────────
export type ImageOperation =
  | "text_to_image" | "image_to_image" | "edit" | "inpaint" | "outpaint" | "upscale" | "control";

export interface ImageGenerationRequest {
  operation: ImageOperation;
  prompt: string;
  negativePrompt?: string;
  width: number; height: number;
  steps?: number; guidance?: number; seed?: number;
  strength?: number;              // img2img / edit strength 0..1
  denoiseStrength?: number;       // inpaint denoise 0..1
  referenceImages?: InputRef[];   // role=reference|identity|style
  initImage?: InputRef;           // role=init
  mask?: InputRef;                // role=mask (white = repaint)
  controlImages?: InputRef[];     // role=control
  outpaint?: { left: number; right: number; top: number; bottom: number };
  upscaleFactor?: 2 | 4;
  loraAdapters?: LoraRef[];
  characterIds?: string[];        // resolved upstream into refs/LoRAs; kept for provenance
  locationId?: string; worldObjectIds?: string[];
  outputFormat: "png" | "webp" | "jpeg";
  count?: number;                 // variations (1–4)
  extra?: Record<string, unknown>;// model-specific, validated against capabilities.schema
}

export interface ImageGenerationResult {
  outputs: Array<{ key: string; width: number; height: number; seed: number; thumbnailKey?: string }>;
  gpuMs: number; queueMs: number; inferenceMs: number;
  vramPeakMb?: number; workerId: string; gpuType: string;
  modelVersion: ModelVersionRef;
  safety?: { flagged: boolean; categories: string[] };
}

export interface ImageModelCapabilities {
  versionId: string;
  operations: ImageOperation[];
  maxReferenceImages: number;
  supportsNegativePrompt: boolean; supportsSeed: boolean; supportsLora: boolean;
  loraFamily?: string;                         // LoRAs must match the base family
  controlTypes: InputRef["controlType"][];
  resolutionBuckets: Array<{ width: number; height: number }>;
  maxMegapixels: number;
  stepsRange: [number, number]; guidanceRange?: [number, number];
  textRendering: "none" | "basic" | "strong";
  extraSchema?: Record<string, unknown>;       // JSON Schema for `extra`
}

export interface ImageModelAdapter {
  readonly versionId: string;
  capabilities(): ImageModelCapabilities;
  estimate(req: ImageGenerationRequest): { gpuMs: number };
  run(req: ImageGenerationRequest, out: OutputTarget[], ctx: GenerationContext, signal?: AbortSignal): Promise<ImageGenerationResult>;
  healthcheck(): Promise<{ healthy: boolean; modelLoaded: boolean; detail?: string }>;
}

// ── Video (extends today's contract) ────────────────────────────────────
export interface VideoModelCapabilities extends ModelCapabilities {
  versionId: string;
  operations: Array<"text_to_video" | "image_to_video" | "video_to_video" | "keyframes" | "extend">;
  fpsOptions: number[];
  maxReferenceImages: number;
  loraFamily?: string;
  generatesAudio: boolean;
  qualityClasses: QualityClass[];
}
export interface VideoGenerationRequest extends ShotRequest {   // ShotRequest unchanged
  operation: VideoModelCapabilities["operations"][number];
  quality: QualityClass;
  initImage?: InputRef;            // storyboard frame (replaces referenceImageKeys at the GPU edge)
  references?: InputRef[];
  loras?: LoraRef[];
}
// VideoModelAdapter keeps generate()/estimateCost()/healthcheck(); adds:
//   run(req: VideoGenerationRequest, out: OutputTarget, ctx: GenerationContext): Promise<ShotResult & ObservedRun>

// ── Registries & routers ────────────────────────────────────────────────
export interface MediaModelRegistry<A> {
  get(versionId: string): A | undefined;
  versions(kind: MediaKind): ModelVersionRef[];
  license(versionId: string): ModelLicense;
  deployments(versionId: string): ModelDeployment[];
  refresh(): Promise<void>;
}
export interface RouteRequest {
  kind: MediaKind; operation: string; quality: QualityClass;
  plan: "FREE" | "CREATOR" | "STUDIO" | "AGENCY" | "ENTERPRISE";
  userId: string; country?: string;
  width: number; height: number; durationSec?: number;
  hasRefImages: boolean; hasMask: boolean; loraFamilies: string[];
  preferredVersionId?: string;
}
export interface RouteDecision {
  versionId: string; deploymentId: string; policyId: string;
  considered: Array<{ versionId: string; rejected?: string; score?: number }>;
}
export interface ModelRouter { route(req: RouteRequest): Promise<RouteDecision> }
```

Python side (`apps/gpu-worker`): one `Backend` protocol per modality —
`load()`, `capabilities()`, `run(request, outputs) -> result` — so the FastAPI
layer, auth, storage I/O, metrics and locking are shared by every model image.

---

## J. Image generation schema

```sql
create table public.image_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- what this image is FOR (at most one purpose target; all nullable)
  purpose text not null check (purpose in
    ('storyboard_frame','character_portrait','character_reference','location','world','asset',
     'poster','key_art','edit','homepage','other')),
  scene_id uuid references public.scenes(id) on delete set null,
  shot_id uuid references public.shots(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  world_object_id uuid references public.world_objects(id) on delete set null,
  parent_id uuid references public.image_generations(id) on delete set null, -- edit/inpaint lineage
  -- request
  operation text not null check (operation in
    ('text_to_image','image_to_image','edit','inpaint','outpaint','upscale','control')),
  quality text not null default 'standard',
  prompt text not null,
  negative_prompt text,
  context jsonb not null default '{}',     -- compiled context snapshot (§U): bible refs, ids, hashes
  parameters jsonb not null default '{}',  -- width,height,steps,guidance,strength,denoise,count,format,extra
  input_keys jsonb not null default '[]',  -- [{role,key,weight,controlType}]
  lora_refs jsonb not null default '[]',   -- [{identityId,version,key,scale}]
  seed bigint,
  idempotency_key text,                    -- e.g. 'shot:{id}:seed:v3'
  -- routing & execution
  requested_model text,                    -- user preference, optional
  model_version_id text references public.media_model_versions(id),
  workflow_id text, workflow_version int,  -- workflow_definitions (§AT.7)
  runtime text, runtime_version text,      -- 'comfyui' + commit | 'diffusers' + version
  graph_sha256 text,                       -- bound workflow hash (provenance / reproduction)
  deployment_id text,
  routing jsonb,                           -- RouteDecision
  status text not null default 'PENDING' check (status in
    ('PENDING','QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','BLOCKED')),
  progress smallint not null default 0 check (progress between 0 and 100),
  attempts smallint not null default 0,
  job_id text,                             -- BullMQ job id
  worker_id text, gpu_type text,
  queue_ms int, inference_ms int, gpu_ms int, vram_peak_mb int,
  -- results
  outputs jsonb not null default '[]',     -- [{key,thumbKey,width,height,seed}]
  output_key text,                         -- primary output (denormalized for queries)
  thumbnail_key text,
  quality_score real,                      -- automatic QC (Phase 15)
  safety jsonb,
  error_code text, error_message text,
  created_at timestamptz not null default now(),
  queued_at timestamptz, started_at timestamptz, completed_at timestamptz,
  unique (project_id, idempotency_key)
);
create index on public.image_generations (status, created_at) where status in ('PENDING','QUEUED');
create index on public.image_generations (project_id, purpose, created_at desc);
create index on public.image_generations (shot_id) where shot_id is not null;
create index on public.image_generations (character_id) where character_id is not null;
```

RLS (same model as every owner table):
- `select`: `user_id = auth.uid() or owns_project(project_id)`.
- `insert`: `user_id = auth.uid() and owns_project(project_id)` **and** a column
  guard trigger allowing only request columns (`purpose`, ids, `operation`,
  `quality`, `prompt`, `negative_prompt`, `parameters`, `input_keys`,
  `requested_model`, `idempotency_key`) — status, routing, outputs and metrics
  are worker-only (service role), mirroring `guard_user_columns` (0024).
- `update`: owner may set `status='CANCELLED'` while PENDING/QUEUED only.
- `input_keys` validated by trigger: every key must start with
  `projects/{project_id}/` (no cross-project reads).
- Realtime publication added so the UI receives progress/completion.

Linking images to entities (the asset system):
```sql
create table public.entity_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_type text not null check (entity_type in ('character','location','world_object','project','scene','shot')),
  entity_id uuid not null,
  role text not null,                  -- 'portrait','turnaround_front','establishing','prop_hero','poster','storyboard'
  image_key text not null,
  generation_id uuid references public.image_generations(id) on delete set null,
  is_primary boolean not null default false,
  approved boolean not null default false,  -- creator-approved references feed identity/continuity
  created_at timestamptz not null default now()
);
```
`characters.reference_urls`, `locations.reference_urls` and
`world_objects.reference_urls` remain and are kept in sync for back-compat until
the UI reads `entity_images`.

## K. Video generation schema

`shots` stays the product object (one per shot, with its current
`video_key`). A new **attempt ledger** records every model call, which today is
implicit in `shots.attempts` and lost on retry:

```sql
create table public.video_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  shot_id uuid references public.shots(id) on delete cascade,
  operation text not null,              -- text_to_video | image_to_video | video_to_video | extend
  quality text not null,
  prompt text not null, negative_prompt text,
  context jsonb not null default '{}',
  parameters jsonb not null default '{}',   -- duration, fps, width, height, camera, motion…
  init_image_generation_id uuid references public.image_generations(id),
  input_keys jsonb not null default '[]',
  lora_refs jsonb not null default '[]',
  seed bigint,
  idempotency_key text,
  model_version_id text references public.media_model_versions(id),
  workflow_id text, workflow_version int, runtime text, runtime_version text, graph_sha256 text,
  deployment_id text, routing jsonb,
  status text not null default 'QUEUED',
  progress smallint not null default 0, attempt smallint not null default 1,
  job_id text, worker_id text, gpu_type text,
  queue_ms int, inference_ms int, gpu_ms int, vram_peak_mb int,
  output_key text, thumbnail_key text, quality_score real,
  error_code text, error_message text,
  created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
  unique (shot_id, idempotency_key)
);
```
Writes are service-role only; owners can `select` (RLS via `owns_project`).
`shots.model_id`/`model_version` keep pointing at the version that produced the
accepted clip.

---

## L. Queue architecture

No second orchestration system. Same pattern as every existing queue:

```
browser / Director / video processor
        │ insert row (status=PENDING, idempotency_key)
        ▼
image_generations ──▶ project-poller.ts (existing loop, new claimer)
                        UPDATE … SET status='QUEUED', queued_at=now()
                        WHERE id=$1 AND status='PENDING' RETURNING …   (exactly-once claim)
                        credit check + hold (§Q)
        ▼
BullMQ queue "image" (Redis) ── jobId = generation id (dedupe)
        ▼
image.processor.ts → ImageEngine.run(generationId)
        ├─ load row; if SUCCEEDED → return (idempotent)
        ├─ ContextCompiler (refs, LoRAs, prompt assembly)  [§U]
        ├─ ModelRouter.route()                              [§H]
        ├─ GpuOrchestrator.acquire(deployment)              [§M]
        ├─ presign inputs/outputs                           [§P]
        ├─ adapter.run() → signed call to GPU               [§O]
        ├─ write outputs/metrics; status=SUCCEEDED; progress=100
        ├─ usage_records insert; settle credit hold          [§Q]
        └─ side effects by purpose (e.g. shots.seed_image_key, entity_images)
        ▼
Supabase Realtime → UI
```

- **Seed frames inside a film run:** the scene flow (`film-flow.ts`) inserts one
  `image_generations` row per image-to-video shot (`idempotency_key =
  'shot:{id}:seed:v{n}'`) and adds them as **BullMQ flow children** of the
  shot's video job, so video starts only when its frame exists. Standalone
  storyboard frames (Phase 7 UI) go through the poller.
- `resolveSeedKey()` becomes: uploaded seed → use it; else
  `ImageEngine.ensureSeedFrame(shot)` (creates or reuses the row, awaits the
  child result) → key. **It never calls a vendor directly.**
- **Video:** `video.processor.ts` keeps its job shape; inside, it calls
  `VideoEngine.run()` which writes a `video_generations` row per attempt and
  routes via the router instead of `buildClusterRegistry` + `policy.ts`.
- Concurrency: per-queue worker concurrency sized to GPU pool capacity; the
  existing `DeficitFairScheduler` decides *which* user's job is dispatched next
  when a pool is saturated (tier-weighted, already implemented).

---

## M. GPU architecture

```
apps/gpu-worker/                     (one codebase, many images)
  app/core/        server.py (FastAPI), auth.py (§O), io.py (presigned I/O),
                   metrics.py, locking.py, health.py
  app/backends/    image_qwen.py, image_zimage.py, image_sdxl_inpaint.py,
                   upscale_esrgan.py, video_ltx.py, video_hunyuan.py, video_wan.py
  images/          Dockerfile.image, Dockerfile.video-ltx, Dockerfile.video-hunyuan,
                   Dockerfile.video-wan (pinned deps per backend)
```
- `BACKEND=image_qwen|video_ltx|…` selects the backend at start (replaces
  `MODEL_NAME`; `MODEL_NAME` stays an alias during migration).
- **Independent scaling:** pools are keyed by deployment (`image`,
  `video-48g`, `video-80g`, `video-legacy` — named by capability, never by "primary"
  model). Image and video never share
  a pod; each pool has its own min/max pods and idle timeout.
- An image pod may host a **multi-model backend** only when the models share
  base weights (e.g. Qwen-Image + Qwen-Image-Edit share the text encoder and
  VAE); otherwise one model per pod as today.
- One inference at a time per GPU (existing `_infer_lock`); batching of
  same-version image requests (count>1) inside one call.
- Weights on a persistent volume per deployment (RunPod network volume today;
  DeployPro node-local NVMe cache fed from DeployPro object storage in the
  target, §AI), pinned by revision; cold start loads from the volume/cache,
  never from the public hub at request time.
- Workers are **provider-agnostic containers**: the same image runs on RunPod,
  on a DeployPro GPU node, or on a developer workstation with an NVIDIA GPU.
  Nothing inside `apps/gpu-worker` may reference RunPod (it doesn't today).
- Worker types (all from the same codebase, §AO): `cineforge-image-worker`,
  `cineforge-video-worker` (one image per video backend), `cineforge-audio-worker`
  (future self-hosted TTS/voice/music backends), `cineforge-upscale` (may share
  the image worker), and a training variant for LoRA jobs.

## N. GPU provider lifecycle integration (RunPod today, DeployPro target)

The lifecycle manager is abstracted behind `GpuProvider` (§AH): RunPod is one
adapter, DeployPro the preferred adapter, others can be added. Extend
`packages/gpu`, do not duplicate it:
- `LifecycleConfig` becomes per **deployment** (`ensureRunning(deploymentId)`,
  `reconcile()` iterates deployments from `media_model_deployments`).
- `GpuClusterRouter` already models workers by `modelId`; change the key to
  `deploymentId` and populate from the registry instead of `parseClusterFromEnv`
  (env parsing kept as a fallback for local dev).
- Scale signals: BullMQ queue depth per pool + in-flight count (existing
  `active-job-tracker.ts`); scale-to-zero after idle timeout (images: 10 min;
  video: 15 min, configurable).
- Warm-up: when a storyboard run starts, warm the image pool and the expected
  video pool in parallel (frames finish first, video pods are warm by then).
- RunPod Serverless remains an option per deployment (`runpod.mode = 'pod' |
  'serverless'`); the adapter contract is identical.
- The registry column `media_model_deployments.runpod` generalizes to
  `provider text` + `provider_config jsonb` (`{ provider: 'runpod', podIds… }` or
  `{ provider: 'deploypro', pool: 'gpu-h100', requirements… }`), so moving a
  deployment from RunPod to DeployPro is a registry change, not a code change.
- With DeployPro, "start/stop a pod" becomes "acquire/release a GPU lease"
  (§AP); the manager stops managing machines and only expresses demand.

---

## O. Authentication architecture (mandatory fix — Phase 2)

Today: the worker sends `Authorization: Bearer <RUNPOD_API_KEY>`; FastAPI checks
nothing; anyone with a pod URL can call `/generate` and `/train`.

**Non-negotiable requirements — first implementation phase.** No GPU worker
may expose an unauthenticated generation or training endpoint, on any
provider, in any environment reachable from outside the developer's machine.

| Requirement | Mechanism |
|---|---|
| short-lived signed job tokens | JWT (HS256, per-deployment key) with `exp − iat ≤ 300 s`, `jti` replay cache |
| deployment-bound authorization | `aud` = the worker's own `DEPLOYMENT_ID`; a token for one deployment is useless on another |
| action-bound authorization | `scope` claim (`image:run`, `video:run`, `train`, `warm`, `admin`) checked per endpoint |
| request/body binding | `bh` = SHA-256 of the exact request body; `sub` = generation id, must equal body `jobId` |
| one-time upload URLs | per-job presigned PUT to a **unique, never-reused key** (`…/{generationId}/{n}.{ext}`), TTL ≤ 30 min; conditional create (`If-None-Match: *`) where the store supports it so the URL cannot overwrite an existing object; on completion the worker verifies size/checksum and ignores any later writes |
| one-time download URLs | per-job presigned GET for each input, TTL ≤ 15 min, issued only to the leased worker, scoped to exactly the object keys of that job; where the store supports single-use tokens (DeployPro object storage requirement G5) they are used, otherwise short TTL + unique per-job issuance |
| no permanent object-storage credentials in GPU workers | GPU workers carry only their JWT verification key; `S3_ACCESS_KEY`/`S3_SECRET_KEY` removed from GPU images and environments |
| private GPU networking wherever possible | DeployPro private network with no public ingress (§AN); RunPod transitional: proxy HTTPS + JWT; hybrid gateway with mTLS + allow-list removed at I8 |

Target: **every GPU request carries a short-lived JWT signed by the worker**,
verified by the pod.

```
Worker                                            GPU pod (deployment D)
  sign HS256 with secret K_D (per deployment)       verify signature with K_D
  claims: iss="cineforge-worker"                     iss == "cineforge-worker"
          aud=D                                      aud == own DEPLOYMENT_ID
          sub=generationId                           exp − iat ≤ 300 s, not expired
          scope="image:run" | "video:run" |          scope allowed for endpoint
                "train" | "warm" | "admin"
          jti=uuid  (replay protection, cached 10 min)
          bh=sha256(request body)                    bh == sha256(body)
          exp=iat+300
```
- Applies to **all** endpoints except a minimal `GET /livez` (returns `ok`,
  no model or version info). `/health`, `/capabilities`, `/warm`, `/generate`,
  `/train`, `/tasks/*`, `/v1/*` all require a token with the right scope.
- Secrets: `K_D` generated per deployment, stored in RunPod pod env and in the
  worker's environment (Render secret), rotated by dual-key overlap
  (`GPU_JWT_KEYS=current,previous`).
- Transport (transitional, RunPod): RunPod proxy HTTPS only; reject plain HTTP;
  request size limits; per-pod rate limit as defense in depth.
- Transport (target, DeployPro): GPU workers have **no public ingress at all**;
  they are reachable only on the DeployPro private network (§AN). JWT
  verification stays mandatory on the private network (zero-trust: network
  position is never authorization). mTLS between `cineforge-worker` and GPU
  workers is added where DeployPro provides service certificates.
- Browsers **never** talk to GPU workers; endpoints are not exposed in any
  browser-readable table or RPC.
- During the hybrid period (Cineforge workers still on Render, GPUs on
  DeployPro) the DeployPro edge may expose a GPU gateway route restricted by
  JWT + mTLS client certificate (+ IP allow-list of the Render egress where
  available); this route is removed once workers run inside DeployPro (§AR).

## P. Storage architecture

All storage access goes through the `StorageProvider` abstraction (§AK).
Supabase Storage is the current adapter; DeployPro object storage is the
target. Keys, layout and ownership rules below are identical on both, so a
migration is a copy plus a configuration change.

- **Same bucket:** `cineforge-assets` (private). No new bucket.
- **Layout:**
  ```
  projects/{projectId}/images/{generationId}/{n}.{ext}        outputs
  projects/{projectId}/images/{generationId}/{n}.thumb.webp   thumbnails
  projects/{projectId}/inputs/{uuid}.{ext}                    creator uploads (masks, refs)
  projects/{projectId}/characters/{characterId}/refs/…        identity references
  projects/{projectId}/identities/{identityId}/v{n}/lora.safetensors
  projects/{projectId}/video/{videoGenerationId}.mp4          (replaces _generated/…)
  _legal/licenses/{licenseId}.pdf                             admin-only
  ```
  Everything user-owned sits under `projects/{projectId}/`, so the existing
  `cineforge owner read/insert/update/delete` storage policies cover it with no
  new policy.
- **GPU pods get presigned URLs, not credentials:** the worker presigns each
  input (GET, 15 min) and output (PUT, 30 min) through the S3 API. Pods drop
  `S3_ACCESS_KEY/S3_SECRET_KEY`. A compromised pod can then touch only the
  objects of the job it is running.
- Existing `_generated/wan-2.1/*` and `_generated/cinematic/*` objects stay
  readable via current keys; new runs never write there. Optional backfill job
  copies them under `projects/…` later.
- Thumbnails (WebP 512 px) created on the pod to avoid a second download.

## Q. Billing architecture (metering first)

`usage_records` today: `id, user_id, project_id, kind, gpu_ms, cost_usd,
created_at`; only `kind='video'` is written. Extend:

```sql
alter table public.usage_records
  add column generation_id uuid,                -- image_generations.id | video_generations.id
  add column model_version_id text,
  add column operation text,                    -- text_to_image, inpaint, image_to_video, train…
  add column units jsonb not null default '{}', -- {megapixels, images, seconds, frames, width, height, steps}
  add column credits_ms bigint;                 -- what was debited (null while unpriced)
alter table public.usage_records
  add constraint usage_kind_chk check (kind in
    ('video','image','audio','upscale','training','render','transcode',
     'voice','avatar','music','llm','other_gpu'));
-- 'render' / 'transcode' record CPU (or NVENC) render-worker time in units.cpu_ms
-- (and gpu_ms when GPU-encoded); 'other_gpu' covers any future GPU-intensive operation.
```
- **Universal metering, charging later.** Every GPU-intensive or
  render-intensive operation records usage from day one — image, video,
  training, upscale, rendering/transcoding, audio and any other GPU operation —
  **whether or not that category is charged yet**. Which kinds debit credits is
  a pricing-policy setting per kind (`charge_enabled`), initially on only for
  `video` (today's behavior). The goal is real cost/performance data before
  prices are finalized.
- **One usage row per successful generation** (and per failed generation that
  consumed GPU time > threshold, flagged `units.failed=true`, debited per
  policy).
- **Credit holds:** on claim, `credit_holds(generation_id, user_id, est_ms)` is
  inserted and the user's available balance is `credits_ms − sum(open holds)`;
  on completion the hold settles to actual `gpu_ms`; on failure it is released.
  This stops users from queueing more work than their balance (today the
  poller only checks `credits_ms > 0`).
- **Pricing is a function, not code:** `price(version, units) → credits_ms`
  read from `media_model_versions.cost_model`. Until prices are decided the
  function returns raw `gpu_ms` (current video behavior), so metering ships
  before commercial pricing.
- Images were free until now; Phase 6 starts **metering without debiting** for
  two weeks (`credits_ms = 0`, units recorded) to calibrate prices.

---

## R. Character Identity architecture (Cineforge-owned)

Character identity is a **Cineforge-owned system**, not a dependency on a
third-party face-identity model. Identity is composed from:

| Component | What it is | Source / storage |
|---|---|---|
| reference images | approved face (front, ¾, profile), body, costume and turnaround images | `entity_images` (role, `approved=true`), generated by the Image Engine or uploaded |
| character metadata | appearance, gender, age, ethnicity, personality, arc, voice profile | `characters` (existing columns) |
| visual embeddings (where commercially permitted) | numeric descriptors used for retrieval and consistency scoring | `characters.embedding` (pgvector, existing) — produced only by an embedding model whose license is verified for commercial use; none is selected yet (open item) |
| LoRA identity training | per-character adapter per base-model family | `character_identities.lora_key` (trained by `cineforge-trainer`) |
| generation constraints | rules applied to every request containing the character: required descriptors, forbidden changes, wardrobe valid for the scene index, age/era consistency | `character_identities.constraints` jsonb + `wardrobes` (existing) |
| reference-image conditioning | approved references passed as model inputs (e.g. Qwen-Image-Edit multi-image input; I2V init frames) | resolved by `IdentityService` into `InputRef[]` |
| consistency evaluation | automatic identity score of each output vs held-out references, plus human approval | `character_identities.metrics`, `image_generations.quality_score` (Phase 15) |

```
Character (characters)
 ├─ identity attributes        characters.appearance, gender, age, ethnicity, personality (existing)
 ├─ references                 entity_images (role: face_front, face_3q, profile, body_full,
 │                             costume_{name}, turnaround_*) — approved=true feeds identity
 ├─ wardrobes                  wardrobes (existing) — costume refs link here
 └─ identities (versioned)     character_identities
        id, character_id, version, family ('qwen-image'|'ltx'|'wan'|…),
        method ('reference_only'|'lora'), status
        ('draft'|'collecting'|'training'|'ready'|'failed'|'retired'),
        dataset (jsonb: reference keys + captions + hash), trigger_token,
        constraints (jsonb), lora_key, train_params, metrics (jsonb: identity
        similarity score), trained_at, trained_on (deployment), gpu_ms
```
```
Character
    ↓
Identity (references + metadata + constraints + LoRA/refs per model family)
    ↓
Image Generation  +  Video Generation
```
- **Two identity methods, same interface.** `reference_only` (works with
  multi-reference editing models) and `lora` (trained adapter, tighter). The
  ContextCompiler asks `IdentityService.resolve(characterId, family)` and gets
  back `{ references: InputRef[], loras: LoraRef[], constraints }` for whatever
  model family the router picked. Image and video share the same identity
  object.
- **LoRAs are per base-model family.** A character may have one ready identity
  per family (`unique (character_id, family) where status='ready'`). When the
  production video model changes (registry), active characters are queued for
  retraining on the new family (`training` jobs, metered `kind='training'`).
- `characters.lora_key` / `lora_version` remain as a **denormalized pointer** to
  the identity used by the video family currently in production (back-compat
  for the existing video processor; resolved by the registry, not hard-coded).
- **Lifecycle:** create character → generate/approve references (portrait +
  turnaround via Image Engine) → `collecting` (≥ N approved refs) → `training`
  (existing `lora` queue, real trainer on a training pool) → automated identity
  score vs held-out refs → `ready` → used by image + video → `retired` when
  superseded.
- **Not used unless their commercial licensing is independently verified:**
  InsightFace pretrained models and anything built on them — **InstantID,
  PuLID, IP-Adapter-FaceID** and similar face-ID adapters. InsightFace's
  models are documented as "non-commercial research purposes only" (§D). The
  architecture works without them; if a commercial license is obtained later
  they can be registered as an optional `identity` component through the same
  registry and license rules.
- Trainer contract (unchanged endpoint, now authenticated):
  `POST /train {identityId, family, datasetUrls[], captions[], steps, rank}` →
  `{taskId}`; `GET /tasks/{id}` → `{status, progress, loraKey?, metrics?}`.

## S. World / Location / Asset architecture

Existing tables are the sources: `locations` (kind, description, parent),
`world_objects` (category: prop, vehicle, creature, logo, brand, object),
project-level world bible (to be added, §U). Generation purposes:

| Purpose | Entity | Default operation | Output roles |
|---|---|---|---|
| Character portrait / turnaround | characters | text_to_image → edit (refs) | portrait, turnaround_* |
| Location / environment / architecture | locations | text_to_image (wide) | establishing, alt_angle, time_of_day_* |
| World | locations (kind=CITY/KINGDOM/LANDSCAPE) + world bible | text_to_image | world_key_frame |
| Prop / vehicle / creature | world_objects | text_to_image (clean bg) → edit | hero, turnaround |
| Poster / key art | project | text_to_image with refs + typography | poster, key_art |
| Storyboard frame | shot | text_to_image or edit (refs) | storyboard |

Each approved output is an `entity_images` row and becomes a reference the
ContextCompiler can inject into any later scene. Assets are reusable across
projects when the source project is a library project (existing
`mode='library'` convention).

## T. Storyboard architecture (Image Engine priority #1)

```
Script (screenplays) → Scene (scenes) → Shot (shots: camera_plan, prompt, source)
   → Shot requirements    (characters present, location, props, time_of_day, weather, camera)
   → Context              (ContextCompiler §U: bibles + identities + location refs + prev/next shot)
   → Cinematic prompt     (subject · action · framing (shot size, angle, lens) · lighting ·
                            palette · era/production design · negative prompt)
   → image_generations    (purpose=storyboard_frame, quality=draft → standard on lock)
   → creator review       (accept / regenerate / edit / upload own)
   → shots.seed_image_key (accepted frame) → video I2V (VideoEngine) with init_image
```
- Resolution/aspect from the **target video model's** buckets so the frame is
  the exact I2V input.
- Draft frames render on the fast model; "lock frame" re-renders on the
  standard model with the same seed and context for consistency.
- Regeneration keeps lineage (`parent_id`) so the creator can step back.
- Existing behaviors kept: uploaded seeds win; preview markers
  (`generated:`, `local:`, `ref:`) remain UI-only.

## U. Cinematic continuity architecture

New **ContextCompiler** in the worker (TypeScript, no model dependency) builds a
`GenerationContext` document from structured sources, then renders it into a
model-specific prompt via the adapter's prompt template:

```
Project Bible     project_bibles.visual (palette, era, genre, aspect, film stock/look, references)
                  project_bibles.cinematography (lens kit, lighting style, camera language rules)
Scene Context     scenes (heading, time_of_day, weather, mood, location_id, state_patch/bridge — existing
                  continuity engine, docs/28)
Shot Context      shots (camera_plan, prompt, index), previous accepted frame, next shot intent
Character Context identities + approved references + wardrobe valid for this scene index
World Context     location refs (establishing), props present (world_objects refs)
Cinematography    shot size/angle/movement → framing language; lens → FOV terms
        ▼
compiled = { textPrompt, negativePrompt, references[], loras[], controls[], seed policy, hashes }
```
- `project_bibles(project_id, version, visual jsonb, cinematography jsonb)` —
  new, owner-RLS; Director drafts it, creator edits it.
- **Continuity signals:** previous shot's accepted frame is passed as a style /
  layout reference for shots in the same scene and setup; the same seed family
  is reused per setup; character wardrobe resolved by `valid_from/to_scene`.
- The compiled context and its source hashes are stored on every generation
  (`context` jsonb), which makes results reproducible and lets QC (Phase 15)
  compare intended vs produced.

---

## V. API contracts

### V.1 Browser-facing (follows the existing architecture: Supabase, not a new HTTP API)

| Operation | Mechanism |
|---|---|
| Generate / edit / inpaint / outpaint / upscale | `rpc('request_image_generation', {...})` — SECURITY DEFINER, validates ownership, operation vs plan, input keys prefix, parameter bounds, available credits; inserts the `image_generations` row; returns `{id}` |
| Status / progress / result | select `image_generations` (RLS) + Realtime subscription |
| Cancel | update `status='CANCELLED'` (RLS allows only from PENDING/QUEUED) |
| Video generate | unchanged: create/queue shots & projects as today; per-attempt detail via `video_generations` (select) |
| Available models | `rpc('available_models', {kind})` — plan- and territory-filtered, no endpoints |

The directive's `POST /image/generate … GET /video/status/:jobId` contracts are
the **internal** contracts below; the browser reaches them only through rows
and RPCs, never directly.

### V.2 Internal worker → GPU (authenticated per §O; `Content-Type: application/json`)

```
POST /v1/image/generate   scope image:run   body ImageRunRequest  (operation text_to_image | image_to_image | control)
POST /v1/image/edit       scope image:run   body ImageRunRequest  (operation edit)
POST /v1/image/inpaint    scope image:run   body ImageRunRequest  (mask required)
POST /v1/image/outpaint   scope image:run   body ImageRunRequest  (outpaint margins required)
POST /v1/image/upscale    scope image:run   body { input, factor, outputs }
POST /v1/video/generate   scope video:run   body VideoRunRequest
GET  /v1/jobs/{jobId}     scope *:run       → { status, progress, result?, error? }
POST /v1/warm             scope warm
GET  /v1/capabilities     scope admin       → capabilities + versionId + weights revision
POST /train               scope train       (existing, now authenticated)
GET  /tasks/{id}          scope train
POST /generate            scope video:run   (legacy alias for current worker; removed in Phase 12+)
GET  /livez               unauthenticated   → "ok"
```

```jsonc
// ImageRunRequest (wire form of ImageGenerationRequest after context compilation)
{
  "jobId": "uuid (generation id)",
  "versionId": "qwen-image/2511-edit",
  "operation": "edit",
  "prompt": "…", "negativePrompt": "…",
  "width": 1280, "height": 720, "steps": 30, "guidance": 4.0, "seed": 1234,
  "strength": 0.6, "denoiseStrength": null, "count": 1,
  "inputs": [{ "role": "reference", "url": "https://…presigned", "weight": 1.0 }],
  "mask": null, "controls": [],
  "loras": [{ "url": "https://…presigned", "scale": 0.8, "family": "qwen-image" }],
  "outputs": [{ "url": "https://…presigned-put", "contentType": "image/png" }],
  "thumbnailOutputs": [{ "url": "https://…presigned-put", "contentType": "image/webp" }],
  "mode": "sync",                   // or "async" → 202 { jobId }, poll /v1/jobs/{id}
  "deadlineMs": 120000,
  "extra": {}
}
// 200 → { "outputs":[{ "width":1280,"height":720,"seed":1234 }], "gpuMs":8123, "inferenceMs":7900,
//         "vramPeakMb":38211, "workerId":"pod-abc", "gpuType":"L40S", "versionId":"…", "weightsRevision":"…" }
// 4xx → { "error":{ "code":"INVALID_INPUT|UNSUPPORTED_OPERATION|AUTH|PAYLOAD_TOO_LARGE", "message":"…" } }
// 5xx → { "error":{ "code":"OOM|MODEL_NOT_LOADED|INFERENCE_FAILED|UPLOAD_FAILED", "retryable":true } }
```
`VideoRunRequest` = today's `GenerateInput` plus `jobId`, `versionId`,
`operation`, `quality`, `initImage{url}`, `references[]`, `loras[]`,
`outputs{video,thumbnail}` (presigned), `mode`, `deadlineMs`.

---

## W. Failure / retry strategy

| Failure | Detection | Action |
|---|---|---|
| Duplicate job / worker crash mid-run | row status + BullMQ jobId = generation id | `run()` is idempotent: SUCCEEDED rows return; RUNNING rows older than lease (deadline + 2 min) are re-claimed |
| GPU OOM | `OOM` (retryable) | retry once same deployment with reduced batch/resolution bucket; then next candidate version from routing |
| Model not loaded / cold start | `MODEL_NOT_LOADED` / timeout | `ensureRunning`, wait warm, retry (no attempt charged) |
| Pod unreachable / 5xx | network error | exponential backoff 3× (5 s, 20 s, 60 s) then next deployment in pool, then next candidate version |
| Invalid input / unsupported op | 4xx | fail fast, `status=FAILED`, no retry, hold released |
| Auth failure | 401/403 | fail, alert ops (key rotation or misconfig), no retry |
| Upload failed | `UPLOAD_FAILED` | re-presign outputs, retry once |
| Safety block | moderation | `status=BLOCKED`, no charge, reason surfaced |
| Route unavailable (license/territory/capacity) | router | `status=FAILED`, `error_code=ROUTE_UNAVAILABLE`, user-facing message |
| Partial film failure | scene flow | failed shot doesn't fail the film: shot marked FAILED, creator can regenerate; existing resume logic unchanged |

Max attempts per generation: 3 GPU attempts across candidates. Every attempt is
logged (image: `attempts` + `routing.considered`; video: one
`video_generations` row per attempt).

## X. Observability

Per generation (stored on the row and emitted as a structured log + metric):
`generation_id/job_id, user_id, project_id, scene_id, shot_id, purpose,
operation, model_version_id, weights_revision, deployment_id, worker_id,
gpu_type, queue_ms, inference_ms, gpu_ms, vram_peak_mb, attempts, error_code,
output_key, quality_score, routing decision`.

- **Logs:** JSON lines from worker and pods with `traceId = generation id`,
  shipped to the existing Render log stream (+ optional Logtail/Grafana Loki).
- **Metrics** (Prometheus format from pods at `/v1/metrics` scope admin; worker
  pushes aggregates): queue depth per pool, p50/p95 queue and inference time
  per version, GPU utilization, VRAM peak, OOM rate, failure rate by code,
  cold starts, cost per image / per second of video.
- **Admin dashboard:** extend existing admin `gpu`/`cost` views with per-model
  version panels, canary vs control comparison, and license-routing rejections.
- **Alerts:** failure rate > 5% over 15 min per version; p95 queue > 5 min;
  any 401 from a pod; pool at max with backlog > 10 min.

## Y. Security

- GPU auth (§O) and presigned-only storage (§P) — Phase 2, before any new model.
- RLS on all new tables; worker-only columns protected by guard triggers (as
  0024 does for users); registry tables admin-only.
- Input validation: key prefix = `projects/{project_id}/`; image size and
  megapixel limits; MIME sniffing on uploads; mask dimensions match init image.
- Prompt and output **moderation** without third-party APIs long-term (today
  `director/moderation.ts` calls OpenAI). Phase 8 adds a self-hosted safety
  classifier for images; text moderation stays as-is until a licensed local
  classifier is selected (open item).
- License enforcement in the router; licenses archived; outputs tagged with the
  license of the producing model (`outputs_trainable`), so Model Lab datasets
  can be filtered.
- AI-content labeling (required by LTX-2.x and Tencent licenses): C2PA/metadata
  tag "machine generated" on exported media + disclosure in publish flows.
- Supply chain: pinned weights revisions + SHA256 of weight files recorded in
  `media_model_versions.version`; container images built in CI and pushed to a
  private registry; no `trust_remote_code` without review.
- Secrets: per-deployment JWT keys, dual-key rotation; pods carry no Supabase or
  S3 credentials.

---

## Z. Migration strategy (OpenAI images, Wan 2.1)

Feature flags (env + `routing_policies.rollout_percent`):
`IMAGE_ENGINE = openai | shadow | cineforge` and per-policy canary percentages.

**Images (gpt-image-1 → Cineforge Image Engine)**
1. `IMAGE_ENGINE=openai`: today's behavior, but `resolveSeedKey` already goes
   through `ImageEngine` with an `OpenAIImageAdapter` registered as version
   `openai/gpt-image-1` (status `deprecated`, transitional). Every seed frame now creates an
   `image_generations` row and a metered usage record.
2. `shadow`: for each seed frame, also run the self-hosted model (not shown to
   the user); store both; compare cost, latency and blind-review quality.
3. `cineforge` at 10% → 50% → 100% of users via rollout_percent; OpenAI adapter
   stays registered as fallback.
4. **Exit criteria:** ≥ 2 weeks at 100% with failure rate < 1%, p95 latency
   within target, blind preference ≥ parity on the storyboard eval set. Then
   remove the OpenAI version from production policies (Phase 8) and delete the
   `OPENAI_API_KEY` dependency from image paths. (`generate-frames.mjs` moves to
   the engine in Phase 10+.)

**Video (Wan 2.1 legacy fallback → model-neutral Video Engine)**
1. Register the current Wan 2.1 deployment as `wan/2.1-t2v-1.3b` with status
   `production` (legacy fallback); VideoEngine routes 100% to it — no behavior
   change. Register Wan 2.2 as `production_candidate`, LTX as
   `license_required`, HunyuanVideo 1.5 as `restricted` (territory rules).
2. Final technical benchmark on the video eval set: Wan 2.2 TI2V-5B / A14B,
   HunyuanVideo 1.5 (where permitted), LTX-2.x (internal evaluation only) —
   quality, I2V fidelity to storyboard frames, identity retention, speed, cost.
3. **License gates** (§E): LTX can move to `production_candidate` only with a
   Lightricks agreement or counsel opinion recorded (`agreement_ref`);
   HunyuanVideo stays `restricted` to permitted territories.
4. The best eligible candidate (initially expected: Wan 2.2) is canaried by
   `canary_percent` (5% → 25% → 100%) and promoted to `production`; Wan 2.1
   stays eligible as fallback.
5. **Wan 2.1 removal criteria:** its replacement at 100% for 30 days, fallback
   to Wan 2.1 triggered < 0.5% of jobs, no open incidents, active-character
   LoRAs retrained for the new family. Then status `deprecated` → `retired`,
   pods scaled to 0, image retained 90 days for rollback.

---

## AA. Phased implementation plan

| Phase | Scope | Exit criteria | Depends on |
|---|---|---|---|
| 1 | Architecture & contracts (this doc) | Approved | — |
| 2 | **Secure GPU service**: JWT auth on all endpoints, presigned I/O, outputs under `projects/…`, `/livez` | Unsigned requests rejected in prod; pods without S3 keys; pen-test checklist passed | 1 |
| 3 | Model registry & router: tables, TS interfaces, router with license/territory/capability rules, Wan/Hunyuan/fal/OpenAI registered as versions; `policy.ts` replaced (adds AGENCY) | All current traffic routed through router with identical outcomes | 2 |
| 4 | GPU worker refactor into core + backends; image Dockerfile; placeholder image backend | Contract tests green against placeholder | 2 |
| 5 | Image model bake-off & integration (Qwen-Image/Edit, Z-Image-Turbo, SDXL-inpaint, ESRGAN); license archive | Bake-off report; chosen versions `canary` | 3, 4 |
| 6 | `image_generations`, `entity_images`, usage extension, credit holds, image queue + poller claim, Realtime | Rows → jobs → outputs end-to-end; metering without debit | 3 |
| 7 | Storyboard seed frames via ImageEngine (flow children); UI: generate / regenerate / lock frame | Storyboard run produces frames + I2V clips | 5, 6 |
| 8 | Shadow → canary → remove gpt-image-1 from seed frames; self-hosted image safety classifier | Exit criteria in §Z met | 7 |
| 9 | Character Identity Engine: references, `character_identities`, real LoRA trainer, IdentityService | Identity score threshold met on eval set | 6 |
| 10 | Location / world / asset / poster / key-art generation | Each purpose live with `entity_images` | 6, 9 |
| 11 | Editing: edit, inpaint, outpaint, upscale UI | Mask tools live | 5, 6 |
| 12 | Model-neutral video production: Wan 2.2 benchmark → canary → `production`; LTX evaluated as `license_required` candidate (production only after license clearance); Wan 2.1 → `deprecated` | Canary → 100%; Wan 2.1 removal criteria | 3, legal (LTX) |
| 13 | HunyuanVideo 1.5 as pluggable `restricted` candidate with territory enforcement | Eligible only where its license permits; never in EU/UK/KR | 3 |
| 14 | Unified continuity: ContextCompiler, project bibles, prev/next shot conditioning | Continuity eval improves vs baseline | 7, 9 |
| 15 | Cinematic intelligence & automatic QC (aesthetic, prompt adherence, identity, artifacts) | QC gates auto-regenerate below threshold | 14 |
| 16 | Model Lab: LoRA/adapters/fine-tunes; only on `outputs_trainable` data | First Cineforge-tuned version in canary | 9, 15 |

These product phases run alongside the infrastructure phases I1–I11 (moving to
DeployPro). The combined, dependency-ordered roadmap is in **§AR**. Two rules
tie them together: every product phase is built against the provider-neutral
interfaces (so it works on RunPod/Supabase/Render today and DeployPro later),
and no infrastructure phase starts until the DeployPro capability it needs
(§AG) exists and has passed its gate.

## AB. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LTX competing-use clause / $10M cap | LTX cannot ship, or license cost | Legal gate before Phase 12; Wan 2.2 evaluated in parallel as license-safe primary; registry makes swap configuration-only |
| Hunyuan territory exclusion (EU/UK/KR) | Premium unavailable to those users; legal exposure if misrouted | Router hard rule on billing country; UI disclosure; audit log of routing decisions |
| Hunyuan output-training ban | Contaminated Model Lab datasets | `outputs_trainable=false` tagging; dataset builder filters by license |
| Licenses change (new versions, new terms) | Previously-OK model becomes restricted | License pinned per *version*; re-verification required to register new versions; archived copies |
| Unverified licenses (SD 3.5, LTX 13B 0.9.x, pose models, HiDream-E1) | Wrong inclusion | Excluded until verified from primary source |
| No commercial face-ID stack | Weaker identity than InsightFace-based adapters | LoRA + multi-reference editing; evaluate a commercially licensed face embedding or buy InsightFace commercial license |
| Qwen-Image VRAM/latency | Cost per frame | Z-Image-Turbo drafts; FP8; distilled variants; batch by version |
| Mask inpaint quality on primary model unknown | Editing UX | SDXL-inpaint utility fallback |
| Diffusers version conflicts across backends | Broken builds | One Docker image per backend with pinned deps; contract tests per image |
| Cold starts with scale-to-zero | Slow first frame | Predictive warm-up on storyboard start; min_pods=1 in business hours (configurable) |
| Credit model change surprises users | Trust | Meter-only period; visible estimates before run; holds shown in UI |
| Other third-party dependencies remain | Not fully self-hosted | Out of scope here: Anthropic (Director), fal (voice, avatars, music, video upscale), OpenAI (TTS, moderation). Tracked for later phases; the `cineforge-audio-worker` slot (§AO) is where self-hosted audio models land |
| **DeployPro is single-host today** (README: "Multi-node scheduling" under "Not built") | GPU pool across machines impossible until built | Infra phases I3+ are gated on the DeployPro capabilities listed in §AG; Cineforge keeps RunPod adapter active until each gate passes |
| **DeployPro has no GPU support yet** (not mentioned in its documentation) | No DeployPro GPU workers | DeployPro work items in §AG (NVIDIA container runtime, GPU inventory, leases); RunPod remains the GPU provider meanwhile |
| **DeployPro has no object storage or metrics yet** ("Metrics and graphs" under "Not built"; object storage not documented) | Storage and observability cannot move | Supabase Storage stays (adapter); Cineforge exposes its own Prometheus metrics; DeployPro adds S3-compatible storage and a metrics stack before I10 |
| DeployPro API uses one global bearer token | Over-privileged automation credential for Cineforge | Request project-scoped / capability-scoped tokens in DeployPro before Cineforge automates against it (§AP) |
| Owned GPU hardware: capacity planning, failures, power, cooling | Outages without cloud elasticity | Keep RunPod adapter as burst/overflow provider permanently configurable; N+1 GPU capacity per pool; scheduler drains failed nodes |
| Hybrid period crosses the public internet (Render ↔ DeployPro GPUs) | Exposure of GPU gateway | JWT + mTLS + allow-list; temporary route removed at I8 |
| Hosting Supabase services ourselves (if chosen, §AL) | Operational burden (Auth, PostgREST, Realtime, Storage API) | Stay on managed Supabase until DeployPro has backups/restore tested for Postgres; migrate DB last |

## AC. Hardware requirements

| Pool | Workload | Recommended GPU | Minimum | Notes |
|---|---|---|---|---|
| image | Qwen-Image / Edit (bf16) | **L40S 48 GB** or A6000/A40 48 GB | 24 GB with FP8 + offload (slower) | text encoder + transformer + VAE resident |
| image-draft | Z-Image-Turbo | L4 24 GB / RTX 4090 24 GB | 16 GB (vendor) | can co-host ESRGAN |
| image-utility | SDXL inpaint, ESRGAN, Depth-Anything-S | L4 24 GB | 12 GB | |
| video-48g / 24g | Wan 2.2 TI2V-5B 720p (leading production candidate) | RTX 4090 / L40S | 24 GB (vendor) | |
| video-80g | Wan 2.2 A14B 720p | H100 / A100 80 GB | 80 GB (vendor) | |
| video-80g (candidate, license_required) | LTX-2.x 13B-class | **H100 80 GB** | A100 80 GB; FP8 for 48 GB | vendor: HD ~10 s on H100 (0.9.8 distilled) |
| video-80g (restricted) | HunyuanVideo 1.5 | A100 80 GB / H100 | 14 GB with offload (vendor, slow) | 1080p SR adds time; permitted territories only |
| video-legacy | Wan 2.1 1.3B | L4 / 4090 | 8.19 GB (vendor) | existing |
| training | LoRA (image + video families) | A100 80 GB / H100 | 48 GB for image LoRA | on-demand pool |

Network volumes: ~200 GB per video deployment, ~120 GB per image deployment
(weights + cache).

### Owned hardware for DeployPro (planning profiles — to be confirmed by bake-off measurements)

| Node class | Role | Suggested configuration | Notes |
|---|---|---|---|
| GPU-IMG | image pool, upscaling, utilities | 2× 48 GB GPUs (L40S / RTX 6000 Ada class), 32+ CPU cores, 256 GB RAM, 2–4 TB NVMe (model cache) | Qwen-Image family resident; Z-Image draft co-hosted on the second GPU |
| GPU-VID | video models (whichever versions are eligible: Wan 2.2 first; LTX if licensed) | 2–4× 80 GB GPUs (H100 / A100 80 GB class), 64+ cores, 512 GB RAM, 4–8 TB NVMe | one model per GPU; NVLink not required for single-GPU inference |
| GPU-PREM | premium video (HunyuanVideo 1.5 + SR) | 80 GB class GPUs | only serves users outside EU/UK/KR (license) |
| GPU-TRAIN | LoRA / identity training, Model Lab | 80 GB class GPUs | scheduled jobs; can lend capacity to video pools when idle |
| CPU-RENDER | FFmpeg assembly, transcoding, HLS, thumbnails, mastering | 32–64 cores, 128 GB RAM, fast NVMe scratch; optional NVENC-capable GPU | horizontally scaled render workers (§AJ) |
| CORE | Postgres, Redis, object storage, control plane, web/API | 3 nodes for HA when DB moves; separate storage disks; backups off-site | DeployPro control plane already runs on one host today |
| Network | private interconnect | 10–25 GbE between GPU nodes and object storage | weights and media move node↔storage, not over the internet |

Minimum viable first DeployPro GPU step (infra phase I4): **one GPU-IMG node**
— lowest VRAM requirement, highest request volume, and no license
restrictions on the image models.

## AD. Estimated GPU resource requirements (planning estimates — to be replaced by bake-off measurements)

Assumptions: one storyboard film = 40 shots; 1 draft + 1 locked frame per shot;
~15% regenerations; video 5 s per shot.

| Item | Est. GPU time per unit | Per film |
|---|---|---|
| Draft frame (Z-Image-Turbo, 1280×720) | ~1–3 s (L4/4090) | ~2 min |
| Locked frame (Qwen-Image, 30 steps) | ~20–40 s (L40S); ~6–10 s distilled | ~15–25 min |
| Video 5 s (LTX distilled, 720p) | ~15–40 s (H100) | ~15–30 min |
| Video 5 s (Wan 2.1 1.3B 480p) | ~4 min (4090, vendor, unoptimized) | ~160 min |
| Video 5 s (Hunyuan 1.5 720p) | ~2–5 min (A100/H100) | ~80–200 min |

Image pool sizing: 1 L40S handles ~100–180 locked frames/hour; start
`min_pods=0, max_pods=2`, scale on queue depth. Video (production model): start
`max_pods=2` H100. Re-plan after Phase 5/12 measurements.

## AE. Testing strategy

- **Contract tests** (CI, no GPU): TS adapters ↔ FastAPI using placeholder
  backends; JSON schema validation of every request/response; auth tests
  (missing/expired/wrong-aud/wrong-scope/replayed `jti`/body-hash mismatch all
  rejected).
- **Router tests** (pure): license, territory, revenue-cap, capability and plan
  rules; canary hashing stability; decision persistence.
- **DB tests:** RLS (owner/other/anon), guard triggers (users can't write
  status/outputs/metrics), key-prefix validation, idempotency uniqueness,
  credit-hold arithmetic.
- **Pipeline integration** (CI with placeholder GPU): row → poller → queue →
  engine → storage → realtime; retries and failure codes; resume after worker
  crash.
- **GPU smoke tests** (per image build, on a RunPod test pod): load weights,
  one generation per operation, VRAM peak recorded, determinism with fixed seed.
- **Model bake-off** (Phase 5 / 12): fixed eval sets — 150 storyboard prompts
  (shot sizes × lighting × genres × locales), 30 characters × 5 shots identity
  set, 50 edit/inpaint tasks, 60 I2V shots from storyboard frames; blind
  pairwise human review + automatic scores (prompt adherence, aesthetic,
  identity similarity with a commercially licensed embedder); report cost and
  latency.
- **Shadow and canary** in production with automatic rollback on alert
  thresholds (§X).
- **Load tests:** 50 concurrent storyboard runs against scaled pools; queue
  fairness by tier.
- **Security tests:** endpoint scan of pods, presigned URL scope/expiry,
  storage cross-project access attempts.

---

# Part II — DeployPro: Cineforge's long-term infrastructure and media-render platform

## AF. Portability principles (binding for every new service)

Cineforge is being developed as part of a larger infrastructure strategy using
DeployPro. **The final production architecture must not depend permanently on
public Render, Vercel or RunPod infrastructure.** Public cloud services used
during development are progressively replaced by infrastructure controlled
through DeployPro, while the existing system remains operational at every step.

**Build with (portable):** Docker images · containers · PostgreSQL · Redis ·
BullMQ · FastAPI · Node.js · Linux · NVIDIA CUDA (NVIDIA container runtime) ·
S3-compatible object storage · standard HTTP APIs · standard internal
networking (DNS service names, private subnets) · environment-variable
configuration · Prometheus-format metrics · JSON logs to stdout.

**Avoid in new code:** Render-specific assumptions · Render-specific APIs ·
Render-only deployment logic · Render-only worker behavior · Render-only
networking · Render-only storage assumptions — and the same for Vercel
(edge runtime, Vercel KV/Blob/Edge Config, `VERCEL_*` behavior beyond
cosmetic preview flags), RunPod (RunPod SDK/control API outside the RunPod
adapter, RunPod proxy URL formats outside configuration) and Supabase
(Supabase-only features outside the boundary in §AL).

**Do not lock Cineforge permanently to:** Vercel · Render · RunPod · OpenAI
image generation · third-party video APIs · third-party GPU APIs. These may be
temporary providers during development; each sits behind an adapter that can
be removed without changing product code.

Checklist applied to every new service before merge:
1. Ships as a Docker image built in CI; runs with `docker run` + env vars.
2. Reads all endpoints/credentials from env (no provider hostnames in code).
3. Health: HTTP `/livez` (liveness) and `/readyz` (readiness) — or, for
   queue workers without HTTP, a heartbeat key in Redis + a tiny HTTP probe.
4. Logs JSON to stdout; metrics on `/metrics` (Prometheus text format).
5. Stateless or state on Postgres / Redis / object storage / declared volume.
6. Graceful shutdown on SIGTERM (finish or requeue current job).
7. Talks to other services by service name on the private network.
8. No inbound public port unless it is the web/API edge service.

## AG. DeployPro today: capabilities and gaps (from its repository)

Source: `ICOFCUCAM/deploygenus` README (read 2026-10-06). DeployPro is a
self-hosted deployment platform: `git push → clone → detect → docker build →
run → health check → route`; control plane = Python API + PostgreSQL (as the
deployment queue) + Traefik + web dashboard.

**Capabilities Cineforge can use as-is**

| DeployPro capability | Cineforge use |
|---|---|
| Build detection: `Dockerfile` > `deploypro.json` > project settings > framework signatures > static | Every Cineforge service ships a Dockerfile (most explicit) |
| Process types: **web**, **worker** (`--replicas N`), **cron** (5-field, UTC), all from the same image | `cineforge-web` (web), `cineforge-worker` / `cineforge-render-worker` / `cineforge-scheduler` (worker), maintenance jobs (cron) |
| "A preview of a branch must not start a second consumer on the same queue" (workers and cron run against production only) | Matches BullMQ exactly-once consumption; previews never consume production queues |
| Immutable deployments; rollback = pointer move ("a restart rather than a rebuild"); `keep_warm` | Safe Cineforge releases and instant rollback |
| Private Docker network; no deployment publishes a host port; reachable only through the router | GPU/CPU workers and data services stay private (§AN) |
| Traefik: permanent per-deployment hostnames (container labels) + production domains (watched file); automatic TLS (Let's Encrypt; wildcard via DNS-01) | `cineforge-web` / `cineforge-api` domains and TLS |
| Encrypted env vars (Fernet, scoped production/preview, never readable back through API); BuildKit secret mounts | All Cineforge secrets, including per-deployment GPU JWT keys |
| Project-owned volumes (never mounted into previews); daily checksummed, restore-tested backups | Redis AOF, model cache, Postgres data (when moved) |
| Health checks before promotion; production checked every minute, reported after two failures | Web/API health gating |
| API: `/api/projects`, `/deploy`, `/deployments`, `/env`, `/domains`, `/volumes`, `/processes`, `/deployments/{id}/logs[/stream]`, `/promote`, `/redeploy`, `/cancel`, `/processes/{id}/run[s]`, `/webhooks/{slug}`; bearer token | CI/CD automation of Cineforge deployments |
| Injected env: `PORT`, `DEPLOYPRO_URL`, `DEPLOYPRO_DEPLOYMENT`, `DEPLOYPRO_GIT_SHA`, `DEPLOYPRO_ENV` | Replace `VERCEL_*` preview flags |

**Gaps DeployPro must close before each Cineforge migration step** (README
lists "Multi-node scheduling", "Metrics and graphs", "Off-site backup copies",
"Restoring the database from the CLI" as *Not built*; GPU and object storage
are not mentioned):

| # | Required DeployPro capability | Needed for | Notes |
|---|---|---|---|
| G1 | **Multi-node**: node agent on each server, node registration, heartbeat, private overlay network between nodes (e.g. WireGuard mesh) | I3+ (any GPU node beyond the control-plane host) | Single-host today |
| G2 | **GPU support**: NVIDIA driver + NVIDIA container runtime on nodes; run containers with specific GPU devices; GPU inventory (model, VRAM total/free, utilization, temperature, ECC/XID errors via NVML) | I3–I6 | Not documented today |
| G3 | **GPU workload placement + lease API** (§AP): "give me a GPU capable of X"; model-aware scheduling (§AI) | I3–I6 | Cineforge never addresses machines |
| G4 | **Model/weights cache** per node (pull from object storage to local NVMe, keyed by weights revision, LRU eviction) | I4–I6 | Avoid re-downloading 20–60 GB per cold start |
| G5 | **S3-compatible object storage** service with buckets, access keys scoped per bucket/prefix, presigned URLs, lifecycle rules, replication/backups | I10 | Must speak the S3 API so `StorageAdapter` is a configuration change |
| G6 | **Metrics stack** (Prometheus scrape + dashboards + alerting) and log aggregation across nodes | I3+ (operating GPU nodes), required before I8 | "Metrics and graphs: Not built" |
| G7 | **Scoped API tokens** (per project / per capability) instead of one global token | I3 (Cineforge automating leases) | Least privilege for `cineforge-gpu-manager` |
| G8 | **Internal service discovery** across nodes (stable DNS names) | I7–I9 | Single Docker network today |
| G9 | **Stateful services**: Redis with persistence; Postgres with backups, PITR and CLI restore | I9 (Redis), I11 (Postgres) | "Restoring the database from the CLI: Not built" |
| G10 | **Off-site backups** | Before any data moves | "Off-site backup copies: Not built" (rclone/rsync suggested) |
| G11 | **Non-HTTP health** for worker processes (heartbeat-based) | I7–I8 | Health today is HTTP-based for web |
| G12 | **mTLS / service certificates** on the private network (optional hardening) | I3 hybrid gateway, later internal | |
| G13 | **Resource limits & quotas** per process (CPU, RAM, GPU count) | I7+ | Protect co-located services |

These are DeployPro work items, not Cineforge work items; Cineforge only
consumes them through the contracts in §AH, §AK and §AP.

## AH. GPU provider abstraction

The existing lifecycle manager (`packages/gpu/lifecycle-manager.ts`,
`runpod-control.ts`, `cluster.ts`, `fairness.ts`, `active-job-tracker.ts`) is
abstracted rather than hard-coded to RunPod:

```
GpuProvider (interface)
 ↓
GpuProviderAdapter
 ├── RunPodAdapter        (wraps today's runpod-control.ts + RunpodClient; development / burst)
 ├── DeployProAdapter     (DeployPro GPU lease API, §AP; preferred)
 └── FutureProviderAdapter (any other GPU provider, or a static list of workstation GPUs for development)
```

Contracts (TypeScript, design only):

```ts
export type GpuJobType = "image" | "video" | "audio" | "upscale" | "training";

export interface GpuRequirements {
  modelVersionId: string;            // registry id, e.g. "qwen-image/2511-edit"
  workerImage: string;               // container image (digest-pinned) that runs the backend
  backend: string;                   // BACKEND env, e.g. "image_qwen"
  jobType: GpuJobType;
  minVramMb: number;                 // from media_model_versions.capabilities.requirements
  gpuClasses?: string[];             // allowed classes, e.g. ["L40S","RTX6000ADA","A100-80","H100"]
  minComputeCapability?: string;     // e.g. "8.0"
  minCudaDriver?: string;            // e.g. "550"
  diskGb: number;                    // weights + scratch
  estGpuMs: number;                  // from router estimate
  priority: number;                  // from DeficitFairScheduler / plan tier
  plan: "FREE" | "CREATOR" | "STUDIO" | "AGENCY" | "ENTERPRISE";
  preferWarm: boolean;               // prefer a worker that already has this model loaded
  exclusive: boolean;                // whole GPU (default true; one inference per GPU)
  regionHint?: string;               // data residency, never a machine
  labels?: Record<string, string>;
}

export interface GpuLease {
  leaseId: string;
  workerId: string;                  // opaque; never an IP shown to product code
  endpoint: string;                  // private service URL (DeployPro) or proxy URL (RunPod)
  audience: string;                  // JWT aud the worker expects (§O)
  modelLoaded: boolean;              // false → caller waits for readiness
  gpuClass: string; vramMb: number;
  expiresAt: string;                 // lease TTL; renewed by heartbeat
  provider: "runpod" | "deploypro" | string;
}

export interface GpuCapacity {          // aggregated, no machine identities
  byClass: Array<{ gpuClass: string; total: number; free: number; warmModels: string[] }>;
  queued: number;
}

export interface GpuProvider {
  readonly id: string;
  /** Ensure a worker type is registered/deployable (image + backend + env refs). */
  ensureWorkload(spec: { workerImage: string; backend: string; envRefs: string[]; requirements: Omit<GpuRequirements, "estGpuMs" | "priority" | "plan"> }): Promise<void>;
  /** Ask for a GPU capable of running the requirement. Resolves when assigned (or queued with ETA). */
  acquire(req: GpuRequirements, signal?: AbortSignal): Promise<GpuLease>;
  renew(leaseId: string): Promise<void>;
  release(leaseId: string, outcome: { gpuMs: number; failed?: boolean }): Promise<void>;
  capacity(): Promise<GpuCapacity>;
  /** Optional demand hint (warm-up before a storyboard run). */
  prewarm?(modelVersionId: string, count: number): Promise<void>;
}
```

- **Two schedulers, two responsibilities.**
  *Cineforge* decides **what** runs and **in which order**: model version
  (ModelRouter, §H), user fairness and plan priority (existing
  `DeficitFairScheduler`), retries and billing.
  *DeployPro* decides **where** it runs: which node and GPU, model residency,
  bin-packing, draining failed hardware (§AI).
- RunPod adapter semantics: `acquire` = pick a running pod of the deployment
  (start it via `runpod-control` if stopped) and return its proxy URL;
  `release` = mark idle (lifecycle manager stops it after the idle timeout).
  Behavior identical to today, now behind the interface.
- Provider selection is registry configuration
  (`media_model_deployments.provider`), so one model version can run on
  DeployPro with RunPod as overflow (`fallbackProvider`), enabling a gradual
  move and permanent burst capacity.
- Developer mode: `StaticGpuProvider` reading `GPU_WORKERS=url1,url2` for a
  local NVIDIA machine — the same contract, no cloud.

## AI. Model-aware GPU scheduling (DeployPro scheduler)

Do not assume every GPU can run every model. Each model version publishes its
requirements in the registry (`media_model_versions.capabilities.requirements`):
`minVramMb`, `recommendedVramMb`, `gpuClasses`, `minComputeCapability`,
`diskGb`, `loadTimeSec`, `canShareGpu` (false by default), `jobType`.

Flow:

```
Generation Request (Cineforge: row claimed, model version routed)
 ↓
Model Requirements (registry: VRAM, GPU class, compute capability, disk, job type)
 ↓
GPU Capability Check (DeployPro: filter nodes/GPUs that can EVER run it)
 ↓
Available GPU Search (DeployPro: healthy, not draining, free or soon-free; prefer warm)
 ↓
Worker Assignment (lease issued; capacity reserved for est. GPU time)
 ↓
Model Loading (container started with BACKEND + weights from node cache; skipped if warm)
 ↓
Generation (Cineforge worker calls the leased endpoint, JWT-authenticated)
 ↓
Result (outputs written to object storage via presigned URLs)
 ↓
Worker Availability (lease released; worker stays warm for keep-warm window or is reclaimed)
```

Placement scoring (DeployPro side; weights configurable):

| Signal | Effect |
|---|---|
| GPU type / VRAM / compute capability / driver | hard filter (must satisfy requirements) |
| available capacity (free GPU, free VRAM) | hard filter for exclusive jobs |
| model loaded (warm) | strong preference — avoids 30–300 s load |
| current workload / queue on node | prefer least-loaded |
| queue priority & user plan | higher priority leases preempt **queue position**, never a running job |
| estimated GPU time | short jobs packed onto nodes about to free; long jobs onto dedicated GPUs |
| job type | training only on training-capable GPUs; never displaces interactive image work during peak |
| node health (XID/ECC errors, thermals) | unhealthy nodes drained |
| model weights present in node cache | prefer to avoid download |

Examples (illustrative; final mapping from measurements):

| Workload | GPU requirement |
|---|---|
| LTX (13B-class, distilled/standard) | GPU with required VRAM (80 GB class preferred; 48 GB with FP8) |
| HunyuanVideo 1.5 (+ 1080p SR) | higher-capacity GPU (80 GB class) |
| Image model (Qwen-Image / Edit) | 48 GB class (24 GB with FP8 + offload, slower) |
| Draft image (Z-Image-Turbo) | 16–24 GB class |
| Upscaling (Real-ESRGAN) | any ≥ 8 GB GPU; can share with draft image GPU |
| LoRA training | training-capable GPU (80 GB class), long leases, preemptible by policy |
| Audio models (future) | small GPUs or CPU, per model requirements |

Model residency: a GPU keeps the last-used model loaded for a keep-warm
window (configurable per pool: image 10 min, video 15 min); the scheduler
counts warm workers per model version and exposes them via `capacity()` so
Cineforge's router can prefer versions that are already warm (§H `w_warm`).

Workers capable of running image models, video models, audio models,
upscalers and training jobs are all **the same kind of DeployPro GPU worker**
(a container on a GPU) differing only in image/backend and requirements:

```
GPU Worker 01   GPU Worker 02   GPU Worker 03   …   GPU Worker N
(image)         (video: LTX)    (video: Hunyuan)    (training / upscale / audio)
```

## AJ. Media render pipeline ("render" has two meanings)

| Term | Meaning | Today | Target |
|---|---|---|---|
| **Application/server rendering** | serving the web app, APIs, workers, databases, Redis, queues, auth | Vercel (web), Render (worker, Redis), Supabase (DB/Auth/Storage) | DeployPro web/worker processes and data services |
| **Media/GPU rendering** | image generation, video generation, audio generation, FFmpeg rendering, transcoding, thumbnails, previews, upscaling, final mastering | RunPod (GPU), FFmpeg inside `apps/worker` on Render, fal (Topaz upscale, audio) | DeployPro CPU render workers + GPU workers |

To avoid confusion in code and docs: "Render" (capital R, the vendor) is only
ever named in deployment config; the media stage is called **render** (lower
case) as in `render.processor.ts`.

Target media pipeline (applies to image generation, video generation, video
rendering, audio processing, localization, subtitles, thumbnails, posters,
upscaling and final export):

```
Cineforge
 ↓
Production Job            (row in Postgres: image_generations / video_generations / render jobs …)
 ↓
DeployPro Scheduler       (CPU or GPU placement; Cineforge never picks the machine)
 ↓
CPU/GPU Worker            (cineforge-render-worker for FFmpeg; GPU workers for models)
 ↓
Processing
 ↓
Storage                   (StorageProvider; projects/{projectId}/…)
 ↓
Cineforge Asset           (entity_images, shots, films, voiceovers …)
 ↓
Preview                   (low-res proxies, thumbnails, HLS preview)
 ↓
Final Master              (mastered MP4/HLS, localized variants, subtitles, poster)
```

- `cineforge-render-worker`: FFmpeg assembly (`render-engine.ts`), transcode,
  HLS ladder, thumbnails/posters, subtitle muxing, localization remux
  (`localize.processor.ts` remux step), loudness normalization, final master.
  Extracted from `cineforge-worker` so CPU-heavy work scales separately; same
  BullMQ queues (`render`, `localize`) — only the process that consumes them
  changes.
- CPU render work uses DeployPro **worker processes with replicas** today
  (single host) and multi-node placement later (G1). Optional NVENC GPU
  encoding is a requirement label (`encoder: nvenc`) on the job.
- Upscaling of video (today fal Topaz) and audio generation (today fal / OpenAI)
  get self-hosted slots (`cineforge-upscale`, `cineforge-audio-worker`) but
  model selection for them is out of scope of this document.

## AK. Storage provider abstraction

```
StorageProvider (interface)
 ↓
StorageAdapter
 ├── SupabaseStorageAdapter       (current: S3 API for worker/GPU; supabase-js signed URLs for browser)
 ├── DeployProObjectStorageAdapter (target: DeployPro S3-compatible object storage, G5)
 └── FutureStorageAdapter          (any S3-compatible store)
```

```ts
export interface StorageObject { key: string; size: number; contentType?: string; etag?: string }
export interface StorageProvider {
  readonly id: string;
  put(key: string, body: Uint8Array | ReadableStream, contentType: string): Promise<StorageObject>;
  get(key: string): Promise<ReadableStream>;
  head(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  list(prefix: string, cursor?: string): Promise<{ objects: StorageObject[]; cursor?: string }>;
  presignGet(key: string, ttlSec: number): Promise<string>;      // GPU inputs, browser reads
  presignPut(key: string, contentType: string, ttlSec: number): Promise<string>; // GPU outputs, browser uploads
}
```

- **Keys are provider-independent** (`projects/{projectId}/…`, §P). Bucket
  names come from config. Rows store keys, never URLs.
- The worker's `S3Storage` (`apps/worker/src/storage/storage.ts`) is already a
  generic S3 client — it becomes the base of both adapters.
- **GPU workers never hold storage credentials** (presigned URLs, §P) — so
  switching providers needs no GPU change at all.
- **Browser access** is the Supabase-specific part today
  (`sb.storage.from(BUCKET).upload(...)`, `createSignedUrl(s)` guarded by
  storage RLS). Behind the boundary (§AL) it becomes a **media access service**
  (`cineforge-api`): `POST /media/sign` with the user's JWT → checks
  `owns_project` in Postgres → returns presigned GET/PUT URLs from whichever
  adapter is active. The browser code calls one helper (`lib/storyboard.ts
  signedUrl` / `uploadAsset`) so the swap is local to that helper.
- **Migration (infra phase I10):** new writes go to the DeployPro store;
  reads use a resolver that checks the new store first then falls back to the
  old one; a background copy job backfills by prefix with checksum
  verification; when the old store has no unique objects, the fallback is
  removed. Supabase Storage remains available throughout and can be retained
  as secondary/backup.
- No new bucket is created unless technically justified (e.g. a separate
  public bucket on DeployPro for `cineforge-public` showcase media served via
  CDN).

## AL. Database portability

Keep PostgreSQL compatibility; Supabase is the current managed environment.

| Supabase-specific feature in use | Where | Portability strategy |
|---|---|---|
| Postgres (tables, enums, functions, triggers, RLS) | everywhere | Standard Postgres; migrations in `packages/db/supabase/migrations` stay plain SQL. Extensions used: `pgcrypto`, `vector` (pgvector) — both available on any Postgres |
| `auth.users`, `auth.uid()` in RLS, GoTrue JWT | RLS policies, `handle_new_user` | Isolate: RLS reads the user id from the JWT claim (`request.jwt.claims` → `sub`). Self-hosted GoTrue keeps `auth.uid()` working unchanged |
| PostgREST (browser → tables via supabase-js) | all web data access | Boundary = `apps/web/lib/supabase.ts` + `lib/*` helpers; target either self-hosted PostgREST (no app change) or `cineforge-api` endpoints |
| Realtime (progress/status) | studio progress, generation status | Self-hosted Realtime, or `cineforge-api` SSE backed by Postgres `LISTEN/NOTIFY` |
| Storage (+ storage RLS) | uploads, signed URLs | `StorageProvider` + media access service (§AK) |
| Edge Functions (Deno): `stripe-checkout`, `stripe-webhook`, `team-invite` | Pricing, Teams | Move to `cineforge-api` (Node) handlers — portable HTTP |
| Advisors / dashboard | ops | replaced by DeployPro ops tooling |

Recommended path (lowest risk, no product rewrite):
1. Now: managed Supabase; all new Cineforge services use **plain Postgres**
   (Prisma / `pg`) and S3 — never supabase-js on the server side.
2. Isolate: every browser call to Supabase goes through `lib/` helpers (already
   largely true); Edge Functions move to `cineforge-api`.
3. Target: run Postgres on DeployPro (with backups/PITR, G9/G10) and either
   (a) the open-source Supabase services (GoTrue, PostgREST, Realtime,
   Storage API) as DeployPro processes — RLS and browser code unchanged — or
   (b) `cineforge-api` replacing PostgREST/Realtime for the browser. Decision
   deferred to I11; (a) is preferred for continuity. License of each
   self-hosted Supabase component must be verified from its repository
   before choosing (a).
4. Cutover by logical replication (Supabase → DeployPro Postgres), read-only
   window, DNS/env switch, rollback by reversing replication.

## AM. Redis / BullMQ on DeployPro

The existing BullMQ + Redis architecture is kept. Target:

```
Cineforge
 ↓
Redis          (DeployPro process on the private network, AOF persistence on a DeployPro volume)
 ↓
BullMQ         (unchanged queues: film, scene, video, image, audio, render, localize, lora, publish, social, voice-lab)
 ↓
DeployPro Workers (cineforge-worker, cineforge-render-worker, cineforge-scheduler …)
```

- Configuration only: `REDIS_URL`. No code changes.
- Today's Render Key Value is the free plan with **no persistence**; this is
  acceptable only because rows in Postgres are the source of truth (row-first
  pattern). On DeployPro, enable AOF persistence anyway.
- Cutover (I9): pause producers (poller), let queues drain, switch `REDIS_URL`
  on all workers, resume. Because jobs are rebuilt from Postgres rows on
  restart, a drained switch loses nothing.
- `maxmemory-policy noeviction` (BullMQ requirement); memory sized for
  queue depth peaks; Redis not exposed outside the private network; AUTH
  password from DeployPro encrypted env.

## AN. Networking

Preferred architecture:

```
PUBLIC INTERNET
 │
 ▼
CDN / REVERSE PROXY            (DeployPro edge: Traefik + TLS; CDN for public media)
 │
 ▼
CINEFORGE WEB                  (cineforge-web, cineforge-api — the only public services)
 │
 ▼
PRIVATE NETWORK
 │
 ┌──────┼─────────┐
 │      │         │
API   QUEUE     STORAGE        (cineforge-api, Redis, object storage, Postgres)
 │      │
 │   WORKERS                   (cineforge-worker, cineforge-scheduler)
 │      │
 └──────┼─────────────┐
        │             │
   CPU WORKERS    GPU WORKERS  (cineforge-render-worker; image/video/audio GPU workers)
                      │
                  NVIDIA GPU
```

- **GPU services are never publicly accessible**; they communicate only over
  authenticated internal networking (private network + JWT per request, §O;
  mTLS where available, G12).
- Service discovery by stable names (e.g. `redis.cineforge.internal`,
  `postgres.cineforge.internal`, `objects.cineforge.internal`) — provided by
  DeployPro (G8); Cineforge reads them from env.
- Cross-node private traffic over an encrypted overlay (G1).
- Egress policy: GPU workers need no internet egress in steady state (weights
  come from object storage); allow-list only for initial weight import.
- Public media delivery: signed URLs (private bucket) or CDN for
  `cineforge-public` showcase objects.
- Hybrid period exception: §O (GPU gateway with JWT + mTLS + allow-list),
  removed at I8.

## AO. Deployment model: one Docker image per service

Every Cineforge service is a Docker image that DeployPro deploys and manages
independently (and that runs on today's providers too):

| Image | Source in repo | Role | DeployPro process type | Today runs on |
|---|---|---|---|---|
| `cineforge-web` | `apps/web` (new Dockerfile; Next.js standalone output) | web app (SSR + static) | web | Vercel |
| `cineforge-api` | `apps/api` reused (NestJS), auth switched to Supabase/GoTrue JWT verification | media signing (§AK), moved Edge Functions (Stripe, team invite), internal admin APIs, future browser API (§AL) | web (internal + public routes) | not deployed |
| `cineforge-worker` | `apps/worker` | BullMQ processors: film, scene, video, image, audio, localize (translation), lora, publish, social, voice-lab, notify | worker (`--replicas N`) | Render |
| `cineforge-scheduler` | `apps/worker` entrypoint `scheduler` (poller + router + fair dispatch extracted from `project-poller.ts`) | claims rows, credit holds, enqueues jobs; single active instance (leader lock in Redis/Postgres) | worker (1 replica) | inside Render worker |
| `cineforge-gpu-manager` | `packages/gpu` as a service | `GpuProvider` adapters, leases, warm-up, capacity reporting; on RunPod also starts/stops pods | worker (1 replica) | inside Render worker |
| `cineforge-render-worker` | `apps/worker` entrypoint `render` | FFmpeg render/transcode/thumbnails/HLS/mastering (§AJ) | worker (replicas, CPU-heavy) | inside Render worker |
| `cineforge-image-worker` | `apps/gpu-worker` + `BACKEND=image_*` | image generation/edit/inpaint/outpaint/upscale | GPU worker (DeployPro GPU placement) | RunPod (planned) |
| `cineforge-video-worker` | `apps/gpu-worker` + `BACKEND=video_ltx|video_hunyuan|video_wan` (one image per backend) | video generation | GPU worker | RunPod (Wan today) |
| `cineforge-comfy-worker` | `apps/gpu-worker` core (sidecar) + pinned ComfyUI + allow-listed node set (`comfy-image`, `comfy-video` profiles) | `ComfyUIRuntime` execution (§AT.10); ComfyUI bound to 127.0.0.1 | GPU worker | — (new) |
| `cineforge-audio-worker` | `apps/gpu-worker` + `BACKEND=audio_*` (future) | self-hosted TTS / voice / music | GPU or CPU worker | fal / OpenAI today |
| `cineforge-trainer` | `apps/gpu-worker` + `BACKEND=train_lora` | identity LoRA training (§R) | GPU worker (long leases) | stub today |

Naming note: *BullMQ processors* (TypeScript, in `cineforge-worker`) orchestrate;
*GPU workers* (Python containers) execute models. A processor never runs
inference itself.

Build & release: CI builds and pushes all images (digest-pinned) to a registry
DeployPro can pull from (today GHCR is used by `build-gpu-worker.yml` /
`worker-image.yml`); DeployPro deploys by image digest or by building from the
repo using the Dockerfile. Same images deploy to Render/RunPod during
migration.

## AP. Control plane contract (Cineforge ↔ DeployPro)

Long-term, DeployPro is the control plane for: application deployment ·
container deployment · CPU workers · GPU workers · service health · logs ·
metrics · scaling · domains · TLS · environment variables · secrets · storage
· networking · deployment history · resource usage. Cineforge consumes
infrastructure through standard APIs and never controls physical
infrastructure directly.

**Cineforge must not know the physical server.** It requests "give me a GPU
capable of running this model"; it never says "run this on server
192.168.x.x". DeployPro decides where the job runs.

Already available (DeployPro API, bearer token): projects, deploy,
deployments, env, domains, volumes, processes, logs/stream, promote, redeploy,
cancel, process runs, webhooks — used by Cineforge CI/CD.

Proposed extensions for DeployPro to implement (G2, G3, G5, G6, G7):

```
# GPU workloads (registered once per worker image/backend)
POST   /api/gpu/workloads                 { name, image, backend, envRefs[], requirements{minVramMb,gpuClasses[],minComputeCapability,diskGb,jobType} }
GET    /api/gpu/workloads/{name}

# Leases ("give me a GPU capable of …")
POST   /api/gpu/leases                    GpuRequirements (§AH) → 201 GpuLease | 202 { leaseId, status:"queued", etaSec }
GET    /api/gpu/leases/{id}               → GpuLease (status: queued|assigned|loading|ready|released|failed)
POST   /api/gpu/leases/{id}/renew         → { expiresAt }
DELETE /api/gpu/leases/{id}               { gpuMs, failed? }      (release)
POST   /api/gpu/prewarm                   { workload, modelVersionId, count, ttlSec }

# Capacity (aggregated; no machine identities)
GET    /api/gpu/capacity                  → GpuCapacity (§AH)

# Usage / metering source of truth for infrastructure cost
GET    /api/usage?project=cineforge&from=&to=   → GPU-seconds by workload/class, CPU-seconds, storage GB-month, egress

# Object storage (S3 API for data; control API for buckets/keys)
POST   /api/storage/buckets               { name, public:false }
POST   /api/storage/keys                  { bucket, prefix?, permissions:["read","write"] } → { accessKeyId, secretAccessKey }

# Observability
GET    /metrics (per node, Prometheus) · log aggregation API
```
Auth: DeployPro scoped tokens (G7) — `cineforge-gpu-manager` holds a token
limited to `gpu:*` for the `cineforge` project; CI holds `deploy:*`.
Events: DeployPro → Cineforge webhooks (lease ready, node draining, deployment
promoted) signed with HMAC (DeployPro already verifies webhook signatures in
constant time for inbound hooks).

## AQ. DeployPro GPU pool (multiple physical servers)

```
DeployPro GPU Pool
├── NVIDIA GPU Server A
├── NVIDIA GPU Server B
├── NVIDIA GPU Server C
├── NVIDIA GPU Server D
└── NVIDIA GPU Server N
```
- Servers join by installing the DeployPro node agent (G1/G2); they register
  inventory (GPU model, count, VRAM, driver/CUDA, NVMe cache size, labels) and
  heartbeat. The scheduler treats them as **one resource pool**.
- Adding a server adds capacity with **no Cineforge change** (no URLs, no env,
  no deploy). Removing one = drain (stop new leases, finish running jobs).
- Pools are logical (by GPU class/labels), not physical: `gpu-48g`, `gpu-80g`,
  `gpu-train`. Model versions declare requirements; the pool is derived.
- External capacity (RunPod or any future provider) can join as a **virtual
  node group** via `GpuProviderAdapter`, giving burst capacity without
  changing the scheduler contract — the "GPU marketplace" model: owned servers
  first, rented capacity as overflow, chosen by cost and availability.

## AR. Combined migration roadmap (product phases + infrastructure phases)

Rules: no single massive migration; **the existing system remains operational
at every stage**; each infrastructure phase has a DeployPro gate (§AG), a
cutover method and a rollback.

Infrastructure phases (I = infrastructure):

| Phase | Scope | DeployPro gate | Cutover | Rollback |
|---|---|---|---|---|
| **I1** | Keep current infrastructure working (Vercel, Render, RunPod, Supabase) | — | — | — |
| **I2** | Make GPU services provider-independent: `GpuProvider` interface, RunPod adapter, presigned I/O, JWT auth, registry `provider` column (overlaps product Phases 2–4) | — | code + config | revert adapter config |
| **I3** | Add **DeployPro GPU adapter** (`DeployProAdapter`) against the lease API; one GPU node joined | G1, G2, G3, G6, G7 (+ G12 for hybrid gateway) | adapter registered, no traffic | disable adapter |
| **I4** | Move **image generation** to DeployPro GPU (first GPU-IMG node) | I3 + G4 | registry: image deployments `provider=deploypro`, RunPod as `fallbackProvider` | flip provider back |
| **I5** | Move **video generation** to DeployPro GPU — the eligible production video model(s) (initially expected Wan 2.2); LTX only if its license status allows (§E) | I4 + GPU-VID node | registry per deployment | flip back |
| **I6** | Move **HunyuanVideo** (where license permits) and remaining restricted/premium candidates to DeployPro GPU (territory rules still enforced) | I5 + GPU-PREM capacity | registry | flip back |
| **I7** | Move **FFmpeg/render workers** to DeployPro (`cineforge-render-worker`) | G8, G11, G13; storage reachable (Supabase S3 over internet is acceptable) | start DeployPro render consumers, stop Render render consumers (same queues) | restart Render consumers |
| **I8** | Move general **Cineforge workers** from Render to DeployPro (`cineforge-worker`, `cineforge-scheduler`, `cineforge-gpu-manager`) | I7 + G6 | same queue-consumer swap; then remove hybrid GPU gateway (GPU traffic becomes fully private) | restart Render workers |
| **I9** | Move **Redis** to DeployPro | G9 (persistence), G10 | drain-and-switch `REDIS_URL` (§AM) | switch back |
| **I10** | Move **object storage** where appropriate | G5, G10 | dual-read + backfill + flip (§AK) | keep Supabase Storage as fallback reader |
| **I11** | Move **Cineforge web/API** (and, when ready, Postgres and Supabase services) where appropriate | G8, G9, G10; Postgres HA/backups; Supabase-services decision (§AL) | web: DNS cutover (Vercel kept warm for rollback); DB: logical replication cutover | DNS back; reverse replication |

Interleaving with product phases (P = product, §AA):

| Order | Product | Infrastructure | Why this order |
|---|---|---|---|
| 1 | P1 architecture | I1 | baseline |
| 2 | P2 secure GPU | I2 (part) | auth + presigned I/O are prerequisites for any provider move |
| 3 | P3 registry/router, P4 GPU worker refactor | I2 (complete) | provider-neutral contracts before new models |
| 4 | P5 image model, P6 image jobs, P7 storyboard, P8 remove gpt-image-1 | (RunPod) | ship value on today's providers; no dependency on DeployPro GPU readiness |
| 5 | — | I3, I4 (when gates pass) | image is the smallest, most license-clean GPU workload to move first |
| 6 | P9 identity, P10 world/assets, P11 editing | I4 running | new image features land directly on DeployPro GPUs |
| 7 | P12 model-neutral video production (Wan 2.2 benchmark; LTX only after license clearance), P13 Hunyuan (where permitted) | I5, I6 | new video models deploy straight to DeployPro where capacity exists, RunPod as overflow |
| 8 | P14 continuity, P15 QC | I7, I8, I9 | app-tier moves once GPU tier is proven |
| 9 | P16 Model Lab | I10, I11 | training data and outputs live on owned storage |

At every row: the previous provider stays configured as fallback until the new
path has passed production testing (§Z exit-criteria pattern).

# Part III — Workflow Runtime & ComfyUI Integration

## AT. Workflow Runtime / ComfyUI integration

### AT.1 Executive decision

ComfyUI is integrated into Cineforge **as a workflow execution runtime**, not
as Cineforge's product architecture or user-facing creative interface.

```
CINEFORGE
  Creative Intelligence
  Production Logic
  Model Registry / Router
  Workflow Builder
  Asset System
          │
          ▼
    WORKFLOW RUNTIME
       ┌──┴────┐
       │       │
    ComfyUI  Diffusers
       │       │
       └──┬────┘
          ▼
      DEPLOYPRO
   GPU / Compute / Storage
   Network / Scheduling
          │
          ▼
     Cineforge Assets
```
Cineforge remains the creative production platform; ComfyUI is an execution
engine; DeployPro is the infrastructure and compute control plane.

**Architecture statement.** Cineforge is a model-neutral AI film production
platform. Its creative intelligence and production systems generate structured
production intent, select eligible models through a policy-aware model router,
construct versioned workflows, and execute those workflows through
interchangeable workflow runtimes. ComfyUI is a supported execution runtime for
complex image and media workflows, while Diffusers and future runtimes remain
available through the same abstraction. DeployPro provides the controlled
infrastructure layer, including GPU scheduling, worker deployment, private
networking, storage connectivity, security, scaling, monitoring and resource
management. Models such as Qwen-Image, Qwen-Image-Edit and Wan 2.2 are
replaceable production components subject to license, territory, capability
and benchmark requirements.

### AT.2 Binding principles (the 13 establishing rules)

1. **ComfyUI is an execution runtime, not Cineforge's product architecture.**
2. **Users never directly operate raw ComfyUI graphs.** No customer-facing node
   editor; no customer-supplied graphs are executed.
3. **Cineforge generates or selects validated workflows from production
   intent** (Workflow Builder, AT.8).
4. **`WorkflowRuntime` is an abstraction** (AT.6); business logic never calls
   ComfyUI APIs directly.
5. **`ComfyUIRuntime` is the first supported implementation.**
6. **`DiffusersRuntime`** (today's `apps/gpu-worker` backends) **and future
   runtimes remain possible** behind the same interface.
7. **Workflow definitions are versioned** (`cineforge.storyboard.v2`) and
   immutable once in production (AT.7).
8. **Workflows declare model, VRAM, GPU, licensing and resource
   requirements** (AT.7).
9. **DeployPro hosts and schedules ComfyUI GPU workers** (AT.11); RunPod or a
   development GPU host them through the same `GpuProvider` contract until
   DeployPro's GPU gates (§AG G1–G4) pass.
10. **GPU endpoints are authenticated and preferably private** (AT.12); the
    ComfyUI server itself is never reachable from outside its container.
11. **Model routing and licensing remain Cineforge responsibilities.** ComfyUI
    does not choose models; the registry/router (§H) is the only authority.
12. **Outputs return to Cineforge's asset system** (`image_generations`,
    `video_generations`, `entity_images`, shots) via one-time URLs (AT.13).
13. **Experimental workflows can be promoted into stable production
    workflows** through a gated pipeline (AT.16).

Core principle restated: Cineforge must not become tied to one image model,
one video model, one inference framework or one workflow runtime. Qwen-Image,
Wan 2.2, LTX, HunyuanVideo and future models are replaceable components;
ComfyUI is replaceable through `WorkflowRuntime`; Cineforge owns production
intent, workflow policy, project state and assets.

### AT.3 Why ComfyUI belongs in Cineforge — and what it is not

**Why:** node-based execution supports complex visual-generation pipelines; it
combines generation, editing, references, LoRAs, controls and upscaling in one
graph; it accelerates experimentation with new models and workflows;
successful experiments can become polished Cineforge production features; it
reduces the need to rewrite Cineforge whenever a new model or technique
appears. Its README lists support for the models this architecture targets
(Qwen Image, Z-Image, Wan 2.1/2.2, LTX-Video 2/2.3, HunyuanVideo 1.5, SDXL,
upscalers) — each to be confirmed in the benchmark for the exact node set used.

**ComfyUI is not:** the Cineforge application architecture · the public
Cineforge API · the primary user interface · the source of truth for projects,
characters, worlds, scenes, shots or assets · the model-selection authority ·
the long-term infrastructure/control plane · a raw node editor ordinary
Cineforge customers must operate.

### AT.4 ComfyUI facts verified from its repository (2026-10-06)

| Fact | Source | Consequence |
|---|---|---|
| **License: GPL-3.0** | github.com/comfyanonymous/ComfyUI | see AT.15 (license obligations) |
| **No authentication on any HTTP route** — `GET /ws`, `/`, `/embeddings`, `/models`, `/models/{folder}`, `/extensions`, `/view`, `/view_metadata/{folder_name}`, `/system_stats`, `/features`, `/prompt`, `/object_info`, `/object_info/{node_class}`, `/api/jobs`, `/api/jobs/{job_id}`, `/history`, `/history/{prompt_id}`, `/queue`; `POST /upload/image`, `/upload/mask`, `/prompt`, `/queue`, `/interrupt`, `/free`, `/history`, `/api/jobs/{job_id}/cancel`, `/api/jobs/cancel` | `server.py` | ComfyUI binds to **127.0.0.1 inside its container only**; all external access goes through the authenticated Cineforge runtime sidecar (AT.10) |
| Frontend is a separate package (ComfyUI Frontend) | README | not exposed; no UI served to customers |
| Extensible via custom nodes (third-party code, separate licenses) | README | custom nodes allow-listed, pinned and license-checked like models (AT.7, AT.15) |

### AT.5 User experience: filmmaking verbs, not graphs

Users interact with filmmaking concepts; Cineforge translates intent into a
validated workflow and ComfyUI executes it behind the scenes:

| User action | Workflow (initial ids) |
|---|---|
| Generate Character | `cineforge.character.v1` |
| Create Location | `cineforge.location.v1` |
| Create Storyboard | `cineforge.storyboard.v1` / `.v2` |
| Animate Shot / Generate Video | `cineforge.video-shot.v1` |
| Edit Image | `cineforge.image-edit.v1` |
| Create Key Art | `cineforge.keyart.v1` |
| Upscale | `cineforge.upscale.v1` |
| Create Variation | the source asset's workflow + new seed/strength (lineage via `parent_id`) |

End-to-end execution:

```
User
  │
  ▼
Cineforge Production Intent        (purpose, entities, quality — §J/§K rows)
  │
  ▼
Creative Intelligence              (Director + ContextCompiler §U)
  │
  ▼
Model Router                       (eligibility + scoring §H)
  │
  ▼
Workflow Builder                   (AT.8)
  │
  ▼
Validated Workflow                 (definition id@version + bound parameters + hash)
  │
  ▼
ComfyUI Runtime                    (WorkflowRuntime implementation)
  │
  ▼
GPU Worker on DeployPro            (RunPod/dev during migration, same image)
  │
  ▼
Generated Output                   (one-time PUT URLs)
  │
  ▼
Asset Validation                   (checksum, dimensions, safety, QC score)
  │
  ▼
Cineforge Asset System             (entity_images, shots, generation rows)
```

### AT.6 `WorkflowRuntime` abstraction (TypeScript contract — design only)

```
WorkflowRuntime
├── execute()
├── validate()
├── estimate()
├── cancel()
├── getStatus()
└── getCapabilities()

Implementations
├── ComfyUIRuntime
├── DiffusersRuntime
└── FutureRuntime
```

```ts
export type RuntimeId = "comfyui" | "diffusers" | string;

export interface WorkflowRef { id: string; version: number }        // "cineforge.storyboard", 2

export interface BoundWorkflow {
  ref: WorkflowRef;
  runtime: RuntimeId;
  runtimeVersion: string;            // ComfyUI commit / diffusers version pinned by the definition
  graphSha256: string;               // hash of the fully bound graph (provenance, cache key)
  payload: unknown;                  // ComfyUI API-format prompt JSON, or Diffusers backend request
  inputs: InputRef[];                // one-time GET URLs (§I InputRef)
  outputs: OutputTarget[];           // one-time PUT URLs
  models: Array<{ versionId: string; role: string; weightsRevision: string }>;
  requirements: GpuRequirements;     // §AH — VRAM, GPU class, disk, job type
}

export interface RuntimeValidation { ok: boolean; errors: Array<{ code: string; path?: string; message: string }> }
export interface RuntimeEstimate { gpuMs: number; vramMb: number; gpuClass: string; confidence: "low" | "medium" | "high" }
export type RuntimeStatus =
  | { state: "queued" | "loading" | "running"; progress: number; node?: string }
  | { state: "succeeded"; result: ImageGenerationResult | ShotResult }
  | { state: "failed"; error: { code: string; message: string; retryable: boolean } }
  | { state: "cancelled" };

export interface RuntimeCapabilities {
  runtime: RuntimeId; runtimeVersion: string;
  nodes?: Array<{ package: string; commit: string; licenseId: string }>;  // ComfyUI custom nodes installed
  models: string[];                  // model version ids resident/available on this worker
  supportsCancel: boolean; supportsProgress: boolean;
}

export interface WorkflowRuntime {
  readonly id: RuntimeId;
  validate(wf: BoundWorkflow): Promise<RuntimeValidation>;          // static + against worker capabilities
  estimate(wf: BoundWorkflow): Promise<RuntimeEstimate>;
  execute(wf: BoundWorkflow, lease: GpuLease, ctx: GenerationContext): Promise<{ runId: string }>;
  getStatus(runId: string): Promise<RuntimeStatus>;
  cancel(runId: string): Promise<void>;
  getCapabilities(lease: GpuLease): Promise<RuntimeCapabilities>;
}
```
- The **ImageEngine / VideoEngine** (§L) call `WorkflowBuilder.build()` then
  `WorkflowRuntime.execute()`; they no longer call an `ImageModelAdapter`
  directly. The §I adapters remain as the **DiffusersRuntime**'s backend
  contract (one backend per model), so nothing in v1/v2 is discarded.
- `DiffusersRuntime` = today's `apps/gpu-worker` FastAPI backends (Wan 2.1 and
  future diffusers backends). `ComfyUIRuntime` = the ComfyUI worker image
  (AT.10). Both share the same authenticated sidecar core.

### AT.7 Workflow Registry (versioned definitions, owned by Cineforge)

Initial workflow ids: `cineforge.character.v1`, `cineforge.location.v1`,
`cineforge.storyboard.v1`, `cineforge.storyboard.v2`, `cineforge.keyart.v1`,
`cineforge.image-edit.v1`, `cineforge.video-shot.v1`, `cineforge.upscale.v1`.

Every definition declares: workflow id and version · runtime · required models
and versions · required VRAM/GPU capabilities · inputs and outputs · estimated
GPU time · license requirements · territorial restrictions · allowed
production modes · validation rules.

```sql
create table public.workflow_definitions (
  id text not null,                        -- 'cineforge.storyboard'
  version int not null,                    -- 2  → referenced as cineforge.storyboard.v2
  purpose text not null,                   -- matches image_generations.purpose / video operation
  runtime text not null check (runtime in ('comfyui','diffusers')),  -- extended for future runtimes
  runtime_version text not null,           -- ComfyUI commit sha / diffusers version
  template jsonb not null,                 -- ComfyUI API-format graph with named parameter slots, or diffusers request template
  template_sha256 text not null,
  parameters_schema jsonb not null,        -- JSON Schema of the slots the Workflow Builder may fill
  inputs_schema jsonb not null,            -- required/optional inputs by role (reference, mask, control, identity…)
  outputs_schema jsonb not null,           -- outputs produced (count, format, dimensions)
  required_models jsonb not null,          -- [{role:'base', versionId:'qwen-image/…'}, {role:'edit', versionId:'qwen-image/2511-edit'}, …]
  model_slots jsonb not null default '{}', -- roles the router may fill with any eligible version of a family
  required_nodes jsonb not null default '[]', -- ComfyUI custom nodes [{package, commit, licenseId}]
  requirements jsonb not null,             -- {minVramMb, gpuClasses[], diskGb, jobType}
  cost_model jsonb not null,               -- gpu-ms as a function of resolution, steps, frames, count, GPU class
  license_ids text[] not null,             -- union of model + node + runtime licenses (computed at registration)
  territory_excludes text[] not null default '{}',  -- union of component territory exclusions (computed)
  allowed_modes text[] not null,           -- 'draft','standard','premium','cinematic'
  validation_rules jsonb not null,         -- limits: max megapixels, max frames, allowed samplers, input count, etc.
  status text not null default 'experimental' check (status in
    ('experimental','benchmarking','license_review','production_candidate','production','deprecated','retired')),
  benchmark_report_key text,               -- storage key of the benchmark report
  created_by text, approved_by text, approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (id, version)
);
```
- Admin-only RLS (like the model registry). A `production` definition is
  **immutable**; changes create a new version.
- **Eligibility of a workflow** = its own status + eligibility of every
  required model (§H) + every node/runtime license + territory union. If any
  component is ineligible for the request, the workflow is ineligible.
- Custom nodes are pinned by commit, installed at image build time only, and
  each carries a `license_id` in `model_licenses` (the "no hidden
  dependencies" rule applies to nodes exactly as to models).

### AT.8 Model Registry, Router and Workflow Builder

The model registry/router remains the authority for model eligibility.
ComfyUI does not independently choose models.

```
Cineforge Request
      │
      ▼
Model Router
      │
      ├── Territory
      ├── Commercial license
      ├── Model version
      ├── Account / plan
      ├── Generation type
      ├── GPU availability
      ├── Cost / performance
      └── Internal policy
      │
      ▼
Selected Model + Workflow Runtime
```
(The full eligibility dimensions — territory, commercial eligibility, license
status, product usage, model version, deployment availability, generation
type, account/plan, internal policy — are defined in §H.)

**Workflow Builder** (Cineforge, TypeScript):
1. Input: production intent (generation row), compiled context (§U), route
   decision (model versions per role).
2. Select the highest `production` (or canary `production_candidate`) workflow
   definition for the purpose and mode whose required models/slots match the
   routed versions.
3. Bind parameters into the template's named slots only (prompt, negative
   prompt, seed, size, steps, guidance, strength/denoise, LoRA files and
   scales, reference/mask/control inputs) — never free-form graph edits.
4. Replace model file references with the exact weights revisions; replace
   input references with runtime-local paths that the sidecar materializes
   from one-time URLs.
5. Validate: parameters against `parameters_schema`/`validation_rules`; graph
   contains only allow-listed node classes; no node that fetches arbitrary
   URLs, executes code, or writes outside the job directory; output nodes
   match `outputs_schema`.
6. Produce `BoundWorkflow` with `graphSha256`; persist `workflow_id`,
   `workflow_version`, `runtime`, `runtime_version`, `graph_sha256` on the
   generation row for provenance and reproduction.

### AT.9 Reference workflows (production intent → graph stages)

**Character generation**
```
Character References
        │
        ▼
Character Identity
        │
        ├── Metadata
        ├── Reference Images
        └── Identity LoRA
        │
        ▼
Qwen-Image
        │
        ▼
Qwen-Image-Edit
        │
        ▼
Consistency / Quality Evaluation
        │
        ▼
Optional Upscaling
        │
        ▼
Cineforge Character Asset
```

**Cinematic image**
```
Creative Brief
     │
     ▼
Reference Images
     │
     ▼
Identity / LoRA
     │
     ▼
Qwen-Image
     │
     ▼
Depth / Pose / Control      (Depth Anything V2 Small; pose only once a pose model's license is verified)
     │
     ▼
Qwen-Image-Edit
     │
     ▼
Upscaling                   (Real-ESRGAN)
     │
     ▼
Cinematic Processing        (grade/grain/letterbox per project bible)
     │
     ▼
Final Asset
```

**Video shot**
```
Storyboard Frame
      │
      ▼
Character / World Identity
      │
      ▼
Video Model Router
      │
      ├── Wan 2.2
      ├── LTX (if licensed)
      ├── HunyuanVideo (where permitted)
      └── Future Models
      │
      ▼
Motion / Camera Processing
      │
      ▼
Video Generation
      │
      ▼
Temporal / Quality Processing
      │
      ▼
Upscale / Mastering          (render workers §AJ)
      │
      ▼
Cineforge Master Clip
```

Video model policy (unchanged, §E): Video Engine remains model-neutral; Wan 2.2
is the initial license-safe production candidate; LTX and HunyuanVideo remain
pluggable candidates subject to their licenses and territorial restrictions;
Wan 2.1 remains the temporary legacy fallback.

```
VIDEO ENGINE
     │
 MODEL ROUTER
     │
 ┌───┼────────────────┐
 │   │                │
Wan  LTX         HunyuanVideo
2.2  licensed-   territory/license
     dependent   dependent
 │
 └──────── Future Models
```

Image model stack (unchanged, §C): Qwen-Image (primary generation candidate) ·
Qwen-Image-Edit (editing, multiple references, consistency) · Z-Image-Turbo
(drafts) · SDXL Inpainting (mask editing) · Real-ESRGAN (upscaling) · Depth
Anything V2 Small (depth). Excluded or unverified models must not become
hidden dependencies; production adoption requires primary-source license
verification.

Character identity (unchanged, §R): Cineforge-owned; reference images,
character metadata, permitted visual representations/embeddings, LoRA identity
training, generation constraints, reference-image conditioning, consistency
evaluation, persistent identity records; one identity for still images and
video; no commercially restricted face-identity models as hidden dependencies.

### AT.10 ComfyUI worker design (`cineforge-comfy-worker`)

```
┌──────────────────────── container (one GPU) ────────────────────────┐
│  Cineforge runtime sidecar (apps/gpu-worker core: FastAPI)          │
│   - only listener on the container network (§O auth, §AN private)  │
│   - verifies job token (deployment / action / job / body binding)   │
│   - downloads inputs from one-time GET URLs → /job/{id}/input       │
│   - submits bound graph to ComfyUI   POST 127.0.0.1:8188/prompt      │
│   - tracks progress (/ws, /history/{id}); cancel (/interrupt,        │
│     /api/jobs/{id}/cancel); unload (/free) on scheduler request     │
│   - collects outputs → checksums → one-time PUT URLs                │
│   - wipes /job/{id} (no cross-job leakage); reports gpu ms, VRAM    │
│     (/system_stats), node timings, runtime/node versions             │
│                          │ localhost only                           │
│  ComfyUI (pinned commit, GPL-3.0) bound to 127.0.0.1                │
│   - no frontend exposed, no ComfyUI-Manager, no runtime node install │
│   - custom nodes pinned + allow-listed + license-checked            │
│   - models dir read-only (weights cache by revision)                │
│   - one prompt at a time (sidecar enforces queue length 1)          │
└─────────────────────────────────────────────────────────────────────┘
```
- One image per **node-set profile** (e.g. `comfy-image` with Qwen/Z-Image/
  SDXL-inpaint/ESRGAN/depth nodes; `comfy-video` with the video nodes of
  eligible models). Model weights are not baked in; they are mounted from the
  node cache.
- The same image runs on DeployPro GPU nodes, RunPod (transitional) or a
  development GPU — `GpuProvider` (§AH) decides where.
- `DiffusersRuntime` workers keep the existing backend design (§M); both
  runtimes can serve the same model version, and the workflow definition
  states which runtime it uses.

### AT.11 DeployPro + ComfyUI

```
                    DEPLOYPRO
                        │
                 GPU Scheduler
                        │
          ┌─────────────┼─────────────┐
          │             │             │
       GPU Node      GPU Node      GPU Node
          │             │             │
       ComfyUI       ComfyUI       ComfyUI
          │             │             │
        Qwen          Video         Future
        Image         Engine        Models
```
DeployPro hosts and orchestrates ComfyUI GPU workers. The scheduler receives
the workflow's declared `requirements` (VRAM, GPU class, disk, job type) and
the model versions it needs, and places the job on a node where the matching
`comfy-*` image and weights are warm (§AI) — Cineforge never names the node.

| DeployPro responsibilities | Cineforge responsibilities |
|---|---|
| GPU provisioning and lifecycle | Creative intelligence |
| GPU pool management | Projects |
| Model-aware scheduling | Characters and identities |
| ComfyUI worker deployment | Worlds and locations |
| Container deployment | Scenes and shots |
| Private networking | Storyboards |
| Storage connectivity | Prompts and creative intent |
| Secrets management | Workflow selection |
| TLS / service exposure | Model policy |
| Health monitoring | Production orchestration |
| Logs and metrics | Assets |
| Scaling | Generation history |
| Resource accounting | User experience |
| Deployment history | Usage records and credit policy |
| Worker lifecycle | |
| Provider abstraction | |

### AT.12 Security (ComfyUI-specific)

ComfyUI and GPU services must never be exposed as unauthenticated public
generation endpoints.

```
Cineforge
   │
   │ Short-lived signed job token
   ▼
DeployPro GPU Gateway        (in the RunPod period the sidecar performs these checks itself)
   │
   ├── Validate deployment
   ├── Validate action
   ├── Validate job
   ├── Validate request/body
   └── Issue one-time storage URLs
            │
            ▼
       ComfyUI Worker         (sidecar re-verifies; ComfyUI on 127.0.0.1 only)
            │
            ▼
         GPU Model
```
- No permanent object-storage credentials inside GPU workers; one-time
  upload/download links per job; authorization bound to deployment, action
  and request (§O requirements table).
- Prefer private GPU networking (§AN).
- Record execution identity and model version: worker id, runtime and
  runtime version, workflow id@version, graph hash, node commits, weights
  revisions — on the generation row.
- **Reject jobs violating license or territory policy** — at the router
  (primary) and again at the gateway/sidecar (defense in depth: the token
  carries the eligibility decision id; the sidecar refuses a graph whose
  hash or model set differs from what was authorized).
- Additional ComfyUI hardening: graphs are generated only by the Workflow
  Builder (never by users); node allow-list; no node classes that load remote
  URLs, run arbitrary code or shell, or read/write outside the job directory;
  `/view`, `/upload/*`, `/models`, `/object_info`, `/history`, `/ws` and
  `/free` unreachable from outside the container; resource limits per job
  (max megapixels, frames, steps, wall-clock deadline).
- One-time URL issuance: Cineforge requests them from the active
  `StorageProvider` for the exact job keys (§AK); on DeployPro the gateway may
  hand them to the worker, but authority over which keys a job may touch stays
  with Cineforge (it owns the assets and ownership rules).

### AT.13 Storage flow

```
Cineforge
    │
    ▼
Generation Job
    │
    ▼
One-time Input URL
    │
    ▼
ComfyUI / GPU Worker
    │
    ▼
One-time Output URL
    │
    ▼
Asset Storage
    │
    ▼
Cineforge Asset Record
```

### AT.14 Billing, metering and workflow cost estimation

Meter all significant work even when a category is initially free: image
generation · video generation · LoRA/identity training · upscaling ·
rendering · audio processing · other GPU-intensive operations (§Q kinds).
Reserve credits when a job is claimed (§Q credit holds). Initially, image
metering is used to discover real infrastructure costs before charging.

```
Workflow
  │
  ├── Model
  ├── Resolution
  ├── Steps
  ├── Frames
  ├── GPU class
  ├── Estimated VRAM
  └── Estimated GPU time
          │
          ▼
      Cost Estimate
```
`workflow_definitions.cost_model` (fitted from benchmark runs and refreshed
from production `gpu_ms`) produces the estimate used for credit holds and,
later, prices — so pricing reflects actual infrastructure cost. Usage records
gain `workflow_id`, `workflow_version` and `runtime` in `units`.

### AT.15 License obligations of the runtime itself

- **ComfyUI is GPL-3.0** (verified). Running it as a network service to
  produce outputs does not distribute it; GPL-3.0 is not the AGPL, so
  service use alone does not require releasing Cineforge's source.
- **Distribution triggers obligations:** if ComfyUI (modified or not) or a
  container image containing it is ever distributed to a third party — e.g.
  an on-premises Cineforge or DeployPro package for customers — GPL-3.0
  source-availability terms apply to ComfyUI and to anything that forms a
  derivative work with it.
- **Keep Cineforge proprietary code out of the ComfyUI process.** Cineforge
  talks to ComfyUI only over its HTTP API from the sidecar. Any custom node
  Cineforge writes runs in-process and should be treated as GPL-compatible
  (or kept internal and never distributed).
- **Custom nodes have their own licenses** (some third-party nodes are
  non-commercial or unlicensed); each must be verified and recorded before it
  enters a node-set image.
- Model licenses are independent of the runtime license: running a model in
  ComfyUI does not change the model's license.
- **Counsel review of the GPL-3.0 position is a listed decision** before any
  distribution scenario (on-prem, customer-hosted DeployPro).

### AT.16 Experimentation, R&D and promotion

ComfyUI is Cineforge's R&D surface for internal teams: test new models · test
LoRAs · test reference conditioning · test image editing · test control
mechanisms · test upscalers · test video workflows · compare model versions ·
prototype production pipelines. R&D runs on isolated `experimental` workers
with admin-only access, never on customer traffic and never on non-permitted
models in production pools.

```
Experimental ComfyUI Workflow
            │
            ▼
       Benchmark                 (§AE eval sets; quality, speed, VRAM, cost)
            │
            ▼
    License Verification         (every model, node, runtime component; primary sources)
            │
            ▼
    Cost / Quality Review        (cost_model fitted; QC thresholds)
            │
            ▼
     Production Workflow         (status production_candidate → canary → production)
            │
            ▼
   Cineforge Workflow Registry   (immutable id@version)
            │
            ▼
     Customer-Facing Feature     (filmmaking verb in the UI, AT.5)
```

### AT.17 Why this architecture is better

No lock-in to a single model · no permanent lock-in to ComfyUI · fast
experimentation without rewriting the application · GPU infrastructure can
move between providers · DeployPro can manage different GPU classes ·
licensing can be enforced centrally · workflow provenance can be recorded ·
production workflows can be versioned and reproduced.

### AT.18 Target unified architecture

```
                         CINEFORGE
                             │
              ┌──────────────┴──────────────┐
              │                             │
      CREATIVE INTELLIGENCE          PRODUCTION LOGIC
              │                             │
       Character Engine              Project / Scene / Shot
       World Engine                  Story / Storyboard
              │                             │
              └──────────────┬──────────────┘
                             │
                       MODEL REGISTRY
                             │
                       MODEL ROUTER
                             │
                     WORKFLOW BUILDER
                             │
                     WORKFLOW RUNTIME
                       ┌─────┴─────┐
                       │           │
                    ComfyUI     Diffusers
                       │           │
                       └─────┬─────┘
                             │
                         DEPLOYPRO
                             │
                    PRIVATE GPU NETWORK
                             │
             ┌───────────────┼────────────────┐
             │               │                │
          IMAGE GPU       VIDEO GPU        AUDIO GPU
             │               │                │
           Qwen            Wan 2.2          Future
           Qwen-Edit       LTX*             Engines
             │             Hunyuan*
             │               │
             └───────────────┼────────────────┘
                             │
                          STORAGE
                             │
                       CINEFORGE ASSETS

* only where licensing/territory permits
```

Expected long-term result:

```
CINEFORGE   = Creative Brain + Production System + Model Intelligence
              + Workflow Intelligence + Asset Intelligence
COMFYUI     = Visual Workflow Runtime
DIFFUSERS   = Direct Model Runtime
DEPLOYPRO   = Compute + Infrastructure Control Plane
GPU POOL    = Execution Capacity
STORAGE     = Persistent Media Layer
```
Together these layers create a path toward a self-controlled, extensible AI
film-production platform without permanent dependence on a single commercial
model provider, inference framework, GPU provider or hosting platform.

**Strategic principle.** The strategic asset is not ComfyUI and not any
individual model. It is the combination of Cineforge creative intelligence,
persistent character/world continuity, proprietary workflows, production
orchestration, model routing, asset intelligence and DeployPro-controlled
infrastructure. ComfyUI makes Cineforge faster to evolve; DeployPro makes
Cineforge progressively independent of external infrastructure providers;
Cineforge remains the layer that understands what the filmmaker is trying to
create.

### AT.19 Implementation order (addendum) mapped to phases

| # | Addendum step | Maps to | Notes |
|---|---|---|---|
| 1 | Approve architecture and model/license policy | P1 | this PR |
| 2 | Secure GPU endpoints with signed authorization | P2 / I2 | sidecar core shared by both runtimes |
| 3 | Introduce `WorkflowRuntime` abstraction | P3–P4 | with registry/router; `DiffusersRuntime` wraps existing backends |
| 4 | Deploy ComfyUI on DeployPro GPU infrastructure | P4 + I3/I4 | **gated on DeployPro G1–G4**; until then the same `cineforge-comfy-worker` image runs on RunPod or a dev GPU via `GpuProvider` |
| 5 | Integrate Qwen-Image and Qwen-Image-Edit | P5 | benchmark + license archive of exact revisions and ComfyUI node set |
| 6 | Build workflows for characters, locations, storyboard frames, key art | P6–P7, P10 | `cineforge.character/location/storyboard/keyart` v1 |
| 7 | Connect character identity / LoRA workflows | P9 | trainer + identity workflows |
| 8 | Integrate and benchmark Wan 2.2 | P12 | `cineforge.video-shot.v1` on Wan 2.2 |
| 9 | Benchmark LTX / HunyuanVideo / future models where legally eligible | P12–P13 | LTX only after license clearance; Hunyuan only where permitted |
| 10 | Integrate video workflows | P12–P14 | |
| 11 | Metering, cost estimation, pricing controls | P6 onward (metering), pricing later | AT.14 |
| 12 | Promote validated workflows to stable production versions | continuous (AT.16) | |


# Part IV — Synchronized Production: Master Production Clock, Audio Engine, A/V Synchronization, Quality Control and Final Mastering

## AU. Synchronized film production

### AU.1 Purpose and core principle

This part defines what Cineforge needs to create complete, production-ready
films in which picture, dialogue, music, sound effects, ambience, subtitles,
transitions and other timed events are generated and validated as **one
synchronized production** rather than as unrelated media files.

**Cineforge is a synchronized film-production system**, not a system that
independently generates a video file and an audio file and combines them at
the end. **The production timeline is authoritative.** Audio timing, dialogue
timing and event timing influence video planning; generated video is then
checked against the intended audio performance.

Authoritative chain:

```
Story → Script → Production Plan → Audio Plan → Master Production Clock
      → Shot/Video Plan → Media Generation → A/V Synchronization
      → Validation → Automatic Repair → Mastering → Final Film
```

**Architectural decision (definitive).** Cineforge's audio and video systems
are coordinated production engines. Audio timing is a production constraint,
video timing is a production constraint, and both are governed by the same
Master Production Clock. Cineforge never defines success as "video generated"
or "audio generated". Success is: **the approved production timeline has
synchronized, technically valid picture and sound and has passed the Final
Quality Gate.**

**Final architectural rule.** Cineforge is not a video generator with audio
added afterward. It is an AI film-production operating system in which story,
picture, sound and timed production events are coordinated around one
authoritative timeline. ComfyUI and other runtimes execute workflows; DeployPro
provides controlled compute; Cineforge remains the source of creative and
production truth. The product is not a collection of generated assets — it is
a **synchronized, validated, reproducible film production**.

### AU.2 What exists today (verified in the code) and why it must change

| Area | Today (`apps/worker`) | Problem |
|---|---|---|
| Narration | `audio.processor.ts`: one TTS track per scene (OpenAI `tts-1`, voice "onyx") from the scene's dialogue/narration text | no per-line timing; no relation to shot boundaries |
| Assembly | `render-engine.ts`: shots normalized, concatenated; "Voice bed: ordered concat of per-scene narration" | audio and picture are positioned independently |
| Truncation | `commands.ts` mux uses `-shortest` ("a narration bed longer than the cut must not…") | **narration longer than the picture is silently cut off** — exactly failure 27(a)/(h) |
| Music | one score composed on the opening scene (fal Stable Audio) and looped under the cut | no cue points, no scene-boundary transitions |
| SFX | "no generator yet" | no event-anchored sound |
| Frame rate | `render-engine.ts` normalizes shots with `fps=16`; `commands.ts` `DEFAULT_FORMAT` is 24 fps | two timebases in one pipeline; risk of conversion drift |
| Loudness | single `loudnorm=I=-16:TP=-1.5:LRA=11` pass on the mix | no stems, no measured QC, no delivery profiles |
| Subtitles | `localize.processor.ts` builds SRT from lines (`cuesFromLines`) | cue times estimated, not aligned to the voice track |
| Data | `audio_tracks` has `start_ms`, `duration_ms`, `gain_db`, kind `VOICE|MUSIC|SFX|AMBIENCE`; `dialogue_lines` has `start_ms`, `audio_key`, `character_id`, `emotion` | the schema anticipated timing, but the pipeline does not use it as authority |
| Talking characters | Voice Lab avatars via fal (SadTalker, Kling AI Avatar) — standalone, not part of film timing | not in the production timeline |

These are kept running during migration and replaced incrementally (AU.24).

### AU.3 Complete Cineforge media architecture (layers)

| Layer | Responsibility |
|---|---|
| **Cineforge Creative Intelligence** | story, screenplay, characters, worlds, scenes, shots, directing logic, production intent |
| **Production Planning Layer** | scene breakdown, shot plan, dialogue plan, audio plan, timing constraints, continuity, dependencies |
| **Media Intelligence Layer** | model registry, model router, generation policies, provenance, licensing, runtime selection (§H, §AT) |
| **Image Engine** | character images, locations, props, key art, storyboards, reference images, editing, variations (§C, §T) |
| **Video Engine** | shot generation, animation, motion, image-to-video, video-to-video, future models (§E) |
| **Audio Engine** | dialogue, voice, narration, music, SFX, ambience, mastering stems, timed audio events (AU.6) |
| **Workflow Runtime Layer** | ComfyUI, Diffusers and future runtimes behind a common interface (§AT) |
| **DeployPro Infrastructure Layer** | GPU/CPU workers, storage, scheduling, networking, secrets, observability, deployment (Part II) |
| **A/V Synchronization Engine** | master clock, timeline analysis, dialogue alignment, lip-sync validation, drift detection, repair (AU.7–AU.12) |
| **Final Quality Gate and Mastering Layer** | technical QC, loudness, frame rate, continuity, subtitles, render, final deliverables (AU.13, AU.17) |

### AU.4 Master Production Clock

Every production has **one authoritative Master Production Clock**; all
generated and imported media are positioned against it.

The clock coordinates: video frames and shot boundaries · dialogue and
narration start/end times · word- and, where available, phoneme-level timing ·
music cues, beats and musical transitions · sound effects and ambience ·
character actions and important visual events · subtitles and captions ·
transitions, titles and visual effects · scene and sequence boundaries.

**No media asset is production-ready merely because it exists.** It is
production-ready only when it has a valid temporal relationship to the Master
Production Clock (a `timeline_events` placement that passes validation).

**Timebase specification (design):**
- Canonical time unit: **integer microseconds (µs)** from timeline start,
  stored as `bigint`. No floating-point seconds in timeline storage.
- Each timeline declares a **rational frame rate** (`fps_num/fps_den`, e.g.
  `24/1`, `25/1`, `24000/1001`) and an **audio sample rate** (48 000 Hz).
  Frame `n` starts at `floor(n · 1e6 · fps_den / fps_num)` µs; sample `k` at
  `k · 1e6 / 48000` µs. All conversions are exact integer arithmetic with
  explicit rounding rules, so frame-rate conversion cannot introduce
  cumulative drift.
- **Snap rules:** picture events (cuts, shot bounds) snap to frame boundaries;
  audio events are sample-accurate; subtitles snap to frames for display.
- **One production fps.** Generated clips arrive at model-native rates (e.g. 16
  fps today); they are conformed once to the timeline fps by the render worker
  with a recorded method (frame interpolation or duplication), never
  re-timed implicitly. The conform is a versioned media derivative.
- Timeline versions are immutable once approved; edits produce a new version.

### AU.5 Audio-first timing and production planning

Cineforge establishes an initial timing plan **before** expensive video
generation:

1. Create or import the screenplay.
2. Break the screenplay into scenes, sequences and shots.
3. Identify every spoken line and non-dialogue audio event.
4. Generate or select voices and create a dialogue timing estimate.
5. Create an audio timeline containing dialogue, music, effects and ambience.
6. Calculate expected shot durations from the audio and directing plan.
7. Create video shot constraints from those timings.
8. Generate video using the timing constraints.
9. Run A/V synchronization analysis.
10. Repair or regenerate any failed segment before final mastering.

Timing estimate before TTS: words × language-specific speaking rate × emotion
modifier (from `dialogue_lines.emotion`) + pauses from punctuation and
direction; replaced by measured durations as soon as dialogue audio exists.
Shot duration = max(directing intent, covered dialogue span + head/tail
handles); shots that exceed a model's `maxDurationSec` are split at planned
cut points or rendered as extensions (V2V `extend`), decided by the planner,
not by the model.

### AU.6 Video Engine and Audio Engine (production-intent interfaces)

**Video Engine** (model-neutral, §E): Wan 2.2 initial license-safe production
candidate; Wan 2.1 legacy/fallback; LTX candidate requiring commercial
licensing before production use; HunyuanVideo subject to territory and
licensing restrictions; future models pluggable without changing the
production architecture.

The Video Engine receives a **production intent**, not a raw user prompt:

```ts
export interface VideoShotIntent {
  projectId: string; sceneId: string; shotId: string; timelineVersionId: string;
  characterRefs: string[]; locationRef?: string; worldRefs?: string[];
  camera: CameraPlan;                         // §I (existing type)
  motion?: { constraints: string[]; strength?: number };
  durationUs: bigint;                         // from the Master Production Clock
  fps: { num: number; den: number }; aspectRatio: "16:9" | "9:16" | "1:1" | "2.39:1";
  seed?: number; initImageKey?: string;       // storyboard frame
  timing: {                                   // audio-derived constraints
    speakingIntervals: Array<{ characterId: string; startUs: bigint; endUs: bigint; dialogueEventId: string }>;
    actionEvents: Array<{ label: string; atUs: bigint; toleranceUs: bigint }>; // e.g. "door slams"
    headHandleUs: bigint; tailHandleUs: bigint;
  };
  drivingAudioKey?: string;                   // for audio-driven talking shots
  quality: QualityClass;
}
```

**Talking-character shots** prefer **audio-driven or timing-constrained
generation** over hoping an independent video matches the voice track. The
registry gets an operation `speech_to_video` (audio-driven). Candidate: **Wan
2.2 S2V-14B** (speech-to-video, listed in the Wan 2.2 repository whose models
are Apache-2.0 — verified) — subject to the same benchmark and registry
eligibility as every model.

**Audio Engine** — first-class; produces structured audio assets with timing
metadata, not just an opaque WAV/MP3:

| Capability | Today | Target |
|---|---|---|
| Dialogue / voice generation | OpenAI TTS; MiniMax via fal (Voice Lab) | `AudioEngine` adapters; self-hosted TTS later via `cineforge-audio-worker` (models selected under the same license rules) |
| Narration | OpenAI TTS per scene | per line, timed |
| Character voice assignment and continuity | `characters.voice_profile`, Voice Lab voices | voice id pinned per character + version |
| Music generation or ingestion | fal Stable Audio, one looped score | cue-based (AU.11) |
| Sound-effect generation or library selection | none | event-anchored SFX (AU.11) |
| Ambience and room tone | none | per location/scene |
| Dialogue segmentation | none | per line → words |
| Word timestamps; phoneme/viseme timing where supported | none | forced alignment (AU.10 tooling) |
| Stems | single mix | dialogue, music, effects, ambience |
| Loudness normalization and technical validation | single `loudnorm` | measured per stem and program (AU.13) |

Every audio asset carries: start time, end time, source, speaker/role,
language, sample rate, loudness metadata, confidence, and its relationship to
the scene/shot/event that caused it.

```ts
export type AudioKind = "dialogue" | "narration" | "music" | "sfx" | "ambience" | "room_tone";
export interface AudioAssetMeta {
  kind: AudioKind; startUs: bigint; endUs: bigint;
  source: { workflow?: WorkflowRef; modelVersionId?: string; library?: string; upload?: boolean };
  speakerCharacterId?: string; role?: string; language?: string;
  sampleRate: 48000 | 44100; channels: 1 | 2 | 6;
  loudness: { integratedLufs: number; truePeakDbtp: number; lra?: number };
  confidence?: number;                        // TTS/alignment confidence
  words?: Array<{ text: string; startUs: bigint; endUs: bigint; confidence?: number }>;
  phonemes?: Array<{ symbol: string; startUs: bigint; endUs: bigint }>;
  cause: { sceneId?: string; shotId?: string; timelineEventId?: string; dialogueLineId?: string };
}
export interface AudioEngine {
  planDialogue(lines: DialogueLineRef[], lang: string): Promise<Array<{ lineId: string; estDurationUs: bigint }>>;
  generate(intent: AudioIntent): Promise<{ generationId: string }>;   // row-first, like images
  align(audioKey: string, transcript: string, lang: string): Promise<AudioAssetMeta["words"]>;
  stems(timelineVersionId: string): Promise<Record<"dialogue" | "music" | "effects" | "ambience", string>>;
}
```

### AU.7 A/V Synchronization Engine

A first-class subsystem between media generation and final mastering.

```
CINEFORGE FILM GENERATION
        │
 ┌──────┴───────┐
 │              │
VIDEO ENGINE  AUDIO ENGINE
 │              │
shots/scenes   dialogue/music/SFX
 └──────┬───────┘
        │
     SYNC ENGINE
        │
 ┌──────┼─────────────┐
 │      │             │
Duration Dialogue     Event
Align   Align         Align
 └──────┬─────────────┘
        │
   QUALITY GATE
     /       \
   PASS      FAIL
    │          │
 Master     Repair/Regenerate
```

Components (each a pure, testable module in `cineforge-worker` / render
workers; heavy media analysis runs as `cineforge.avsync-check.v1` jobs):

| Component | Role |
|---|---|
| **MasterClock** | authoritative timebase for the entire production (AU.4) |
| **TimelineAnalyzer** | compares all media and event intervals |
| **DialogueAligner** | aligns dialogue segments to the intended scene and shot timing |
| **LipSyncValidator** | evaluates whether visible speaking/action timing is compatible with dialogue timing |
| **AudioVideoDurationValidator** | detects duration mismatches, leading/trailing silence and unexpected offsets |
| **MusicCueValidator** | checks music entry, exit and transition points |
| **SFXCueValidator** | checks event-triggered effects against visual actions |
| **SubtitleSynchronizer** | aligns captions/subtitles to approved dialogue timing |
| **LoudnessValidator** | validates dialogue, stems and final program loudness |
| **FrameRateValidator** | verifies frame-rate and timebase consistency |
| **DriftDetector** | detects progressive A/V timing drift |
| **RepairPlanner** | converts failures into specific repair actions |
| **FinalQualityGate** | decides whether the production can become the master |

```ts
export type SyncCheck =
  | "duration" | "dialogue_alignment" | "lip_sync" | "music_cue" | "sfx_cue"
  | "subtitle" | "loudness" | "frame_rate" | "drift" | "transitions" | "silence"
  | "clipping" | "black_frames" | "dropped_frames" | "missing_media" | "provenance";

export interface SyncIssue {
  check: SyncCheck; severity: "info" | "warning" | "error" | "blocker";
  sceneId?: string; shotId?: string; eventId?: string;
  atUs: bigint; spanUs?: bigint;
  measured: Record<string, number>;      // e.g. { offsetMs: 420, overrunMs: 1200 }
  expected: Record<string, number>;
  confidence: number;                    // 0..1; low → human review
  message: string;                       // human-readable diagnostic
  repair?: RepairAction;                 // proposed by RepairPlanner
}
export interface AVSyncReport {
  timelineVersionId: string; checks: SyncCheck[];
  passed: boolean; issues: SyncIssue[];
  toolVersions: Record<string, string>;  // analyzers + model versions (provenance)
}
export interface AVSyncEngine {
  analyze(timelineVersionId: string, scope?: { sceneIds?: string[]; shotIds?: string[] }): Promise<AVSyncReport>;
}
```

### AU.8 Dialogue-to-video synchronization levels

| Level | Requirement | Evidence |
|---|---|---|
| Scene | dialogue belongs to the correct scene | timeline event parentage |
| Shot | the line begins and ends inside the intended visual segment | event interval ⊂ shot interval (with handles) |
| Character | the correct character is visually associated with the speech | speaking face ↔ character identity (face track + identity references) |
| Temporal | speaking action begins at the expected time | visual speech onset vs dialogue onset |
| Mouth-motion | visible mouth movement compatible with speech duration and cadence | mouth-activity signal vs speech envelope |
| Word/phoneme | finer timing where the pipeline gives sufficient visual evidence | word/phoneme alignment vs visual activity |
| Continuity | dialogue not cut, duplicated or shifted when adjacent shots are edited | timeline diff between versions |

For important talking-character shots Cineforge prefers an **audio-driven or
timing-constrained generation workflow**.

### AU.9 Lip-sync validation (a QC process, not cosmetic post-processing)

1. Read the approved dialogue timing.
2. Identify the visual speaking interval.
3. Compare expected speaking activity with visible mouth/action activity.
4. Measure the timing offset.
5. Detect speech that continues after the visual speaking action ends.
6. Detect visual speaking that occurs while the character has no corresponding dialogue.
7. Flag low-confidence cases for human review when automated evidence is insufficient.

Example diagnostic: *"Shot 17: dialogue begins 420 ms after expected speaking
motion; dialogue exceeds the visual speaking segment by 1.2 seconds.
Recommended repair: regenerate the final 3 seconds of the shot using the
approved dialogue timing constraint."*

Tolerances are configuration (`sync_policies`), calibrated in the benchmark.
Starting defaults follow commonly used broadcast practice for audio/video
alignment (sound should not lead picture by more than a few tens of ms nor lag
by much more) — exact values to be confirmed against the standard text and
viewer testing before they become gates.

### AU.10 Analysis tooling (license status, verified 2026-10-06 from official repositories)

| Need | Candidate | License found | Status |
|---|---|---|---|
| Word-level timestamps | WhisperX | code BSD-2-Clause; alignment uses wav2vec2 models whose licenses vary per language (not catalogued in README) | verify each alignment model per language before use |
| Word/phone forced alignment | Montreal Forced Aligner | MIT; pretrained acoustic models in a separate repository | verify model licenses |
| Speaker diarization | pyannote `speaker-diarization-community-1` (via WhisperX) | CC-BY-4.0 (attribution) | usable with attribution; gated download |
| Mouth activity / face landmarks | MediaPipe | Apache-2.0 | verify Face Landmarker blendshape outputs in benchmark |
| A/V offset + confidence | SyncNet (`joonson/syncnet_python`) | repository shows MIT | verify pretrained weight license |
| Audio-driven talking video | Wan 2.2 S2V-14B | Apache-2.0 (Wan 2.2 repository) | benchmark |
| Loudness / technical QC | FFmpeg `ebur128`/`loudnorm`, `blackdetect`, `silencedetect`, `freezedetect`, `ffprobe` | FFmpeg (already used) | in use; build configuration to be checked for GPL/LGPL components if distributed |

No tool enters production until its license is verified (the "no hidden
dependencies" rule applies to analyzers exactly as to generators).

### AU.11 Music, SFX and ambience synchronization

- Music cues are **attached to timeline events**, not merely placed under the final video.
- SFX events can be attached to actions such as impacts, door openings, footsteps, vehicles or transitions.
- Ambience follows location and scene continuity.
- Music transitions respect scene and sequence boundaries.
- SFX are not displaced when a shot is shortened or regenerated.
- When a shot changes duration, dependent audio events are **recalculated**, not blindly retained.

Anchoring model: every `timeline_events` row may declare `anchor_event_id` +
`anchor_offset_us` + `anchor_mode` (`start`, `end`, `action`, `cut`), so a
re-timed shot moves its dependent events automatically; events with no valid
anchor after a change are flagged by TimelineAnalyzer.

### AU.12 Automatic repair loop

```
Generate → Analyze → Sync Check
PASS → continue
FAIL → diagnose → select repair → regenerate/retime → recheck
```

| Failure | Repair |
|---|---|
| Dialogue too long | adjust shot duration, or regenerate the shot with a longer timing constraint |
| Dialogue too short | shorten/re-edit the visual segment, or regenerate the dialogue (production decision) |
| Lip sync fails | regenerate the affected talking segment with the approved audio timing (audio-driven where available) |
| Music starts too early/late | retime the cue |
| SFX displaced by a changed visual action | relocate the SFX event (anchor recalculation) |
| Drift accumulates across a sequence | recalculate sequence timing from the Master Clock |
| Repair changes the approved timeline materially | invalidate and re-evaluate downstream dependent jobs |

```ts
export type RepairAction =
  | { kind: "retime_event"; eventId: string; newStartUs: bigint }
  | { kind: "adjust_shot_duration"; shotId: string; newDurationUs: bigint }
  | { kind: "regenerate_shot_segment"; shotId: string; fromUs: bigint; toUs: bigint; constraint: "dialogue_timing" | "audio_driven" }
  | { kind: "regenerate_dialogue"; dialogueLineId: string; targetDurationUs: bigint }
  | { kind: "relocate_sfx"; eventId: string; anchorEventId: string }
  | { kind: "recompute_sequence"; sceneIds: string[] }
  | { kind: "human_review"; reason: string };
```
Repair policy: automatic repairs have a per-production budget (attempts and
credits); after the budget, issues go to human review. Repairs always create
**new media versions** (AU.16), never overwrite approved media.

### AU.13 Final Quality Gate

A film cannot be marked **COMPLETE** until the Final Quality Gate passes.
Checks: video duration · audio duration · dialogue alignment · lip
synchronization · scene and shot transitions · music timing · SFX timing ·
ambience continuity · subtitle/caption alignment · audio silence gaps · audio
clipping and technical defects · program loudness · sample rate · frame rate
and timebase · dropped or duplicate frames · black frames · missing media ·
timeline continuity · media provenance and successful asset resolution ·
required render outputs and codecs.

Delivery profiles (configuration) define targets per output: e.g. program
loudness and true-peak targets per platform (EBU R 128-style broadcast vs
streaming targets), codecs, frame rate, sample rate, subtitle formats. Each
check has a severity; any `blocker` fails the gate; `error` fails unless a
human waives it with a recorded reason.

### AU.14 Workflow registry additions

Added to §AT.7: `cineforge.audio-dialogue.v1`, `cineforge.audio-music.v1`,
`cineforge.audio-sfx.v1`, `cineforge.avsync-check.v1`,
`cineforge.final-master.v1` (alongside character, location, storyboard v1/v2,
keyart, image-edit, video-shot, upscale). Each specifies required models and
versions, VRAM/GPU requirements, inputs, outputs, estimated compute, licensing
constraints, territory restrictions, allowed production modes and validation
requirements. `workflow_definitions.runtime` is extended with CPU runtimes
(`ffmpeg` for mastering/conform, `analysis` for A/V checks) and an `audio`
runtime for audio models, all behind `WorkflowRuntime`.

### AU.15 Production graph, jobs and queues

The existing polling/BullMQ model remains the orchestration foundation:
production requests become durable jobs · jobs are idempotent · workers claim
jobs atomically · retries are explicit · dependencies are represented in the
production graph · storyboard frames may be child jobs of shot-generation
jobs · A/V validation jobs depend on the relevant media assets and approved
timeline · repair jobs create new versions rather than silently overwriting
approved media.

New queues (same row-first pattern, §L): `timeline` (planning, re-timing),
`avsync` (analysis), `repair`, `master` (final assembly + post-render QC).
Existing `audio`, `render`, `localize` processors move behind the Audio Engine
and render workers. BullMQ flows express dependencies:
`timeline → {image, audio} → video → avsync → (repair → avsync)* → master`.

### AU.16 Data model additions

Every generation records the selected model, runtime, workflow version,
parameters, licensing decision, timing constraints, input references, output
artifacts and validation state.

| Table | Purpose | Key fields (design) | Relationship to existing |
|---|---|---|---|
| `image_generations` | image ledger | §J | new |
| `video_generations` | video attempt ledger | §K + `timing_constraints jsonb`, `timeline_version_id` | new |
| `entity_images` | images ↔ entities | §J | new |
| `character_identities` | versioned identity | §R | new |
| `audio_generations` | audio ledger (dialogue, music, sfx, ambience) | like `image_generations` + `kind`, `language`, `voice_id`, `meta jsonb` (AudioAssetMeta) | supersedes ad-hoc `audio_tracks` writes; `audio_tracks` kept as a compatibility view during migration |
| `audio_events` | placed audio on a timeline (start/end µs, gain, stem, anchor) | `timeline_version_id`, `audio_generation_id`, `media_version_id`, `stem`, `start_us`, `end_us`, `gain_db`, `fade_in_us`, `fade_out_us` | generalizes `audio_tracks.start_ms/duration_ms/gain_db` |
| `production_timelines` | timeline versions per project | `project_id`, `version`, `fps_num`, `fps_den`, `sample_rate`, `duration_us`, `status` (`draft`,`approved`,`superseded`,`frozen`), `parent_version_id` | new |
| `timeline_events` | every timed thing: shots, dialogue, words (optional), music cues, SFX, ambience, subtitles, transitions, titles, VFX, visual actions | `timeline_version_id`, `kind`, `start_us`, `end_us`, `ref_type`, `ref_id`, `anchor_event_id`, `anchor_offset_us`, `anchor_mode`, `payload jsonb` | maps from `scenes`, `shots`, `dialogue_lines` (existing) |
| `av_sync_reports` | one per analysis run | `timeline_version_id`, `scope`, `passed`, `checks`, `tool_versions`, `created_at` | new |
| `av_sync_issues` | individual findings | `report_id`, `check`, `severity`, `at_us`, `span_us`, `measured`, `expected`, `confidence`, `message`, `status` (`open`,`repairing`,`resolved`,`waived`) | new |
| `repair_jobs` | planned/executed repairs | `issue_id`, `action jsonb` (RepairAction), `status`, `result_media_version_id`, `attempt`, `credits_hold_id` | new |
| `media_versions` | immutable version of every asset | `asset_type`, `asset_id`, `version`, `storage_key`, `checksum`, `duration_us`, `derived_from[]`, `generation_ref` | new; outputs of generations become versions |
| `workflow_runs` | one execution of a bound workflow | `workflow_id@version`, `runtime`, `graph_sha256`, `generation_ref`, `lease`/worker, timings, status | new (an image/video/audio generation may have several runs) |
| `generation_provenance` | unified, append-only provenance view across image/video/audio | generation ref, model version, weights revision, runtime, workflow, routing decision, license decision, inputs, outputs, timing constraints, validation state | view over the ledgers + `workflow_runs` |

All tables: owner-scoped RLS via `owns_project`, worker-only status/metric
columns (guard triggers), Realtime for status rows the UI shows.

### AU.17 Final mastering pipeline

After all quality gates pass:
1. Freeze the approved production timeline.
2. Resolve all referenced media versions.
3. Assemble video and audio stems.
4. Apply approved transitions and effects.
5. Apply audio mastering and loudness targets.
6. Render the final master.
7. Run post-render technical QC.
8. Generate delivery derivatives such as platform-specific versions.
9. Create the final provenance manifest.

Runs on `cineforge-render-worker` (§AJ) as `cineforge.final-master.v1`. The
master manifest (stored next to the master) lists timeline version, every
media version with checksum, models/workflows/runtimes, licenses, QC report
ids and delivery profile — the film is reproducible from its manifest.

### AU.18 Production state machine

```
PLANNED → SCRIPTED → TIMELINED → MEDIA_GENERATING → SYNC_ANALYSIS
        → QUALITY_REPAIR (if required) → READY_FOR_MASTER → MASTERING → COMPLETE
```
A production is **never** marked COMPLETE solely because all generation jobs
succeeded.

Compatibility: today's `projects.status` enum (`DRAFT`, `PLANNING`,
`GENERATING`, `RENDERING`, `PAUSED`, `READY`, `FAILED`) stays for existing UI;
a new `projects.production_state` column carries the new machine, with a
mapping (`PLANNED/SCRIPTED/TIMELINED → PLANNING`, `MEDIA_GENERATING/
SYNC_ANALYSIS/QUALITY_REPAIR → GENERATING`, `READY_FOR_MASTER/MASTERING →
RENDERING`, `COMPLETE → READY`) until the UI migrates.

### AU.19 Failure examples the system must catch

| # | Failure | Caught by |
|---|---|---|
| a | Voice line lasts 8.2 s but the shot has only 6 s of usable speaking action | DialogueAligner, LipSyncValidator, AudioVideoDurationValidator |
| b | Character begins speaking 0.6 s before the dialogue track | LipSyncValidator |
| c | Mouth movement continues after dialogue ends | LipSyncValidator |
| d | Music cue starts before the scene transition | MusicCueValidator |
| e | Explosion SFX occurs after the visible impact | SFXCueValidator |
| f | Subtitle appears after the spoken sentence | SubtitleSynchronizer |
| g | A regenerated shot changes duration and causes downstream music/SFX drift | TimelineAnalyzer (anchors), DriftDetector |
| h | Audio and video have different final durations | AudioVideoDurationValidator (replaces silent `-shortest` truncation) |
| i | Frame-rate conversion introduces timing drift | FrameRateValidator, DriftDetector |
| j | A missing media asset creates a silent or black section | FinalQualityGate (missing media, silence, black frames) |

### AU.20 Storage and provenance

Original generated assets remain immutable versions · derived renders
reference their source assets · timeline versions identify the media versions
they used · a repaired shot creates a new version · final masters retain a
manifest of the video, audio, subtitle and metadata inputs · private
production assets remain protected by project ownership/RLS and server-side
authorization (§P, §AK). Storage keys gain a version segment:
`projects/{projectId}/{assetType}/{assetId}/v{n}/…`.

### AU.21 Billing and universal metering

Images, video, audio, synchronization analysis, upscaling and other expensive
operations participate in the universal usage model (§Q): reserve usage before
expensive execution where appropriate · record actual usage after completion ·
release unused reservations · record compute and provider/model metadata ·
make cost estimation available before generation · allow premium production
modes to consume different usage amounts. `usage_records.kind` adds
`avsync` and `master`; repairs are metered (`units.repair=true`) so the cost
of failed synchronization is visible.

### AU.22 Quality and cost strategy (progressive gates)

Low-cost planning and timing analysis → preview/storyboard generation →
timing-aware video generation → A/V synchronization validation → targeted
repair rather than full-film regeneration → final high-quality mastering.
Expensive computation is spent only when the production is likely to succeed.

### AU.23 Security, separation, model routing (restated for this part)

- **Separation:** Cineforge owns what the production means — projects, users,
  stories, scripts, characters, scenes, shots, production plans, workflows,
  model policies, media metadata, **timelines, A/V synchronization**, billing
  semantics and final production state. DeployPro owns where and how
  computation runs — GPU/CPU workers, deployment, scheduling, scaling,
  networking, storage infrastructure, secrets, TLS, worker health, logs,
  metrics and provider adapters. **DeployPro must not become the source of
  truth for Cineforge creative state.**
- **Secure GPU execution** (§O): GPU service not invokable merely because a
  pod URL is known; short-lived signed execution tokens; authorization bound
  to deployment, job/action and request/body; one-off upload/download URLs;
  model/workflow authorization validated before execution; private
  networking where possible; no long-lived provider credentials in browser
  clients; **every generation request and resulting artifact audited**
  (`workflow_runs` + `generation_provenance`).
- **Model router** (§H) selects on: model version · license status ·
  commercial eligibility · territory eligibility · account/plan eligibility ·
  generation type · required runtime · GPU/VRAM availability · expected
  quality · expected cost · latency · current deployment availability ·
  internal policy. The routing decision is stored on the generation record.
- **Character identity** (§R): persistent, versioned; references, approved
  appearances, wardrobe, age, visual attributes, identity
  embeddings/conditioning artifacts; CharacterIdentity records, approved
  reference images, identity/version metadata, generation constraints,
  optional LoRA/adapter artifacts when licensing permits, shot-level identity
  references, continuity validation across scenes.
- **Image Engine** (§C, §T): characters, worlds, locations, props, storyboards,
  key art, references; Qwen-Image + Qwen-Image-Edit recommended, others via
  the registry.

### AU.24 R&D promotion and migration from third-party generation

Promotion (extends §AT.16): research model/workflow → test quality and compute
requirements → verify license and territory → create Cineforge workflow
definition → run benchmark **and synchronization tests** → validate security
and resource limits → canary deployment → promote to production → retain the
prior workflow as a rollback option.

Migration (extends §Z): replace direct generation calls with engine adapters ·
run self-hosted models in shadow mode · compare quality, cost **and
synchronization results** · canary selected productions · retain a controlled
fallback during transition · remove direct vendor coupling after acceptance
criteria are met. Applies to OpenAI TTS, fal (MiniMax voice, Stable Audio,
SadTalker/Kling avatars, Topaz upscale), OpenAI images and the fal video tier.

The current render path stays available as the `legacy` master workflow until
`cineforge.final-master.v1` passes the gate on the benchmark film set.

### AU.25 Canonical end-to-end flow

```
USER/CREATIVE INTENT
↓
STORY / SCRIPT
↓
SCENE & SHOT BREAKDOWN
↓
CHARACTER / WORLD / ASSET PLAN
↓
AUDIO PLAN
↓
DIALOGUE + MUSIC + SFX + AMBIENCE TIMING
↓
MASTER PRODUCTION CLOCK
↓
VIDEO SHOT PLAN WITH TIMING CONSTRAINTS
↓
IMAGE / STORYBOARD / VIDEO GENERATION
↓
AUDIO GENERATION
↓
A/V SYNC ENGINE
↓
DURATION + DIALOGUE + LIP-SYNC + EVENT + SUBTITLE + LOUDNESS CHECKS
↓
PASS? ── NO → REPAIR / REGENERATE → RECHECK
  │
 YES
  ↓
FINAL QUALITY GATE
↓
MASTERING
↓
POST-RENDER QC
↓
FINAL FILM + PROVENANCE MANIFEST
```

### AU.26 Implementation priority (directive) and reconciliation

Directive order:
1. Define the Master Production Clock and timeline schema.
2. Define Audio Engine interfaces and audio event schema.
3. Define AVSyncEngine interfaces and reports.
4. Move video generation behind the model/runtime abstraction.
5. Integrate ComfyUI as the first workflow runtime.
6. Implement timing-aware shot generation.
7. Implement duration and dialogue synchronization checks.
8. Implement subtitle/music/SFX synchronization.
9. Implement targeted repair jobs.
10. Implement final quality gate.
11. Implement universal usage metering.
12. Secure GPU execution.
13. Add model/license/territory routing.
14. Promote tested workflows to production.
15. Migrate remaining direct vendor generation calls.

**Reconciliation (for review):** items 1–3 are definitions (schemas and
interfaces in this document) and can proceed in parallel. Item 12 (secure GPU
execution) is listed late here but was set as the **first implementation
phase** in the earlier review directive, and it closes a live exposure (the GPU
service accepts unauthenticated requests today). Recommendation: keep GPU
security first, run items 1–3 alongside it, then continue in the directive's
order. One quick win that needs no new model: replace the silent `-shortest`
truncation with a duration check that fails loudly (AU.19 h).

| Directive item | Phase mapping |
|---|---|
| 1–3 | P1 (this document) → schema PR alongside P2 |
| 4–5 | P3–P4 (§AT.19 steps 3–4) |
| 6 | P12 + audio-first planning (new P6a) |
| 7–8 | new P14a (sync checks) |
| 9 | new P14b (repair) |
| 10 | new P15a (final quality gate + mastering) |
| 11 | P6 onward |
| 12 | **P2 (first)** |
| 13 | P3 |
| 14 | continuous (§AT.16) |
| 15 | §Z, AU.24 |


---

## AS. Requirement traceability

Every requirement from the two directives and where this document satisfies it.

**Directive 1 — Architecture directive (image engine, video engine)**

| # | Requirement | Section(s) |
|---|---|---|
| 1 | Preserve existing architecture (Next.js/Vercel/Supabase Auth+DB+Storage; Node/BullMQ/Redis/Render/polling; FastAPI/Diffusers/CUDA/RunPod/one model per pod/lifecycle/scheduler/fairness; S3 storage, private + public buckets; RLS/ownership helpers/service role; FFmpeg; GPU API; 10 processors) | B, L, M, N, O, P, AO |
| 2 | Model independence: Cineforge → Creative Intelligence → Media Orchestrator → Registry → Image/Video/Audio models → GPU workers | A, H, I |
| 3 | Video strategy (revised 2.1: model-neutral; Wan 2.2 leading production candidate; LTX and HunyuanVideo pluggable candidates subject to licenses; future models); `VideoModelAdapter`, `VideoModelRegistry`, `VideoModelCapabilities`, `VideoModelVersion`, `VideoModelLicense`, `VideoModelDeployment`; UI/jobs model-agnostic | E, F, G, H, I |
| 4 | Video Model Router: plan, quality, resolution, duration, I2V/T2V, cinematic mode, GPU availability, queue load, capability, cost, user selection, project requirements; configurable, not hard-coded | H (router algorithm, `routing_policies`), I (`RouteRequest`), AI (`capacity()` feeds load/warm) |
| 5 | Self-hosted image engine; `resolveSeedKey` → registry → router → self-hosted model → GPU image worker → storage; T2I, I2I, inpaint, outpaint, edit, references, seed, negative prompts, LoRA, character/world references, composition, depth/structure/pose controls, upscaling | C, I, L, M, T |
| 6 | Image model evaluation on all criteria; primary-source license verification; comparison matrix with required columns; recommendation | C, D |
| 7 | New image abstraction fields (prompt, negativePrompt, width, height, steps, guidance, seed, referenceImages, mask, controlImages, characterId, locationId, worldId, loraAdapters, model, modelVersion, strength, denoiseStrength, outputFormat) | I (`ImageGenerationRequest`; model/modelVersion chosen by router and recorded) |
| 8 | Owner-scoped `image_generations` table, carefully designed, JSON for model parameters | J |
| 9 | Dedicated image queue via existing BullMQ; row → poller → BullMQ → worker → GPU → storage → completion → UI | L |
| 10 | GPU architecture: extend `apps/gpu-worker`; image and video independently scalable; lifecycle/scheduler extended not duplicated | M, N, AH, AI |
| 11 | GPU security: authenticate `/generate`, `/train`, `/warm` and all privileged endpoints; worker → authenticated request → GPU; not URL hiding | O, Y, AN |
| 12 | Character Engine: identity, references, face/body references, clothing, visual attributes, identity adapter/LoRA, version, training status; shared by image + video; `characters.lora_key` integrated; trainer interface/lifecycle | R |
| 13 | World/Location/Asset engine: character, location, world, prop, vehicle, architecture, environment, poster, key art, storyboard frame; reusable | S, J (`entity_images`) |
| 14 | Storyboard seed frames (priority #1): script → scene → shot → requirements → context → cinematic prompt → image → frame → video | T, L |
| 15 | Cinematic continuity: project/scene/shot/character/world/location/prev/next shot/visual bible/cinematography bible compiled into requests | U |
| 16 | Image product priority order (storyboard → … → homepage last) | AA (phases 7–11), Z |
| 17 | Video priority (revised 2.1): model-neutral engine; Wan 2.2 leading production candidate; LTX (license review) and Hunyuan (where permitted) via registry; Wan 2.1 legacy fallback until migration criteria met; removal criteria | E, F, G, H, Z |
| 18 | Billing: metered images; `usage_records.kind` for video, image, audio, upscale, training, etc.; GPU ms, model, resolution, type, count; no final prices | Q |
| 19 | Storage under `projects/{projectId}/images/…`; existing buckets and ownership rules | P, AK |
| 20 | API contracts: `/image/generate|edit|inpaint|outpaint|upscale`, `/image/status/:jobId`, `/video/generate`, `/video/status/:jobId`; follow existing security model; no direct browser→GPU | V, O, AN |
| 21 | Observability: job, user, project, scene, shot, model, version, worker, GPU, queue duration, generation duration, GPU ms, VRAM, retries, errors, output, quality score — image and video | X, J, K |
| 22 | Phased implementation 1–16 | AA, AR |
| 23 | Deliverable sections A–AE | A–AE |
| 24 | Incremental migration; old systems kept until replacements pass production testing | Z, AR |
| 25 | Final architectural vision diagram; unified project context from PROJECT to MASTER | A (diagrams) |

**Directive 3 — Architecture review clarifications (v2.1)**

| Requirement | Section(s) |
|---|---|
| Do not describe LTX-2 as production primary; Video Engine model-neutral; Wan 2.2 initial license-safe production candidate; LTX and HunyuanVideo pluggable candidates subject to licenses | intro callout, E, F, G, Z, AA |
| Eligibility by territory, commercial eligibility, license status, product usage, model version, deployment availability, generation type, account/plan, internal policy | H (eligibility table) |
| Application code never needs to know which video model is primary | intro callout, E, H, L, AO |
| Model statuses: candidate, production_candidate, production, restricted, license_required, territory_blocked, deprecated, retired | H (`media_model_versions.status`) |
| Wan 2.2 leading production candidate pending benchmark; LTX candidate requiring commercial-license review; HunyuanVideo only where license permits; Wan 2.1 legacy fallback until migration criteria | E (classification table), Z |
| Image: Qwen-Image primary + Qwen-Image-Edit (subject to final verification); Z-Image-Turbo drafts; SDXL Inpainting; Real-ESRGAN; Depth Anything V2 Small; no excluded model as hidden dependency | intro callout, C (recommendation, "No hidden dependencies") |
| Character identity Cineforge-owned: references, metadata, embeddings where commercially permitted, LoRA, constraints, reference conditioning, consistency evaluation; no InsightFace/InstantID/PuLID/IP-Adapter-FaceID unless licensing verified | R |
| Security first phase; no unauthenticated generation/training endpoint; short-lived signed job tokens, deployment-bound, action-bound, body-bound; one-time upload/download URLs; no permanent storage credentials in GPU workers; private GPU networking | O (requirements table), AN, AA phase 2, AR I2 |
| Universal metering (image, video, training, upscale, rendering, other GPU ops) without necessarily charging; collect cost/performance data before pricing | Q |
| Architecture review PR, no implementation code | Status line; PR |

**Directive 5 — Complete media production architecture (v2.3)**

| Item | Section(s) |
|---|---|
| Purpose; 1 core principle (synchronized system; timeline authoritative; authoritative chain) | AU.1 |
| 2 Complete media architecture (10 layers) | AU.3 |
| 3 Master Production Clock (coordinated elements; production-ready only with valid temporal relationship) | AU.4 |
| 4 Audio-first timing and planning (10 steps) | AU.5 |
| 5 Video Engine (model-neutral; production intent incl. audio-derived timing) | AU.6, E |
| 6 Audio Engine (capabilities; structured assets with timing metadata) | AU.6 |
| 7 A/V Synchronization Engine (diagram) | AU.7 |
| 8 A/V components (13) | AU.7 |
| 9 Dialogue-to-video levels (7); audio-driven preference | AU.8, AU.6 |
| 10 Lip-sync validation (7 steps, example diagnostic) | AU.9, AU.10 |
| 11 Music, SFX, ambience synchronization | AU.11 |
| 12 Automatic repair loop | AU.12 |
| 13 Final Quality Gate (20 checks) | AU.13 |
| 14 Workflow runtime architecture | AT.6, AU.14 |
| 15 Workflow registry incl. audio, avsync, final-master | AU.14, AT.7 |
| 16 Image Engine | AU.23, C, T |
| 17 Character identity | AU.23, R |
| 18 Cineforge / DeployPro separation; DeployPro not source of creative truth | AU.23, 0 |
| 19 Secure GPU execution (incl. audit) | AU.23, O |
| 20 Job and queue architecture | AU.15, L |
| 21 Data model additions (14 tables) | AU.16 |
| 22 Model registry and router (13 criteria; decision stored) | AU.23, H |
| 23 Storage and provenance | AU.20, AU.17 |
| 24 Billing and universal metering | AU.21, Q |
| 25 Quality and cost strategy | AU.22 |
| 26 Production state machine | AU.18 |
| 27 Failure examples (10) | AU.19 |
| 28 Final mastering pipeline (9 steps) | AU.17 |
| 29 R&D to production promotion | AU.24, AT.16 |
| 30 Migration from third-party generation | AU.24, Z |
| 31 Architectural decision (audio part of video production) | AU.1 |
| 32 Canonical end-to-end flow | AU.25 |
| 33 Implementation priority | AU.26 |
| 34 Final architectural rule | AU.1 |

**Directive 4 — Cineforge + ComfyUI + DeployPro addendum (v2.2)**

| Addendum item | Section(s) |
|---|---|
| 1 Executive decision (ComfyUI = workflow runtime; separation diagram) | AT.1 |
| 2 Core principle (model- and runtime-neutral; models and ComfyUI replaceable; Cineforge owns intent, policy, state, assets) | AT.2 |
| 3 Why ComfyUI belongs | AT.3 |
| 4 What ComfyUI is not | AT.3 |
| 5 User experience (filmmaking verbs, no raw graphs) | AT.5 |
| 6 End-to-end execution | AT.5 |
| 7 Character generation workflow | AT.9 |
| 8 Cinematic image workflow | AT.9 |
| 9 Video workflow | AT.9 |
| 10 WorkflowRuntime abstraction (execute/validate/estimate/cancel/getStatus/getCapabilities; ComfyUI/Diffusers/Future) | AT.6 |
| 11 Workflow Registry (ids; declared requirements incl. license, territory, modes, validation) | AT.7 |
| 12 Model Registry and Router authority; ComfyUI never chooses models | AT.8, H |
| 13 Video model policy | AT.9, E |
| 14 Image model stack; no hidden dependencies | AT.9, C |
| 15 Character identity architecture | AT.9, R |
| 16 DeployPro + ComfyUI | AT.11, AI |
| 17 DeployPro responsibilities | AT.11, 0, AP |
| 18 Cineforge responsibilities | AT.11, 0 |
| 19 Security architecture (gateway, token, validations, one-time URLs, no permanent creds, private networking, provenance, license/territory rejection) | AT.12, O, AN |
| 20 Storage flow | AT.13, P, AK |
| 21 Billing and metering (credit reservation, discovery of costs) | AT.14, Q |
| 22 Workflow cost estimation | AT.14 |
| 23 Experimentation and R&D | AT.16 |
| 24 Promotion experiment → product | AT.16 |
| 25 Why this architecture is better | AT.17 |
| 26 Target unified architecture | AT.18 |
| 27 Implementation order | AT.19, AA, AR |
| 28 Architecture review decisions | Decisions list |
| 29 Strategic principle | AT.18 |
| 30 Amend doc (13 establishing rules) before PR | AT.2 (rules 1–13), this revision |
| 31 Recommended architecture statement | AT.1 |
| 32 Expected long-term result | AT.18 |

**Directive 2 — DeployPro infrastructure requirement**

| Requirement | Section(s) |
|---|---|
| DeployPro principle (DeployPro = infrastructure layer; Cineforge = application layer); compute/storage/network diagram; no permanent public render dependency | 0, A |
| Render temporary; no Render-specific assumptions/APIs/deployment logic/worker behavior/networking/storage; portable stack list | AF, B (infrastructure mapping), AO |
| No permanent RunPod dependency; Cineforge → DeployPro GPU Orchestrator → GPU Worker Pool → NVIDIA GPU → Self-hosted Model | AH, AI, AQ |
| `GpuProvider` → `GpuProviderAdapter` → RunPodAdapter / DeployProAdapter / FutureProviderAdapter; DeployPro preferred | AH, N |
| DeployPro GPU workers 01…N running image, video, audio, upscalers, training; scheduler aware of GPU type, VRAM, capacity, workload, model loaded, priority, plan, estimated GPU time, job type | AI, AQ |
| Model-aware scheduling flow (request → requirements → capability check → GPU search → assignment → model loading → generation → result → availability); LTX/Hunyuan/image/LoRA examples; not every GPU runs every model | AI |
| "Render" disambiguation: application/server rendering vs media/GPU rendering; DeployPro provides both | AJ |
| Media render pipeline (job → scheduler → CPU/GPU worker → processing → storage → asset → preview → final master) for image, video, rendering, audio, localization, subtitles, thumbnails, posters, upscaling, export | AJ |
| `StorageProvider` → `StorageAdapter` → SupabaseStorage / DeployProObjectStorage / FutureStorage; Supabase Storage remains during migration | AK, P |
| Database: PostgreSQL compatibility; Supabase-specific features isolated behind a service boundary | AL |
| Redis/BullMQ kept; deployable inside DeployPro (Cineforge → Redis → BullMQ → DeployPro Workers) | AM |
| Private networking; public internet → CDN/reverse proxy → web → private network → API/queue/storage/workers → CPU/GPU workers; GPU never public; authenticated internal networking | AN, O |
| One Docker image per service (cineforge-web, -worker, -api, -image-worker, -video-worker, -audio-worker, -render-worker, -scheduler, -gpu-manager) | AO |
| DeployPro control plane for deployment, containers, CPU/GPU workers, health, logs, metrics, scaling, domains, TLS, env, secrets, storage, networking, history, resource usage; Cineforge consumes via standard APIs | AP, AG |
| Cineforge must not know the physical server ("give me a GPU capable of running this model") | 0, AH, AP |
| GPU marketplace / pool of multiple physical servers treated as one pool; growth without app changes | AQ |
| Final Cineforge + DeployPro architecture diagram | A |
| Migration phases 1–11 (keep current → provider-independent GPU → DeployPro GPU adapter → image → LTX → Hunyuan → FFmpeg/render → workers → Redis → storage → web/API), system operational at every stage | AR |
| Critical rule: no permanent lock to Vercel, Render, RunPod, OpenAI image generation, third-party video APIs, third-party GPU APIs | AF, Z, AR |
| Final objective & ownership split (Cineforge owns creative intelligence … user experience; DeployPro owns compute … resource management) | 0 |
| Do not implement yet; keep compatibility with current Vercel/Render/RunPod/Supabase during migration | Status line, AR |


---

### Decisions requested at review

1. Approve the **model-neutral Video Engine** with the initial registry
   classification: Wan 2.2 `production_candidate` (leading, pending final
   benchmark), LTX `license_required` (candidate requiring commercial-license
   review), HunyuanVideo `restricted` (only where its license permits), Wan 2.1
   `production` legacy fallback until §Z criteria are met.
2. Approve the **image model proposal** (provisional): Qwen-Image +
   Qwen-Image-Edit (subject to final primary-source license verification),
   Z-Image-Turbo for drafts, SDXL Inpainting, Real-ESRGAN, Depth Anything V2
   Small — and the "no hidden dependencies" rule.
3. Authorize the **LTX commercial-license review** (contact Lightricks and/or
   counsel opinion on Attachment A item 20 and the $10M threshold).
4. Accept **HunyuanVideo's territory restriction** (not available in EU/UK/KR,
   outputs never used for training), or exclude it entirely.
5. Approve **GPU security (Phase 2 / I2)** as the first implementation phase.
6. Approve **universal metering** with charging enabled per kind (initially
   video only) until real cost/performance data sets prices.
7. Approve the **Cineforge-owned identity** approach without InsightFace-based
   adapters, and the open item to select a commercially licensed embedding
   model for consistency scoring.
8. Approve **ComfyUI as a supported workflow runtime** behind `WorkflowRuntime`
   (with `DiffusersRuntime`), with the Cineforge UX independent of ComfyUI's
   node editor and no customer-supplied graphs.
9. Approve the **Workflow Registry** (versioned, immutable production
   definitions) and the experiment → production promotion gates.
10. Request **counsel review of ComfyUI's GPL-3.0 license** for any future
    distribution scenario (on-prem / customer-hosted DeployPro) and approve
    the rule that Cineforge proprietary code stays out of the ComfyUI process.
11. Adopt the **portability rules (§AF)** as binding for all new Cineforge services.
12. Accept the **DeployPro gap list (§AG G1–G13)** as DeployPro's roadmap
   prerequisites, and the first DeployPro GPU target being **one image node (I4)**.
13. Choose the database target path for I11: self-hosted Supabase services on
   DeployPro (preferred, §AL option a) or `cineforge-api` replacing
   PostgREST/Realtime (option b) — decision can wait until I10.

14. Approve **synchronized production** (§AU): the Master Production Clock
    (integer-µs timebase, one production fps), audio-first planning, the A/V
    Synchronization Engine and the rule that COMPLETE requires the Final
    Quality Gate.
15. Approve the **ordering reconciliation** in §AU.26: GPU security stays the
    first implementation phase; clock/audio/sync schemas proceed alongside it.
16. Approve **A/V analysis tooling** candidates pending license verification
    (WhisperX alignment models per language, MFA models, MediaPipe, SyncNet
    weights) and **Wan 2.2 S2V** as the audio-driven talking-shot candidate.
17. Approve **sync tolerances and delivery profiles** as configuration to be
    calibrated in the benchmark, not fixed in code.
