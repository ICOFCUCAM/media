# Running the Cineforge worker on DeployPro (replacing Render)

The worker is the background engine: Director, scenes, shots, audio, render and the GPU auto start/stop. It used to run on Render as `cineforge-worker`, with Render Key Value as its Redis. This page moves it to DeployPro, following docs/38 §AF: worker → DeployPro worker process. The GPU stays on RunPod (Phase 12 is later).

## Read first — four settings that are not optional

| Setting | Why |
|---|---|
| **One worker only** | Every container of this image consumes the production queue and drives the RunPod pod's start/stop. Suspend or delete the Render worker for good, and never add `deploypro process` replicas of it. |
| `--previews off` | A preview deployment of a branch would run a second consumer against production. |
| `--keep-warm 0` | DeployPro keeps 2 superseded containers running by default (for instant rollback). For this image that means old code still taking jobs. |
| Redis with **`noeviction`** | BullMQ loses jobs if Redis evicts keys. |

## 1. Redis (the job queue)

DeployPro does not run Redis yet: every deployment must answer an HTTP health check, and it has no managed data services (§AG gap G9). Use a hosted Redis:

- **Redis Cloud** (redis.io), Free 30 MB plan.
- In the database's **Configuration**, set **Data eviction policy** to `noeviction`.
- Copy the endpoint as `redis://default:<password>@<host>:<port>` (use `rediss://` if TLS is on).

The queue holds only in-flight jobs. Nothing needs to be carried over from the suspended Render Redis, because films are re-enqueued from the database.

## 2. The DeployPro project

On the DeployPro host:

```sh
deploypro project create --name "Cineforge worker" --slug cineforge-worker \
  --repo https://github.com/ICOFCUCAM/media.git --branch claude/sleepy-johnson-8fu6b3
deploypro project set cineforge-worker --previews off --keep-warm 0 --memory 4096 --cpus 2
```

- **Root directory:** leave it empty. The repository-root `Dockerfile` is the worker image and needs the whole workspace as build context.
- **Port:** 8080 (from `EXPOSE`).
- **Health check:** DeployPro checks `GET /` on that port. It returns **200 only while Redis answers**, so a wrong `REDIS_URL` fails the deploy instead of going live (`apps/worker/src/health.ts`).
- **Private repository:** if the repository is private, use the GitHub App or `deploypro project key cineforge-worker` (see the DeployPro README).
- **Resources:** 4 GB / 2 CPUs is a starting point. FFmpeg renders are the peak.

## 3. Environment variables (production target)

Copy the values from Render → `cineforge-worker` → Environment. A suspended service's settings are still readable. Use `deploypro env set cineforge-worker KEY 'value' --target production`, or `-` to read a secret from stdin.

| Key | Value |
|---|---|
| `REDIS_URL` | the Redis Cloud URL from step 1 |
| `DATABASE_URL` | Supabase pooled Postgres string (from Render) |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | from Render |
| `S3_REGION` | `us-east-1` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `ASSET_PUBLIC_BASE_URL` | from Render |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | from Render |
| `ANTHROPIC_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | from Render (defaults in `render.yaml`) |
| `WAN_GPU_URL` | `https://<NEW_POD_ID>-8000.proxy.runpod.net` |
| `RUNPOD_API_KEY` | from Render |
| `RUNPOD_WAN_POD_ID` | `<NEW_POD_ID>` |
| `GPU_GATEWAY_MODE` | `report` |
| `GPU_UPLOAD_URL_MODE` | `s3` |
| `RUNTIME_TIMING_POLICY` | `record` |
| `RENDER_NARRATION_OVERRUN` | `fail` |
| optional, only if set on Render | `FAL_*`, `EXTERNAL_VIDEO_API_*`, `HUNYUAN_GPU_URL`, `LOCALIZATION_LANGUAGES`, `LORA_TRAINER_*`, social publishing keys, cost guardrails, `GPU_IDLE_GRACE_SEC` |

Do **not** set `GPU_JWT_SIGNING_KEY` yet. That is Stage 2, after this runs (docs/39 §10).

## 4. Deploy and verify

```sh
deploypro deploy cineforge-worker
deploypro logs <deployment-id> --follow
```

Expected:
- The build log shows the repository Dockerfile.
- The health check reports `answered 200 on /`.
- The runtime log shows `cineforge worker up: processors + project watcher + GPU lifecycle loops running`.

Then make one short Auto film in the web app and check:
- the RunPod pod starts by itself;
- the shot logs a `runtime.timing_outcome` line;
- the film reaches READY;
- the pod stops by itself after the idle grace period.

**Rollback:** there is no Render to fall back to while it is suspended. Fix forward from the deploy log, or `promote` the previous DeployPro deployment.

## 5. Stage 2 on DeployPro

Follow docs/39 §10 steps 1–7 with DeployPro in place of Render:
- **Keys:** `GPU_JWT_SIGNING_KEY` goes in `deploypro env set … --target production` (encrypted, never readable back). The public key goes on the RunPod pod.
- **Admin commands** run in the worker image. Keygen needs no database, so it can also run on any machine with the repository:
  `docker run --rm --env-file <prod env> <image> pnpm --filter @cineforge/worker gateway:admin …`
