# 38 — Cineforge Media Engine: Image Intelligence & Video Engine Architecture

Status: **PROPOSED — for review. No implementation until approved.**
Date: 2026-10-06 · Supersedes nothing; extends docs/12, 22, 23, 25, 28.

This document designs (1) a proprietary, self-hosted **Image Intelligence &
Generation Engine** and (2) a model-independent **Video Engine** with LTX as the
intended primary and HunyuanVideo as premium/alternative. It extends the
architecture that exists today; it does not replace it.

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
>    revenue restriction. The model being demoted is the most license-safe
>    video family we have. The architecture keeps it as the guaranteed
>    fallback, and recommends evaluating **Wan 2.2** alongside LTX.

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
   RUNPOD (one model per pod, existing apps/gpu-worker pattern)
   ┌───────────────┬───────────────┬────────────────┬───────────────────────┐
   │ image pool    │ video pool    │ video pool     │ video pool (fallback) │
   │ cf-image      │ LTX           │ HunyuanVideo   │ Wan 2.1 → Wan 2.2     │
   └───────────────┴───────────────┴────────────────┴───────────────────────┘
                                           │
                                           ▼
                       Supabase Storage  cineforge-assets/projects/{projectId}/…
   (* = new)
```

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
| NestJS `apps/api` | legacy, not deployed | unchanged; **not used** for this work | none |

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

**Primary image model: Qwen-Image (T2I) + Qwen-Image-Edit-2511 (edit / reference
/ identity), served as one "cf-image" family.**
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

### Video strategy

The architecture is built exactly as directed: **LTX is the primary engine
slot, HunyuanVideo the premium/alternative slot, Wan 2.1 the legacy fallback.**
Which model *occupies* each slot is registry configuration, so the legal
outcome does not change the code:

1. **Phase 12 gate (LTX):** obtain a written commercial agreement from
   Lightricks that covers Cineforge's use (resolving item 20 and the $10M
   threshold) — or a counsel opinion that Cineforge is not "directly
   competing". Until then LTX runs only in internal evaluation.
2. **In parallel, evaluate Wan 2.2 TI2V-5B / A14B** in the same bake-off. If the
   LTX agreement is not secured, Wan 2.2 takes the primary slot with zero
   architectural change.
3. **HunyuanVideo** is registered with `territory_excludes = [EU, UK, KR]`; the
   router never assigns it to users in those regions (determined by billing
   country, §H), and its outputs are tagged `outputs_trainable = false` so the
   Model Lab can never ingest them.

---

## F. LTX integration strategy

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
- **Rollout:** shadow → internal → 5% → 25% → 100% of the primary slot (§Z).

## G. HunyuanVideo integration strategy

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
  status text not null default 'enabled' check (status in ('enabled','disabled','deprecated','eval_only'))
);

create table public.media_model_versions (
  id text primary key,                         -- 'ltx/2.5-distilled'
  model_id text not null references public.media_models(id),
  version text not null,                       -- weights revision / commit sha
  weights_uri text not null,                   -- repo@revision or s3 key
  license_id text not null references public.model_licenses(id),
  class text not null check (class in ('draft','standard','premium','cinematic','utility','legacy')),
  capabilities jsonb not null,                 -- ImageModelCapabilities | VideoModelCapabilities
  defaults jsonb not null default '{}',        -- steps, guidance, scheduler…
  cost_model jsonb not null default '{}',      -- est gpu-ms per megapixel / per second
  status text not null default 'eval_only' check (status in ('eval_only','canary','active','deprecated','retired')),
  created_at timestamptz not null default now()
);

create table public.media_model_deployments (
  id text primary key,                         -- 'ltx-h100-pool-a'
  version_id text not null references public.media_model_versions(id),
  pool text not null,                          -- 'image', 'video-primary', 'video-premium', 'video-legacy'
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

### Router algorithm (both modalities)

```
candidates = first enabled routing_policy (by priority) whose conditions match the request context
for version in candidates (+ rollout_percent hashing on user_id for canaries):
    reject if version.status not in (canary, active)        (eval_only allowed only for admin)
    reject if license.territory_excludes ∋ user.country
    reject if license.revenue_cap_usd and cineforge_revenue_usd ≥ cap and no agreement_ref
    reject if license.competing_use_restricted and no agreement_ref
    reject if capability mismatch (operation, resolution, duration, refs, mask, lora…)
    reject if plan not allowed (policy condition)
    score = w_quality·quality_class + w_cost·(1/est_gpu_ms) + w_load·(1/queue_depth(deployment)) + w_warm·is_warm
pick max score; else fall through to next policy; else fail with ROUTE_UNAVAILABLE
```
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
| video-draft | video, quality=draft | ltx/2.5-distilled · wan/2.2-ti2v-5b · wan/2.1-t2v-1.3b |
| video-standard | video, quality=standard | ltx/2.5 · wan/2.2-a14b · wan/2.1 |
| video-cinematic | video, quality=cinematic, plan∈{STUDIO,AGENCY,ENTERPRISE} | hunyuan/1.5-sr1080 · ltx/2.5-hq · wan/2.2-a14b |

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
  `video-primary`, `video-premium`, `video-legacy`). Image and video never share
  a pod; each pool has its own min/max pods and idle timeout.
- An image pod may host a **multi-model backend** only when the models share
  base weights (e.g. Qwen-Image + Qwen-Image-Edit share the text encoder and
  VAE); otherwise one model per pod as today.
- One inference at a time per GPU (existing `_infer_lock`); batching of
  same-version image requests (count>1) inside one call.
- Weights on RunPod network volumes per deployment, pinned by revision; cold
  start loads from volume, never from the public hub at request time.

## N. RunPod lifecycle integration

Extend `packages/gpu`, do not duplicate it:
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

---

## O. Authentication architecture (mandatory fix — Phase 2)

Today: the worker sends `Authorization: Bearer <RUNPOD_API_KEY>`; FastAPI checks
nothing; anyone with a pod URL can call `/generate` and `/train`.

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
- Transport: RunPod proxy HTTPS only; reject plain HTTP; request size limits;
  per-pod rate limit as defense in depth.
- Browsers **never** talk to GPU pods; endpoints are not exposed in any
  browser-readable table or RPC.
- Future hardening (optional): mTLS between worker and pods, or an
  authenticated private network (Tailscale/WireGuard) for pods that support it.

## P. Storage architecture

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
    ('video','image','audio','upscale','training','voice','avatar','music','llm'));
```
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

## R. Character Identity architecture

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
        lora_key, train_params, metrics (jsonb: identity similarity score),
        trained_at, trained_on (deployment), gpu_ms
```
- **Two identity methods, same interface.** `reference_only` (works today with
  Qwen-Image-Edit multi-reference) and `lora` (trained adapter, tighter). The
  ContextCompiler asks `IdentityService.resolve(characterId, family)` and gets
  back `{ references: InputRef[], loras: LoraRef[] }` for whatever model
  family the router picked. Image and video share the same identity object.
- **LoRAs are per base-model family.** A character may have one ready identity
  per family (`unique (character_id, family) where status='ready'`). Switching
  video primary from Wan to LTX triggers retraining for active characters
  (queued `training` jobs, metered `kind='training'`).
- `characters.lora_key` / `lora_version` remain as a **denormalized pointer** to
  the identity used by the current primary video family (back-compat for the
  existing video processor).
- **Lifecycle:** create character → generate/approve references (portrait +
  turnaround via Image Engine) → `collecting` (≥ N approved refs) → `training`
  (existing `lora` queue, real trainer on a training pool) → automated identity
  score vs held-out refs → `ready` → used by image + video → `retired` when
  superseded.
- **No face-ID adapters that depend on InsightFace models** (non-commercial).
  Identity similarity scoring for QC (Phase 15) must use a commercially
  licensed embedding model — selection is an open item (§AB).
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
   `openai/gpt-image-1` (class `legacy`). Every seed frame now creates an
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

**Video (Wan 2.1 → LTX primary)**
1. Register current Wan 2.1 deployment as `wan/2.1-t2v-1.3b` class `legacy`;
   VideoEngine routes 100% to it — no behavior change.
2. Bake-off on the video eval set: LTX-2.5 (distilled + standard), Wan 2.2
   TI2V-5B / A14B, HunyuanVideo 1.5 — quality, I2V fidelity to storyboard
   frames, identity retention, speed, cost.
3. **License gate** (§E): LTX enters canary only with the Lightricks agreement
   recorded (`agreement_ref`). Otherwise Wan 2.2 takes the primary slot.
4. Canary 5% → 25% → 100% on `video-standard`; Wan 2.1 stays as fallback
   candidate.
5. **Wan 2.1 removal criteria:** primary model at 100% for 30 days, fallback to
   Wan 2.1 triggered < 0.5% of jobs, no open incidents, active-character LoRAs
   retrained for the new family. Then status `deprecated` → `retired`, pods
   scaled to 0, image retained 90 days for rollback.

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
| 12 | LTX primary (license-gated) or Wan 2.2 primary | Canary → 100%; Wan 2.1 removal criteria | 3, legal |
| 13 | HunyuanVideo 1.5 premium with territory enforcement | Cinematic class live outside EU/UK/KR | 3 |
| 14 | Unified continuity: ContextCompiler, project bibles, prev/next shot conditioning | Continuity eval improves vs baseline | 7, 9 |
| 15 | Cinematic intelligence & automatic QC (aesthetic, prompt adherence, identity, artifacts) | QC gates auto-regenerate below threshold | 14 |
| 16 | Model Lab: LoRA/adapters/fine-tunes; only on `outputs_trainable` data | First Cineforge-tuned version in canary | 9, 15 |

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
| Other third-party dependencies remain | Not fully self-hosted | Out of scope here: Anthropic (Director), fal (voice, avatars, music, video upscale), OpenAI (TTS, moderation). Tracked for later phases |

## AC. Hardware requirements

| Pool | Workload | Recommended GPU | Minimum | Notes |
|---|---|---|---|---|
| image | Qwen-Image / Edit (bf16) | **L40S 48 GB** or A6000/A40 48 GB | 24 GB with FP8 + offload (slower) | text encoder + transformer + VAE resident |
| image-draft | Z-Image-Turbo | L4 24 GB / RTX 4090 24 GB | 16 GB (vendor) | can co-host ESRGAN |
| image-utility | SDXL inpaint, ESRGAN, Depth-Anything-S | L4 24 GB | 12 GB | |
| video-primary | LTX-2.x 13B-class | **H100 80 GB** | A100 80 GB; FP8 for 48 GB | vendor: HD ~10 s on H100 (0.9.8 distilled) |
| video-primary (alt) | Wan 2.2 TI2V-5B 720p | RTX 4090 / L40S | 24 GB (vendor) | A14B needs 80 GB at 720p |
| video-premium | HunyuanVideo 1.5 | A100 80 GB / H100 | 14 GB with offload (vendor, slow) | 1080p SR adds time |
| video-legacy | Wan 2.1 1.3B | L4 / 4090 | 8.19 GB (vendor) | existing |
| training | LoRA (image + video families) | A100 80 GB / H100 | 48 GB for image LoRA | on-demand pool |

Network volumes: ~200 GB per video deployment, ~120 GB per image deployment
(weights + cache).

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
`min_pods=0, max_pods=2`, scale on queue depth. Video primary: start
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

### Decisions requested at review

1. Approve **Qwen-Image + Qwen-Image-Edit** as primary image family, **Z-Image-Turbo**
   for drafts, SDXL-inpaint + Real-ESRGAN as utilities.
2. Approve the **legal gate on LTX** and authorize contacting Lightricks for a
   commercial agreement; approve evaluating **Wan 2.2** as the license-safe
   primary alternative.
3. Accept **HunyuanVideo territory restriction** (premium unavailable in EU/UK/KR),
   or drop it as premium in favor of LTX-hq / Wan 2.2 A14B.
4. Approve Phase 2 (GPU security) as the first implementation step.
5. Approve metering-without-debit for images during Phase 6–8.
