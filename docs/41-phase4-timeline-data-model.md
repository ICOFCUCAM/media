# Phase 4 as delivered — audio and timeline data model

Governing order: docs/38 §AX.2, Phase 4, built on the Phase 2 clock (docs/40).

**Status: the migrations are applied to the live Supabase project (2026-10-08, with 0027 and 0031–0034).** The operator steps below are kept for other environments. Until then the worker code that uses them degrades: it logs one line and production carries on.

## Schema

| Migration | Tables | What the database itself guarantees |
|---|---|---|
| `0028_production_timelines` | `production_timelines`, `timeline_events` | See below. |
| `0029_generations_and_media_versions` | `media_versions`, `video_generations`, `audio_generations`, `audio_events` | See below. |
| `0030_av_sync` | `sync_policies`, `av_sync_reports`, `av_sync_issues`, `repair_jobs` | See below. |

**0028: timelines and their events**
- One timeline version per row. Times are bigint µs and the frame rate is an exact rational.
- The SQL clock functions mirror the TypeScript clock (`clock_frame_start`, `clock_frame_at`, `clock_is_frame_aligned`).
- Picture events (scenes, shots, subtitles, transitions, titles) must start and end on frame boundaries.
- Events cannot end after the timeline does.
- Once a version is approved, its clock and its events are immutable. Its status can only move approved → superseded or frozen.
- Deleting a project still cascades.

**0029: generation ledgers and media versions**
- Media versions are immutable.
- Each video or audio generation records its request and identity once and never changes them. Results and Cineforge's outcome are written exactly once, and an outcome requires a code and a policy.
- Ledgers survive shot deletion.
- Audio placements must be sample-aligned (48 kHz) and can only be edited while their timeline is a draft.

**0030: sync policies, reports, issues and repair jobs**
- Policies are append-only. Calibrating one adds a new version.
- The seed equals the TypeScript defaults; a test checks this.
- Reports are append-only.
- Only an issue's status can change (open → repairing → resolved or waived), and waiving requires a reason.
- A repair job's planned action is immutable.

**Access, all three migrations.** Owners and admins can read; sync policies are readable by any signed-in user. Nothing is writable through the API. The worker writes through its own connection.

## Code

| Piece | Where |
|---|---|
| Prisma models (scalar foreign keys only) | `packages/db/prisma/schema.prisma` |
| CI check that the Prisma models match the migrations | `packages/db/scripts/check-prisma-vs-migrations.sh` |
| `buildTimelineDraft`: today's scenes, shots, dialogue and audio tracks become a draft on the clock (frames, samples, anchors, no clipping, overruns reported) | `packages/shared/src/timeline/` |
| Saving the next draft version; `timeline:build` operator command | `apps/worker/src/timeline/` |
| Video generation ledger: every GPU attempt with its report and outcome | `apps/worker/src/runtime/ledger.ts` |
| Render conform = the clock's plan (FFmpeg `round=near:eof_action=pass`), verified frame by frame against real FFmpeg at 24, 23.976, 25 and 29.97 fps | `apps/worker/src/ffmpeg/commands.ts`, `conform.media.test.ts` |

## Applying the migrations (operator)

Apply in order, each exactly as merged (the same procedure used for 0026):

1. `0027_character_lora_sha256` (Phase 1, still pending).
2. `0028_production_timelines`
3. `0029_generations_and_media_versions`
4. `0030_av_sync`

After applying:

| Check | Expected |
|---|---|
| Regenerate `packages/db/supabase/types.ts`. | The only changes are the new tables (and `characters.lora_sha256`). |
| Security advisors | No new findings. |
| `select count(*) from sync_policies` | 6 |
| Worker logs | `runtime.ledger` stops reporting "not migrated"; `video_generations` rows appear with outcomes. |
| `pnpm --filter @cineforge/worker timeline:build <projectId> --dry-run` | A draft prints; drop `--dry-run` to save it as version 1. |

**Production effect: none.** These tables are additive and nothing reads them to make a decision yet. Timing outcomes stay in record mode (docs/40).

## Not in this phase

- Approving timelines from the product UI.
- Placing generated media versions on a timeline automatically: Phase 5 (sync) and Phase 9 (repair).
- A web view of timing outcomes. It waits until the tables are live, because the web types may only describe tables the live schema has (`packages/db/supabase/drift.check.ts`).
