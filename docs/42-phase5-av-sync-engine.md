# Phase 5 as delivered — A/V Synchronization Engine

Governing order: docs/38 §AX.2, Phase 5. It builds on the clock (Phase 2), the runtime timing reports (Phase 3) and the timeline data model (Phase 4).

**The engine is analysis only.** It never edits media, never moves a timeline event and never decides on its own that a film is finished. Its output feeds the repair engine (Phase 9) and the Final Quality Gate (Phase 10).

## Components (`packages/shared/src/sync/`)

| docs/38 §AU.7 component | Module | What it checks |
|---|---|---|
| MasterClock | `clock/` (Phase 2) | The timebase every check uses. |
| TimelineAnalyzer | `timeline-analyzer.ts` | Frame alignment of picture events; events inside the timeline and their parent; back-to-back cuts; anchored events where their anchor says (a re-timed shot's dependents are flagged, never kept at the old time). |
| AudioVideoDurationValidator | `duration-validator.ts` | Missing media; clip vs shot duration, with a safe repair; dialogue placement; leading/trailing silence; speech running past the picture. Speech is never cut: the repair is a short hold or regenerating the tail with the dialogue timing. |
| DialogueAligner | `dialogue-aligner.ts` | Scene, shot, temporal and character levels of §AU.8 against the visible speaking segment. Dialogue is authoritative, so the repair regenerates picture. |
| LipSyncValidator | `lip-sync.ts` | §AU.9 steps 1–7: activity correlation on a 10 ms grid, offset in an asymmetric lead/lag window, speech without mouth movement, speaking without dialogue. Weak evidence goes to a person. |
| SubtitleSynchronizer | `subtitle-sync.ts` | Cues derived from the spoken words, snapped to frames; drift detection; SRT/VTT output. |
| FrameRateValidator | `rate-and-drift.ts` | Flags media that would be re-timed implicitly. |
| DriftDetector | `rate-and-drift.ts` | Fits a least-squares line to the measured A/V offsets and flags the change it predicts across the span. A 0.1 % rate error shows as 60 ms/min. |
| MusicCueValidator / SFXCueValidator | `cue-validators.ts` | Music enters and leaves on structure (scene boundary, cut or anchor); every effect is anchored. |
| LoudnessValidator | `loudness.ts` | Program loudness and true peak against the delivery profile; dialogue level consistency; parsers for FFmpeg's analysis output. |
| (picture integrity) | `picture-validator.ts` | Black and frozen stretches (dropped or duplicated frames, or an unreported hold). |
| (provenance) | `engine.ts` | Every placed media version has a checksum and a generation record. |
| RepairPlanner | `repair-planner.ts` | Builds the repair plan; see below. |
| AVSyncEngine | `engine.ts` | `analyzeSync`: one report plus one plan; passes only with no error or blocker. |

### RepairPlanner rules
- Blockers are planned first.
- Warnings are planned only when the repair is cheap; they never trigger a regeneration.
- There is one merged action per shot.
- Anything below confidence 0.6, and any shot past its retry budget, goes to human review.
- A regeneration requires a fresh gateway authorization and never substitutes a model or workflow (§AX.5).

## Worker (`apps/worker/src/avsync/`, `src/ffmpeg/analysis.ts`)
- **Measurements.** ffprobe counts frames, then `ebur128` (with true peak), `silencedetect`, `blackdetect`, `freezedetect`, and a sha256 of the file. FFmpeg measures; the engine decides (§AW.7).
- **Media facts** are built from those measurements only, never from the request.
- **Persistence.** Reports, issues and *planned* repair jobs are saved to migration 0030's tables. If the tables are missing, the save reports it instead of failing.
- **Operator command.** `pnpm --filter @cineforge/worker avsync:check <timelineVersionId> [--dry-run] [--subtitles]`

## Regression tests (§AW.11)

| # | Where |
|---|---|
| 1 | `sync/regression-suite.test.ts`, `duration-validator.test.ts`; real media: `apps/worker/src/ffmpeg/render-engine.media.test.ts` |
| 2 | `regression-suite.test.ts`, `clock/conform.test.ts`; real FFmpeg, frame by frame: `conform.media.test.ts` |
| 3 | `regression-suite.test.ts`, `subtitle-sync.test.ts` |
| 4 | `regression-suite.test.ts`, `dialogue-aligner.test.ts` |
| 5, 6 | Gateway: `apps/gpu-worker/tests`, `packages/model-adapters/e2e/gateway.e2e.test.ts` |
| 7 | `regression-suite.test.ts`, `runtime/regression-7.test.ts`; GPU side, real file: `apps/gpu-worker/tests/test_timing.py` |

## Limits

- **All tolerances are starting defaults.** They are marked `calibrated: false` until the benchmark (§AU.9) runs.
- **Mouth activity and speaking segments must come from vision analysis.** MediaPipe and SyncNet are named in §AU.10, but their licenses are not verified yet and they are not integrated. Without that analysis, lip sync is not judged, and the DialogueAligner uses the shot as the speaking segment at lower confidence.
- **Nothing runs the engine automatically yet.** It is run by the operator command. The `avsync` queue (§AW.12) and the gate that depends on it are part of the Phase 9 and 10 work.
- **The tables must exist first.** The engine needs migrations 0028–0030, which are not applied live (docs/41).
