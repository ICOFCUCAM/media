# Contract — Passes, edit command, dependency edges, plan history (W8b)

Requirements: DOS-29, 30, 31.2, 41–43. Code:
`apps/worker/src/orchestration/passes.ts`, `pass-rules.ts`,
`apps/worker/src/orchestration/film-flow.ts` (pass-aware),
`apps/worker/src/processors/film.processor.ts` (stop at STORY),
`apps/worker/src/processors/video.processor.ts` (job `previs`),
`apps/worker/src/canon/edits.ts`, `apps/worker/src/orchestration/project-poller.ts`,
`apps/worker/src/versions/plan.ts`, `packages/movie/src/world/dependencies.ts`,
migrations `0039_edit_requests.sql`, `0040_passes.sql`,
`0041_dependencies_and_scene_versions.sql`; web `apps/web/lib/production.ts`,
`DirectorPasses.tsx`, `EditRequests.tsx`, `ProductionLocks.tsx` (takes).

## 1. Purpose

Spend GPU time only on what the owner approved; change a planned film by
changing its canon, regenerating only what depends on the change; never lose
an earlier state of the plan.

## 2. Inputs

`projects.pass_mode`; approvals (`projects.story_approved_at`,
`scenes.storyboard_approved_at`); edit requests (`edit_requests.change`: one of
six canon change kinds); the Film IR.

## 3. Outputs

Project status REVIEW at STORY; storyboard stills (`shots.seed_image_key`) at
PREVIS; scene flows for approved scenes; the master when all are ready;
edit request outcomes; `shot_dependencies`; `scene_versions`.

## 4. Dependencies

Postgres triggers (0040), the canon revision path (W3), BullMQ, the image
provider (previs), the existing scene and render pipelines.

## 5. Forbidden behavior

- Video for an unapproved scene in a three-pass production (refused by the database).
- Approving a storyboard before the story; withdrawing one mid-generation;
  changing the pass mode after planning.
- Applying an edit that is malformed, breaks canon or touches a locked scene;
  half-applying one; regenerating shots it does not touch.
- Rewriting or deleting a scene version.

## 6. Runtime behavior

Plan → (three-pass) REVIEW. Story approved → poller claims previs once →
`previs` jobs draw stills. Storyboard approved → poller claims the scene
(PENDING → GENERATING) → scene flow. All scenes approved and all shots ready →
poller claims the render (GENERATING → RENDERING). Edit request → claim
(pending → applying) → zod shape check → canon revision (snapshots the
affected scenes, writes new dependency edges) → resume flow (pass-aware) →
applied / rejected / failed.

## 7. Persistence

0039 `edit_requests` (owner insert/read; worker transitions; finished final),
0040 pass columns and guards, 0041 `shot_dependencies` (current edges) and
`scene_versions` (append-only).

## 8. Failure behavior

Edit requests fail with the reason (invalid change, film planned before the
Film IR, canon error); refusals carry the canon/lock issues. Previs without an
image provider records `SEED_IMAGE_UNAVAILABLE`. History and edge writes are
logged on error and never fail the plan or the edit.

## 9. Observability

Edit request rows; `canon_revisions`; scene versions; dependency rows; the
Passes, Change the film, and Locks and versions panels.

## 10. Acceptance tests

- `packages/db/supabase/tests/0039_edit_requests.test.sql`,
  `0040_passes.test.sql`, `0041_dependencies_and_scene_versions.test.sql`.
- `apps/worker/src/canon/edits.test.ts`, `orchestration/passes.test.ts`.
- `packages/movie/src/world/dependencies.test.ts` — edges cover every shot a
  canon revision regenerates.
- `apps/worker/src/canon/revision.db.test.ts` (real Postgres) — snapshots and
  edges on a canon edit; edges for every planned shot; an edit request
  applied end to end.

## 11. Integration test

Not yet on production: a three-pass film from STORY to master, and one
applied edit regenerating only its shots (W10).

## 12. Production readiness

`PRODUCTION_READY` after the integration test passes on production and three
passes become the default (owner decision).
