# Contract — Editor Agent: structured edits, editorial review, timing requests (W13)

Requirements: gap analysis §W13; Part 1 §21, §26–28, §46. Code:
`packages/movie/src/edit/operations.ts` (`EditOperation`, `applyEdits`,
`editIssues`, `describeEdit`), `packages/movie/src/edit/review.ts`
(`editorialDigest`, `EDITOR_SCHEMA`, `checkReview`, `reviewFilm`),
`packages/movie/src/intelligence/prompts.ts` (`editor.review` v1,
`director.edit` v2), `packages/movie/src/intelligence/roles.ts`,
`apps/worker/src/editor/editorial.ts`, `apps/worker/src/canon/conversation.ts`,
`apps/worker/src/ffmpeg/render-engine.ts` (`withCut`),
`apps/web/components/EditorPanel.tsx`, `apps/web/lib/editor.ts`, migration
`0048_editor.sql`.

## 1. Purpose

Review a finished cut as a whole and change it with structured, validated
edits, approved by the owner, costing only what they must.

## 2. Inputs

A planned film (Film IR); an optional plain request; the owner's approvals.

## 3. Outputs

Findings for the nine questions; dry-run proposals with their cost; on
apply, re-cut, removed, regenerated and re-voiced shots, a new plan version and
a new master version.

## 4. Dependencies

W2 router and decision log; W3 validators and world state; W8 versions,
snapshots and locks; W9 workspace and chat; the render engine.

## 5. Forbidden behavior

- Free-form edits: only the seven operations exist.
- Applying anything the owner did not approve.
- Applying a review made of an earlier cut.
- Editing a locked film or scene.
- An edit that breaks story, canon or film grammar, or cuts a line short.
- Regenerating a shot that only got shorter or moved.
- Offering a proposal that failed its dry run.

## 6. Runtime behavior

The poller runs pending reviews: claim, then `reviewFilm`, then store the
findings and proposals. It then runs requested applies: claim, then
`applyEditorialReview`. On applied, it resumes the film.

The owner decides through `decide_edit_proposal` and `request_editorial_apply`.
Both are security definer functions that check ownership.

## 7. Persistence

- `editorial_reviews`: pending → reviewing → ready → apply_requested → applying → applied | failed.
- `edit_proposals`: proposed → approved | rejected → applied | failed. The operation and its position never change.
- `shots.cut_sec`.
- `scene_versions` gains the reason `editorial`.
- `screenplays.raw` gains `editedFrom` / `editedBy`.
- `media_versions` holds the master versions.

## 8. Failure behavior

- No plan or no model: the review fails with the reason.
- Impossible proposals are dropped with their reasons.
- On a stale, locked or impossible apply, the review and its approved proposals fail with the reason, and no row changes.
- A crash during apply marks the review failed. The transaction leaves rows untouched.

## 9. Observability

- Decision log rows: task `editorial`, prompt `editor.review`, with the why.
- `editor.applied` / `editor.apply_failed` log events with their counts.
- The review's `dropped` list.

## 10. Acceptance tests

- `packages/movie/src/edit/operations.test.ts`: every operation, reviewed-cut numbering, story and line refusals, input untouched.
- `packages/movie/src/edit/review.test.ts`: the digest, the questions, the flat-to-typed conversion, dry runs, a timing request, the chat hand-off.
- `packages/movie/src/intelligence/roles.test.ts`.
- `apps/worker/src/editor/editorial.test.ts`: the row plan, the review runner, the render cut.
- `apps/worker/src/canon/conversation.test.ts`.
- `apps/worker/src/editor/editorial.db.test.ts`: a real database in CI. Four edits are applied; stale and locked applies are refused.
- `packages/db/supabase/tests/0048_editor.test.sql`.

## 11. Integration test

Not yet run against live providers: review a finished film, apply a trim, a
cut and an insert, and confirm the new master's length and that only the
insert generated.

## 12. Production readiness

FUNCTIONAL. It is built and tested against a real database, and migration 0048
is live. The prompts are unscored until `bench:live`, and the Editor has not
yet been exercised on a live film.
