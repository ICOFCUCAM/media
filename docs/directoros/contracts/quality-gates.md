# Contract — Quality gates and the Final Quality Gate (W5)

Requirements: DOS-16.3, 17, 39, 40.1, 70.
Code: `apps/worker/src/quality/` (gates.ts, measure.ts, recorder.ts),
`apps/worker/src/processors/video.processor.ts` (shot gates),
`apps/worker/src/ffmpeg/render-engine.ts` + `processors/render.processor.ts`
(Final Quality Gate), `apps/worker/src/director/director.service.ts`
(`planGates`), migration 0035 `quality_gate_results`.

## 1. Purpose

Nothing is READY or delivered on the strength of a provider's or a
component's own claim (DOS-70). Every shot and the finished film are
measured and judged; every judgement is recorded as a gate in the chain
story → visual → continuity → audio → technical → editorial (§39).

## 2. Inputs

The stored clip (storage key) and what was requested (length, size); the
local master and the film's length and whether it has sound; the validated
plan.

## 3. Outputs

`GateResult { gate, outcome: pass|warn|fail|skipped, findings[] }`, each
finding `{ code, severity: fatal|fail|warn, message, detail }`; a shot
decision (accept, regenerate, fail).

## 4. Dependencies

ffmpeg / ffprobe (probe, blackdetect, freezedetect, ebur128), sha256, the
Visual Reviewer (visual-review.md), the validators (planning).

## 5. Forbidden behavior

- A shot becoming READY when its clip is unreadable, has no picture or no
  duration — in any mode.
- Retrying with the same seed (it reproduces the defect).
- Delivering a master that failed its gate.
- Rewriting a gate result (append-only; a regeneration adds attempt n+1).

## 6. Runtime behavior

Shot: after the storage check, the clip is downloaded once, measured, and
(Film IR shots) a mid-clip frame goes to the Visual Reviewer. Clip rules:
fatal — unreadable, no video, empty; fail — truncated below 60% of the
requested length, ≥95% black, ≥90% frozen; warn — short (<90%), >30% black,
>40% frozen, delivered below 90% of the requested size. `QUALITY_GATES=record`
(default): fail findings are recorded (`QUALITY_FLAGGED`), the shot is READY;
`enforce`: they block. A blocking result marks the shot `QC_FAIL`, gives it a
new deterministic seed and retries while the job has attempts left, then
fails it (`QUALITY_GATE_FAILED`). `qc_score` comes from the visual review.
Film: before upload the master is measured — fatal: unreadable, no video,
empty; fail: shorter than half the film, silent when the film has sound;
warn: length off by more than max(2 s, 10%), a black run over 2 s inside the
film, a frozen run over 3 s, loudness outside −16 ±2 LUFS, true peak above
−1 dBTP. A blocking result fails the render (not retried — the same film
fails the same way). Plan: story (pass, or warn when the plan needed its
revision) and continuity (warnings across every planned shot).

## 7. Persistence

`quality_gate_results` (0035, append-only): project, scope (shot / film),
ref (shot id, `film`, `plan`), gate, outcome, findings, attempt. Non-blocking
findings also appear as `production_degradations` on the project page.

## 8. Failure behavior

See §6. A gate that could not run (no vision route, no frame) is `skipped`
with the reason — never a pass.

## 9. Observability

`quality.gate` log line per result; gate rows; degradations; shot status
`QC_FAIL` while a regeneration is pending.

## 10. Acceptance tests

`apps/worker/src/quality/gates.test.ts` (every clip and master rule in both
modes, the regenerate/fail decision, the recorder), `quality/qc.media.test.ts`
(**real ffmpeg: seeded black, frozen, truncated and not-a-video clips are
caught; a good clip passes; loudness is measured; a silent master fails**),
`review/visual-gate.test.ts` (wrong wardrobe flagged / failed),
`director/director.test.ts` (plan gates).

## 11. Integration test

Pending (W10): a live film with a deliberately broken shot (black output)
regenerates under `enforce` and the gate rows show attempts 1 → 2.

## 12. Production readiness

Thresholds calibrated on live output (false-fail rate known), then
`QUALITY_GATES=enforce`; codec / channel / dropped-frame checks; the
editorial gate (Editor Agent, W8).
