# 01 — System Architecture

All diagrams are Mermaid (render on GitHub).

> **Status (2026-10-09):** these diagrams are the original target. There is no
> WebSocket layer: the Socket.IO gateway and `packages/realtime` were deleted.
> The web app writes and reads Supabase directly and gets live status from
> Supabase Realtime on `projects`; the worker's project poller picks up new
> projects. `apps/api` authenticates Supabase session tokens and is deployable
> but not deployed (docs/04).

## 1. High-level system

```mermaid
flowchart TB
  subgraph Client
    WEB[Next.js Web App + Admin]
  end

  subgraph Edge
    CDN[CDN / HLS streaming]
    LB[Load Balancer]
  end

  subgraph AppTier[Stateless App Tier - autoscaled]
    API[NestJS API: REST + Supabase session JWT]
  end

  subgraph DataTier
    PG[(PostgreSQL)]
    REDIS[(Redis)]
    S3[(S3 / MinIO object store)]
  end

  subgraph Queues[BullMQ on Redis]
    Qfilm[film-queue]
    Qscene[scene-queue]
    Qvideo[video-queue]
    Qaudio[audio-queue]
    Qrender[render-queue]
  end

  subgraph Workers[Worker Tier - autoscaled]
    Wdir[Director Worker]
    Wscene[Scene Worker]
    Waudio[Audio Worker]
    Wrender[Render Worker - FFmpeg]
    GMGR[GPU Lifecycle Manager]
  end

  subgraph GPU[RunPod GPU Pool - autoscaled, idle-shutdown]
    GW1[GPU Worker: Wan 2.1]
    GW2[GPU Worker: Hunyuan]
  end

  subgraph Observability
    PROM[Prometheus]
    GRAF[Grafana]
    LOGS[Loki / Logs]
  end

  WEB --> CDN
  WEB --> LB --> API
  API <--> PG
  API <--> REDIS
  API --> S3
  API --> Qfilm

  Qfilm --> Wdir --> Qscene
  Qscene --> Wscene --> Qvideo
  Qscene --> Waudio --> Qaudio
  Qvideo --> GW1
  Qvideo --> GW2
  GMGR -->|start on demand / auto-shutdown| GPU
  Qvideo -.queue depth / job counts.-> GMGR
  API -->|ensureRunning before enqueue| GMGR
  Wscene -->|render trigger| Qrender --> Wrender --> S3
  GW1 --> S3
  GW2 --> S3
  Wrender --> CDN

  API -.metrics.-> PROM
  Workers -.metrics.-> PROM
  GPU -.metrics.-> PROM
  PROM --> GRAF
```

## 2. Request → film lifecycle

```mermaid
sequenceDiagram
  participant U as User
  participant API
  participant Q as BullMQ
  participant D as Director Worker
  participant S as Scene Worker
  participant G as GPU Worker
  participant A as Audio Worker
  participant R as Render Worker
  participant ST as S3

  U->>API: POST /generate-film {prompt, duration}
  API->>Q: add film-job
  API-->>U: 202 {projectId, jobId} + WS subscribe
  Q->>D: process film-job
  D->>D: screenplay + bibles + continuity init
  D->>Q: fan-out scene-jobs (1..N)
  loop each scene
    Q->>S: process scene-job
    S->>S: Prompt Builder (+continuity)
    S->>Q: video-jobs per shot
    Q->>G: generate clip
    G->>ST: upload clip
    G-->>S: clip ready (WS/event)
    S->>Q: audio-jobs (voice/music/sfx)
    Q->>A: synth + mix
    A->>ST: upload audio
  end
  D->>Q: render-job (when scenes ready)
  Q->>R: FFmpeg assemble
  R->>ST: final MP4 + HLS
  R-->>API: done -> WS push to user
```

## 3. Model abstraction layer

```mermaid
flowchart LR
  SW[Scene/Video Worker] --> REG[ModelRegistry]
  REG --> AD1[WanAdapter]
  REG --> AD2[HunyuanAdapter]
  REG --> AD3[KlingAdapter - future]
  REG --> AD4[VeoAdapter - future]
  AD1 --> EP1[RunPod endpoint: Wan]
  AD2 --> EP2[RunPod endpoint: Hunyuan]
  AD3 --> EP3[External API]
  subgraph contract[VideoModelAdapter interface]
    direction TB
    C1[generate ShotRequest -> ShotResult]
    C2[capabilities]
    C3[estimateCost]
    C4[healthcheck]
  end
```

The frontend and the scene pipeline only know the **`VideoModelAdapter`
interface** and a model `id` string. Adding a model = add an adapter +
register it. No frontend change. See `packages/model-adapters`.

## 4. Rendering pipeline

```mermaid
flowchart LR
  CLIPS[Scene clips in S3] --> CONCAT[FFmpeg concat + scaling]
  TRANS[Transitions / crossfades] --> CONCAT
  VOICE[Voice tracks] --> MIX[Audio mixdown]
  MUSIC[Music tracks] --> MIX
  SFX[SFX tracks] --> MIX
  CONCAT --> MUX[Mux video+audio]
  MIX --> MUX
  SUBS[Subtitles .ass/.srt] --> MUX
  INTRO[Intro/Outro/Credits] --> MUX
  MUX --> MP4[Final MP4]
  MP4 --> HLS[HLS segments]
  MP4 --> S3O[(S3)]
  HLS --> S3O
```

## 5. Streaming pipeline

```mermaid
flowchart LR
  S3[(S3: HLS .m3u8 + .ts)] --> CDN[CDN edge cache]
  CDN --> PLAYER[hls.js player in web app]
  API[Signed URL service] --> PLAYER
```

- Final MP4 is also transcoded to HLS (multiple bitrates) for adaptive
  streaming. Download uses short-lived presigned S3 URLs.

## 6. Monitoring pipeline

```mermaid
flowchart LR
  API -->|/metrics| PROM[Prometheus]
  WORK[Workers] -->|/metrics| PROM
  GPU[GPU workers] -->|/metrics| PROM
  BULL[BullMQ] -->|exporter| PROM
  NODE[node/cAdvisor] --> PROM
  PROM --> GRAF[Grafana dashboards]
  PROM --> ALERT[Alertmanager]
  API --> LOKI[Loki logs]
  WORK --> LOKI
```

## 7. Scaling strategy (summary)

| Layer | Scaling mechanism |
|-------|-------------------|
| Web | Stateless, CDN-fronted, horizontal replicas |
| API | Stateless, HPA on CPU/RPS, sticky-free (JWT) |
| Live updates | Supabase Realtime (Postgres Changes, RLS-scoped); no WebSocket tier |
| Workers | Per-queue replica count, concurrency tuning, BullMQ priorities |
| GPU | RunPod autoscale by queue depth, idle shutdown, per-model pools |
| Postgres | Read replicas, PgBouncer pooling, partition large tables |
| Redis | Cluster mode for queue + cache separation |
| Storage | S3 native scaling, CDN for reads |

Full detail in [19-scaling-cost.md](19-scaling-cost.md).

## 8. Deployment strategy (summary)

- **Local:** docker-compose (pg, redis, minio) + `pnpm dev`.
- **Staging/Prod:** Kubernetes (Helm). App & workers as Deployments with HPA;
  GPU workers on RunPod (serverless endpoints + on-demand pods) decoupled via
  queue. CI/CD via GitHub Actions → registry → Helm upgrade.

Full detail in [20-deployment-plan.md](20-deployment-plan.md).
