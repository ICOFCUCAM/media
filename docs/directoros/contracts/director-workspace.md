# Contract — Director workspace (W9)

Requirements: DOS-44, 45, 46 (partly), 119, 176. Code:
`apps/web/app/(app)/projects/[id]/director/page.tsx`,
`apps/web/components/DirectorWorkspace.tsx`, `apps/web/lib/workspace.ts`,
`packages/movie/src/intelligence/interpret.ts` (+ `director.edit` prompt,
`edit_interpret` task, `summarize` hook in `router.ts`),
`apps/worker/src/canon/conversation.ts`, `apps/worker/src/orchestration/project-poller.ts`,
`apps/web/components/VoiceLab.tsx` (Voice Studio), migration `0042_director_workspace.sql`.

## 1. Purpose

One place to see a production whole: its canon, its scenes and shots, its
timeline, and every AI decision with its reason. A place to direct it in
plain words, without bypassing canon, locks or passes.

## 2. Inputs

Film IR, scenes/shots, production timelines, `ai_decisions`, the owner's
instructions (`director_messages`), the Capability Registry.

## 3. Outputs

The workspace view; Director replies; edit requests filed from instructions;
a one-sentence summary per AI decision.

## 4. Dependencies

The intelligence router (W2), the edit command (W8b), the Capability Registry (W1).

## 5. Forbidden behavior

- The model changing canon directly, or more than one change per instruction.
- Filing a change that fails the edit command's schema, or one naming ids
  that are not in the film (the canon revision refuses unknown ids).
- Offering the chat when no planning model is configured.
- Showing provider or model names in the Voice Studio.

## 6. Runtime behavior

Owner message (pending) → poller claims it (→ answered) → no IR / no model →
explanatory reply; else interpret → `none` → reply; `change` → strict schema →
edit request + reply (linked). A failure to read → reply with the reason.

## 7. Persistence

`director_messages` (owner insert/read; worker replies; text and authorship
immutable; status moves once), `ai_decisions.summary`.

## 8. Failure behavior

Every path answers the owner; nothing silent. Decision summaries are
best-effort (null when the summarizer fails).

## 9. Observability

The conversation, the decision log with summaries, and edit requests linked
from replies.

## 10. Acceptance tests

- `packages/db/supabase/tests/0042_director_workspace.test.sql`
- `packages/movie/src/intelligence/interpret.test.ts`: routing, digest, pruning, why, safe summarizer
- `apps/worker/src/canon/conversation.test.ts`: file valid change, answer none, refuse malformed, explain no IR / no model / failure, skip claimed

## 11. Integration test

Not yet on production: one instruction on a live film becomes an applied
edit whose shots regenerate (W10).

## 12. Production readiness

`PRODUCTION_READY` after the integration test and when tone and timing
instructions are applied (Editor Agent).
