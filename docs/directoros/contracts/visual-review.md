# Contract — Visual Reviewer and visual quality gate (W5, first slice)

Requirements: DOS-62 at the pixel level; DOS-32.1–32.2 (character
continuity in the generated picture); the W5 quality gate.
Code: `packages/movie/src/review/visual.ts`, `packages/movie/src/intelligence/`
(images in requests, task `visual_review`), `apps/worker/src/review/visual-gate.ts`,
`apps/worker/src/processors/video.processor.ts`.

## 1. Purpose

Check that a generated shot SHOWS what canon says it must show — the right
people, faces, wardrobe, injuries, place and time — before it is accepted.
Not responsible for motion quality, audio, or the Final Quality Gate on the
assembled film (rest of W5).

## 2. Inputs

The verified clip (storage key) and the Continuity Engine's
`correctedGenerationContext` for the shot (Film IR projects only).

## 3. Outputs

`VisualReviewResult`: per canon item a verdict `match | mismatch | cannot_tell`
with what is visible; `passed` (false iff a defining check — presence,
identity, wardrobe, injuries, location — clearly mismatches); `unverified`
count. The gate turns it into a `qc_score` (share of verified items that
match), a degradation, or a failure.

## 4. Dependencies

ffmpeg (one mid-clip frame, 768 px wide), storage download, the intelligence
router (task `visual_review`, any vision-capable route; recorded in
`ai_decisions`).

## 5. Forbidden behavior

- A silent pass: a review that could not run (no route, no frame, provider
  error) is recorded as `VISUAL_REVIEW_UNAVAILABLE`.
- Treating `cannot_tell` as a match or as a failure.
- Judging style or framing (not continuity).
- Blocking production on an uncalibrated reviewer by default.

## 6. Runtime behavior

After the clip is verified in storage: `VISUAL_REVIEW=off` → skip;
otherwise grab a frame, review it. `record` (default): a contradiction is a
`VISUAL_REVIEW_FLAGGED` major degradation with the findings, the shot becomes
READY with its `qc_score`. `enforce`: a contradiction marks the shot
`QC_FAIL` and fails it (`VISUAL_REVIEW_FAILED`). The Capability Registry
reports `visual_qc` from the configured route and mode.

## 7. Persistence

`shots.qc_score`; `production_degradations` rows; one `ai_decisions` row per
review (task `visual_review`, prompt `review.visual`, image hashes in the
input hash). Frames are not stored.

## 8. Failure behavior

Only in `enforce` mode, only on a clear defining mismatch. Everything else is
recorded and the shot proceeds.

## 9. Observability

`visual.review` log line per shot (passed, unverified, qcScore, provider,
model); degradations on the project page; `system_capabilities.visual_qc`.

## 10. Acceptance tests

`packages/movie/src/review/visual.test.ts` (the request names exactly the
canon; only defining mismatches fail; frames go through the router as images
and are logged), `intelligence.test.ts` (OpenAI image parts),
`apps/worker/src/review/visual-gate.test.ts` (record vs enforce vs off,
unavailable is recorded, qc_score), `review/frame.media.test.ts` (a real
mid-clip JPEG from a real clip with ffmpeg), `shared/truth.test.ts`
(capability reporting).

## 11. Integration test

Pending (W10): on live films, compare the reviewer's flags with a human pass
over the same shots; that comparison is the calibration that allows
`enforce`.

## 12. Production readiness

Calibrated on real output (false-flag rate known and acceptable), then
`VISUAL_REVIEW=enforce`; regeneration with a varied seed on failure instead
of failing outright.
