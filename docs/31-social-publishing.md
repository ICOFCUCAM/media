# 31 — Social publishing

Push a finished film/ad straight to social platforms. One interface, one queue,
per-provider results recorded on the film.

## Flow

```
film ready (films.mp4Key) ─► publish-queue ─► for each requested + configured provider:
      Publisher.publish({ title, description, tags, videoUrl }) ─► result
                                         │
                       films.publications[provider] = { status, id?, url?, detail? }
                       films.publishedAt = now (if any succeeded)
```

## What's built

- **Adapters** (`packages/model-adapters/src/publish/publish.ts`) — a `Publisher`
  interface with `YouTubePublisher` / `TikTokPublisher` and `buildPublishers(env)`.
  Each exposes `configured` (are its OAuth creds present?). Extend by adding a
  provider class — Instagram/Facebook/LinkedIn/X/Threads/Pinterest/etc. follow
  the same shape, credentialed by the env in `.env.example`.
- **Queue + processor** — `publish-queue` / `publish.processor`: resolves the
  film's MP4 to a public URL (`ASSET_PUBLIC_BASE_URL`), publishes to the
  requested providers, and writes `films.publications` (+ `publishedAt`).
  Producer: `enqueuePublish`.

## Safety

Publishing is outward-facing, so the design is fail-safe:

- A provider with **no credentials is skipped** — it never posts.
- The **actual upload is a marked integration point** (OAuth refresh + the
  platform upload API). Until wired, a *configured* provider returns
  `status: "error", detail: "upload not wired (scaffold)"` rather than silently
  succeeding — so nothing is ever posted by accident.
- Wire each provider's upload, then connect the creator's "Publish to…" action to
  `enqueuePublish`.
