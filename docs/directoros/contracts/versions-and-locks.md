# Contract — Versions and locks (W8a)

Requirements: DOS-31, 37, 38. Code: `apps/worker/src/versions/record.ts`,
`apps/worker/src/processors/video.processor.ts` (clip versions),
`apps/worker/src/processors/audio.processor.ts` (voice track versions),
`apps/worker/src/processors/render.processor.ts` and
`apps/worker/src/ffmpeg/render-engine.ts` (versioned masters),
`apps/worker/src/canon/revision.ts` (lock refusal), migrations
`0037_locks.sql`, `0038_lock_function_grants.sql`, `apps/web/lib/production.ts`,
`apps/web/components/ProductionLocks.tsx`.

## 1. Purpose

Never lose a take or a master, and let an owner freeze what is finished so no
later regeneration or edit can change it.

## 2. Inputs

Accepted clips (with the clip's measured hash and length), scene voice tracks,
delivered masters; lock and unlock requests from the owner.

## 3. Outputs

`media_versions` rows (asset video / audio / master, version 1…n); versioned
master paths `film/v<N>/…`; `scenes.locked_at`, `projects.locked_at`.

## 4. Dependencies

Postgres (triggers), the storage layer (unique keys per generation), the
canon revision path.

## 5. Forbidden behavior

- Rewriting or deleting a version row (0029 makes them immutable).
- Writing a master over an earlier master's file.
- Any change to a locked scene's shots, lines, audio or content — from any
  role — while it is locked; locking an unfinished scene or film.
- Half-applying a canon edit that touches a locked scene.

## 6. Runtime behavior

Clip accepted → shot points at it → version recorded (idempotent for a retried
job; a concurrent writer gets the next number). Voice track made → version.
Render → next master number → files under `v<N>/` → version with hash and the
inputs used. Lock: the database checks readiness, records who, and from then
refuses changes until unlocked. Canon edit: affected scenes checked against
locks before anything is written.

## 7. Persistence

`media_versions` (append-only), lock columns on `scenes` and `projects`,
rejected revisions in `canon_revisions` with their issues.

## 8. Failure behavior

A version that cannot be recorded is logged and never fails the job (the
media is already stored). A write refused by a lock fails that write with the
database's message; the UI shows it.

## 9. Observability

Version rows per asset; lock columns with `locked_by`; rejected canon
revisions with `SCENE_LOCKED` / `FILM_LOCKED`; the Locks and versions panel.

## 10. Acceptance tests

- `packages/db/supabase/tests/0037_locks.test.sql` — readiness to lock,
  frozen children and content, status still moves, unlock, film lock covers
  scenes, cannot unlock a scene under a locked film, `locked_by`, cascade.
- `packages/db/supabase/tests/0038_lock_function_grants.test.sql` — lock check
  not callable over the API; triggers still enforce for a signed-in writer.
- `apps/worker/src/versions/record.test.ts` — append-only numbering, retry
  idempotence, concurrent writer, missing table tolerated.
- `apps/worker/src/canon/revision.db.test.ts` (real Postgres) — a locked scene
  refuses a canon edit and no shot changes.

## 11. Integration test

Not yet: lock a finished scene on production, attempt a regeneration and a
canon edit, both refused; re-render and see master v2 beside v1 (W10).

## 12. Production readiness

`PRODUCTION_READY` when the integration test passes on production and the
page can play and restore earlier versions.
