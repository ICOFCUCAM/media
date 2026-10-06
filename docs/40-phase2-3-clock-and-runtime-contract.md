# Phases 2–3 as delivered — Master Production Clock and runtime contract

Governing order: docs/38 §AX.2. Phase 1 (GPU security) is implemented. It is
**not yet operationally complete**: production is still in report mode
(docs/39 §10). Phases 2 and 3 have no dependency on enforcement, so they are
built now. **Phase 6 (ComfyUI) still waits for Phase 1 to be complete.**

## Phase 2 — Master Production Clock (`@cineforge/shared` → `clock/`)

| Piece | What it guarantees |
|---|---|
| `FrameRate` (`rational.ts`) | Rates are exact rationals. `23.976` parses to `24000/1001`; floats never represent a rate. |
| `Us` positions (`time.ts`) | `bigint` microseconds. Frame *n* starts at `floor(n·1e6·den/num)`, and `usToFrame` is its exact inverse. Audio is sample-accurate at 48 kHz. Floats enter only through `secondsToUs` / `msToUs`, with explicit rounding. |
| Snap rules | Picture events and subtitles snap to frames; audio snaps to samples. |
| Timecode | SMPTE, non-drop, plus drop-frame at 29.97 and 59.94. Display only, never storage. |
| `planConform` | The one controlled conversion of a model-native clip into the production rate. It gives the exact frame count and duration, which source frame each output frame shows, and the FFmpeg filter that executes it. The `ConformRecord` is stored with the derived media version. |
| `MasterClock` | One production frame rate and one sample rate; the only conversion point. |

**Regression test 2** (`clock/conform.test.ts`), 16 fps into a 24 fps production:
- 96 frames become 144 frames, exactly 6 000 000 µs, mapped 0,0,1,2,2,3…
- An hour converted into 24, 23.976, 25 or 29.97 ends within one target frame of the source, with no drift.

## Phase 3 — runtime contract

| Piece | Where |
|---|---|
| Measured video timing report on every generation (ffprobe: frame count, exact rate, timebase). Never the request echoed back; `null` if the clip can't be measured. | `apps/gpu-worker/app/timing.py`, `/generate` → `timing` |
| Published workload caps (`limits`) | `/capabilities` |
| Report contract: parses into clock units; `TIMING_REPORT_MISSING` vs `TIMING_REPORT_INVALID`. A report whose duration doesn't match its frame count is invalid. | `shared/runtime/timing.ts` |
| Tolerance profiles: cinematic, documentary, social, broadcast, education, corporate. Starting defaults, `calibrated: false`. | `shared/sync/policy.ts` |
| **Cineforge classifies:** ACCEPTED / REQUIRES_REPAIR (trim handles, retime, short hold) / REQUIRES_REGENERATION / FAILED | `shared/runtime/outcome.ts` |
| `WorkflowRuntime` (the six operations) and `DiffusersRuntime` over the existing adapters. It rejects payload tampering, missing timing, over-length shots and requests a worker cap would re-time. | `model-adapters/src/runtime/` |
| Timing gate after every GPU shot: `RUNTIME_TIMING_POLICY=record` (default) or `enforce` | `apps/worker/src/runtime/timing-gate.ts` |

**Regression test 7:**
- **Setup:** 6.840 s requested, 5.800 s produced.
- **GPU side:** a real 5.8 s file is measured exactly.
- **Cineforge side:** requested, actual, delta and ratio are recorded. The result is REQUIRES_REGENERATION, and it is never ACCEPTED under any profile, attempt, trim handle or conform permission.
- **Echoed report:** the same result with the request echoed back as the measurement is FAILED.

The gateway e2e (real worker, enforce mode) also classifies the real worker's measured clip as ACCEPTED.

## What the timing reports will show first

On the current pod, `WAN_MAX_FRAMES=25` turns every 5 s Wan request into a 1.5625 s clip, while the response still says `durationSec: 5`. In record mode every such shot logs `runtime.timing_outcome` with `REQUIRES_REGENERATION`.

### Rollout (operator)

| Step | Action | Effect |
|---|---|---|
| 1 | Deploy the worker with the default `RUNTIME_TIMING_POLICY=record`. | Logs only. |
| 2 | Deploy a verified GPU image (docs/39 §10.1) that reports `timing`. Older images report nothing, which is logged as `TIMING_REPORT_MISSING`. | Measured reports. |
| 3 | Read the `runtime.timing_outcome` logs. Make requested and produced durations agree, either by raising `WAN_MAX_FRAMES` (GPU time per shot rises) or by having the planner request shots the model can produce. That is a product decision; the runtime never decides it. | Mismatches go away. |
| 4 | `RUNTIME_TIMING_POLICY=enforce` | Regeneration and failure act on the outcome. |

**Note for step 4.** In enforce mode a regenerated attempt is not yet metered: the exception comes before the usage record, as for any failed shot today. Metering of failed attempts belongs with the repair engine (Phase 9).

## Not in these phases

- Persisting outcomes and reports (`video_generations.timing_report`, `workflow_runs`) is Phase 4.
- Repair execution is Phase 9.
- ComfyUI is Phase 6.
- Audio timing reports are produced by the audio engine in Phase 4/5. The contract and parser exist now.
