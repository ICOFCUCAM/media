# 31 — Social publishing (Social Launchpad)

Push a finished film/ad straight to social platforms. One interface, one queue,
per-platform results recorded on the launch.

> **Status (2026-10-09):** the earlier `publish-queue` / `publish.processor` /
> `enqueuePublish` path (results on `films.publications`) was deleted; it had
> no producer. Social posting is the Social Launchpad below.

## Flow

```
SocialLaunchpad (web) inserts social_launches row (status PENDING, brief, videoKey)
  ─► worker project poller ─► social-queue { kind: "kit", id }
        planning model writes a per-platform kit ─► status KIT_READY
user asks to launch (status LAUNCH_REQUESTED)
  ─► worker project poller ─► social-queue { kind: "launch", id }
        for each publisher from buildPublishers(env):
          Publisher.publish({ title, description, tags, videoUrl }) ─► result
        social_launches.results[provider] = { status, id?, url?, detail? }
        status LAUNCHED if any published, else KIT_READY with the reason
```

## What's built

- **Adapters** (`packages/model-adapters/src/publish/publish.ts`) — a `Publisher`
  interface and `buildPublishers(env)`. Real HTTP uploads for YouTube (OAuth
  refresh + resumable upload, default private), TikTok (Content Posting
  `PULL_FROM_URL`), Instagram Reels and Facebook Pages; X remains a scaffold
  (paid API tier) and returns an error. Each exposes `configured` (are its
  credentials present?).
- **Queue + processor** — `social-queue` / `apps/worker/src/processors/social.processor.ts`,
  job kinds `kit` and `launch`. Producer: the worker's project poller
  (`apps/worker/src/orchestration/project-poller.ts`), which claims
  `PENDING` and `LAUNCH_REQUESTED` rows. The video is passed as a presigned
  URL (24 h), so the bucket stays private.
- **Kit** — written by the planning model via the intelligence router
  (prompt `social.kit`). If it cannot be written the launch is `FAILED` with the
  reason; no template is passed off as a kit.
- **Web** — `apps/web/components/SocialLaunchpad.tsx`.

## Safety

Publishing is outward-facing, so the design is fail-safe:

- A provider with **no credentials is skipped** (`status: "skipped"`) — it never posts.
- YouTube uploads default to **private** so the creator reviews first.
- Re-launching is idempotent per provider: an already `published` result is not
  posted again.
