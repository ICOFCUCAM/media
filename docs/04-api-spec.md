# 04 — API Specification

Base URL: `https://api.cineforge.app/v1`. REST + JSON. Auth: `Authorization:
Bearer <JWT>` (user) or `X-Api-Key` (programmatic). Real-time updates over
WebSocket. All long operations return `202` with a job id and are tracked via
WS or polling `GET /jobs/:id`.

## Conventions
- IDs are cuids.
- Timestamps ISO-8601 UTC.
- Errors: `{ "error": { "code": "QUOTA_EXCEEDED", "message": "...", "details": {} } }`.
- Pagination: `?cursor=&limit=` → `{ data: [], nextCursor }`.

## Auth

```
POST /auth/register   { email, password, displayName }     -> { user, accessToken, refreshToken }
POST /auth/login      { email, password }                  -> { user, accessToken, refreshToken }
POST /auth/refresh    { refreshToken }                      -> { accessToken }
POST /auth/logout                                            -> 204
GET  /me                                                     -> { user, tier, creditsMs }
```

## Projects

```
POST /projects
  req:  { title, prompt, targetSeconds, aspectRatio?, modelId? }
  res:  201 { project }

GET  /projects?cursor=&limit=          -> { data:[project], nextCursor }
GET  /projects/:id                     -> { project, scenesSummary, film? }
PATCH /projects/:id                    -> { project }
DELETE /projects/:id                   -> 204
```

### Example: create project
```http
POST /v1/projects
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "title": "Kingdom of Dawn",
  "prompt": "Create a 30-minute cinematic movie about an African kingdom fighting for independence.",
  "targetSeconds": 1800,
  "aspectRatio": "16:9",
  "modelId": "wan-2.1"
}
```
```json
{
  "project": {
    "id": "ckp_8s...",
    "status": "DRAFT",
    "targetSeconds": 1800,
    "progress": 0
  }
}
```

## Film generation (the headline endpoint)

```
POST /generate-film
  req:  { projectId }            // kicks Director AI -> full pipeline
  res:  202 { jobId, projectId, status: "PLANNING" }
```
```json
// 202
{ "jobId": "film_job_91...", "projectId": "ckp_8s...", "status": "PLANNING" }
```

Subscribe to progress (WebSocket, see below) or:
```
GET /jobs/:jobId   -> { id, type, state, progress, data }
```

## Director / planning (granular control, optional)

```
POST /projects/:id/screenplay         -> 202 { jobId }        // generate screenplay only
GET  /projects/:id/screenplay         -> { screenplay }
POST /projects/:id/breakdown          -> 202 { jobId }        // screenplay -> scenes+shots
GET  /projects/:id/scenes             -> { data:[scene] }
GET  /scenes/:id                      -> { scene, shots, dialogue, audioTracks }
```

## Budget & resume (docs/24 §C8)

```
GET  /projects/:id/estimate     -> { estimatedMs, creditsMs, affordable }
POST /projects/:id/resume       -> { jobId, status, estimatedMs, spentMs }   // body: { addBudgetMs? }
```
`POST /generate-film` may reject with `MODEL_NOT_ALLOWED` (tier gating) or
`INSUFFICIENT_CREDITS` (pre-flight estimate). A project that exceeds its budget
ceiling mid-generation transitions to `PAUSED` and emits a `project.paused` WS
event; `resume` continues it without re-planning.

## Per-scene / per-shot generation & regeneration

```
POST /generate-scene  { sceneId }                 -> 202 { jobId }
POST /shots/:id/regenerate { seed?, prompt? }     -> 202 { jobId }
GET  /shots/:id                                    -> { shot }
```

## Bibles

```
GET  /projects/:id/characters             -> { data:[character] }
POST /projects/:id/characters             -> 201 { character }
PATCH /characters/:id                      -> { character }
POST /characters/:id/reference            -> { uploadUrl, key }   // presigned
GET  /projects/:id/locations              -> { data:[location] }
POST /projects/:id/locations              -> 201 { location }
```

## Continuity

```
GET  /projects/:id/continuity?sceneIndex=42   -> { state }   // canonical truth at N
POST /projects/:id/continuity/validate         -> { issues:[{sceneIndex,type,message}] }
```

## Render & film

```
POST /render            { projectId, kind: "preview"|"final" }  -> 202 { renderJobId }
GET  /render/:id                                                 -> { renderJob }
GET  /film/:id                                                   -> { film, streamUrl, downloadUrl }
GET  /film/:id/stream                                            -> 302 -> signed HLS .m3u8
GET  /film/:id/download                                          -> 302 -> signed MP4 URL
```

### Example: get film
```json
{
  "film": { "id":"flm_1...", "durationSec":1802.5, "views":12 },
  "streamUrl": "https://cdn.cineforge.app/hls/flm_1/master.m3u8?token=...",
  "downloadUrl": "https://s3.../final.mp4?X-Amz-Signature=..."
}
```

## Billing

```
GET  /billing/quota        -> { tier, creditsMs, used, resetsAt, limits }
POST /billing/checkout     { tier }   -> { url }     // Stripe checkout
POST /billing/webhook                  // Stripe -> server (signed)
```

## Admin (role=ADMIN)

```
GET /admin/users?cursor=        GET /admin/gpu            GET /admin/jobs
GET /admin/revenue              GET /admin/films          GET /admin/models
```

## WebSocket

`wss://api.cineforge.app/v1/ws?token=<JWT>` — Socket.IO, Redis adapter for
multi-node fan-out. Client subscribes to a project room.

**Implemented:** `apps/api/src/realtime/realtime.gateway.ts` authenticates the
JWT on connect and joins `project:<id>` rooms **only after verifying the caller
owns the project** (Prisma ownership check in `onSubscribe`; unauthorized
subscribes are rejected with an `error` event). Workers (separate processes)
publish events via `@cineforge/realtime` (`RealtimePublisher` → Redis channel);
the gateway's `RealtimeSubscriber` forwards them into the right room, so it works
across many API nodes. Event names/payloads are typed once in
`packages/realtime/src/events.ts`.

```jsonc
// client -> server
{ "event": "subscribe", "data": { "projectId": "ckp_8s..." } }

// server -> client events
{ "event": "project.progress", "data": { "projectId":"...", "progress":0.42, "status":"GENERATING" } }
{ "event": "scene.ready",      "data": { "sceneId":"...", "index":12 } }
{ "event": "shot.ready",       "data": { "shotId":"...", "thumbnailUrl":"..." } }
{ "event": "render.progress",  "data": { "renderJobId":"...", "progress":0.8 } }
{ "event": "film.ready",       "data": { "filmId":"...", "streamUrl":"..." } }
{ "event": "error",            "data": { "scope":"scene", "id":"...", "message":"..." } }
```

## Rate limits (per tier) — see [17-security.md](17-security.md)
`429` with `Retry-After`. Headers: `X-RateLimit-Limit/Remaining/Reset`.

## OpenAPI
NestJS emits OpenAPI 3.1 at `/v1/openapi.json` (Swagger UI at `/v1/docs`).
