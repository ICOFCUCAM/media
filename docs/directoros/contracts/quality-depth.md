# Contract — Quality depth: visual review v2, technical QC depth, sync after render, the editorial pass (W18)

Requirements: gap analysis §W18; Part 1 §16–17 and §39–40.

Code:
- `packages/movie/src/review/visual.ts` (`VisualScores`, `ReviewMedia`, `meanScore`)
- `packages/movie/src/intelligence/prompts.ts` (`review.visual` v2)
- `apps/worker/src/review/visual-gate.ts` (`grabFrames`, `visualGateResult`)
- `apps/worker/src/quality/measure.ts` (`grabFrames`, `REVIEW_POINTS`)
- `apps/worker/src/quality/gates.ts` (`frameChecks`, `editorialGate`, severity `info`)
- `apps/worker/src/ffmpeg/analysis.ts` (`parseFormat`, `probeFormat`)
- `apps/worker/src/avsync/run.ts` (`checkTimeline`, `syncAfterRender`)
- `apps/worker/src/processors/render.processor.ts`, `apps/worker/src/processors/video.processor.ts`
- `apps/worker/src/images/candidates.ts`

## 1. Purpose

Judge generated media more deeply before it is trusted:

- how a shot looks over its whole length, not at one instant;
- how clips and the master are encoded;
- whether the finished film is in sync;
- whether the Editor's notes are settled.

It is not responsible for executing repairs (Phase 9) or for rendering from an
approved timeline.

## 2. Inputs

- A verified clip and its shot's corrected generation context, planned camera
  type and movement.
- Measured media facts, including the ffprobe format facts.
- The project's finished scenes, shots and audio, for the timeline.
- The latest editorial review.

## 3. Outputs

- **Visual review:** a `VisualReviewResult` with verdicts (including emotion,
  hands, objects, camera) and `scores` (five 0–100 values or null).
- **Gate findings:** frame-rate, missing-frame, format and audio-format
  findings; `VISUAL_SCORES` (info); the editorial gate result.
- **Sync:** an `av_sync_reports` row with its issues and planned repairs, and a
  draft timeline version.

## 4. Dependencies

- ffmpeg and ffprobe.
- Storage downloads.
- The intelligence router (task `visual_review`).
- The A/V Sync Engine (`@cineforge/shared`) and the timeline store (0028–0030).
- `editorial_reviews` and `edit_proposals` (0048).

## 5. Forbidden behavior

- Letting a score, a defect verdict, a camera verdict, an emotion verdict, a
  format finding, a sync failure or the editorial pass block a shot or a film.
  Only defining canon mismatches (in enforce mode) and the existing technical
  failures block.
- Treating `cannot_tell` or a null score as a pass or a failure.
- A silent pass when the frames cannot be taken or the review cannot run: it is
  recorded as `VISUAL_REVIEW_UNAVAILABLE`.
- Changing media or approving a timeline from the sync check.
- Storing review frames.

## 6. Runtime behavior

- **Shot:** after the clip is verified, `inspectClip` measures it (including the
  format) and takes the start, middle and end frames. `judgeClip` adds the
  frame checks. The reviewer sees the frames with the canon, the shot prompt
  and the planned camera.
- **Master:** `judgeMaster` adds the frame checks, the video and audio format
  checks, and checks the sample rate against 48 kHz.
- **Film:** after `READY`, `syncAfterRender` builds and saves a draft timeline,
  measures every clip, runs `analyzeSync` and saves the analysis. The gate
  chain's editorial row comes from `editorialGate`.

## 7. Persistence

- `quality_gate_results`: findings, including `VISUAL_SCORES`, with scores in
  its detail.
- `production_degradations`: `QUALITY_FLAGGED`, including the sync result.
- `production_timelines`, `av_sync_reports`, `av_sync_issues`, `repair_jobs`
  (planned).
- `ai_decisions`: one row per review.

All are append-only, as before. No migration.

## 8. Failure behavior

- A frame that cannot be taken: the review is unavailable and recorded. The
  start or end frame alone is skipped if the middle one exists.
- A sync check that throws: logged and skipped. The film is still delivered.
- An editorial table that is missing: the pass is skipped.

## 9. Observability

- `visual.review` log lines, with scores.
- `quality.gate` log lines and rows.
- `[render] sync {…}` log lines.
- `QUALITY_FLAGGED` with detail `gate: "sync"`.

## 10. Acceptance tests

- `apps/worker/src/quality/qc.media.test.ts`: three distinct frames from a real clip.
- `apps/worker/src/review/frame.media.test.ts`: three 768 px JPEGs.
- `apps/worker/src/ffmpeg/analysis.media.test.ts`: real format probe.
- `apps/worker/src/avsync/run.test.ts`: timeline check and save after render.

## 11. Integration tests

- `apps/worker/src/review/visual-gate.test.ts`: three frames reviewed; defects
  warn; scores are info.
- `apps/worker/src/quality/gates.test.ts`: frame, format and editorial
  findings.
- `apps/worker/src/images/candidates.test.ts`: scores break ties.
- `packages/movie/src/review/visual.test.ts`: the request and advisory checks.

## 12. Production readiness

Requires:

- the visual review calibrated on real output (`benchmark_runs`, prompt
  `review.visual` v2 scored);
- the sync check's false-positive rate measured on real films;
- the repair engine executing planned repairs.

Until then: FUNCTIONAL, record mode.
