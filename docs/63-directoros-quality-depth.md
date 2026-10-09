# 63 — Quality depth: a deeper visual review, technical QC, sync after every render, the editorial pass (DirectorOS W18)

**Status:** implemented in code (2026-10-09). No migration.
Contract: [quality-depth.md](directoros/contracts/quality-depth.md).
Requirements: Part 1 §16–17 and §39–40.
It builds on W5 (the quality gates and the first Visual Reviewer), W13 (the
Editor) and the A/V Sync Engine (Phase 5).

## 1. The Visual Reviewer, version 2 (§16–17)

The reviewer used to look at one frame from the middle of a clip. It now looks
at three frames, in order:

- one near the start (8 %);
- the middle;
- one near the end (92 %).

A clip shorter than a second gets only the middle frame. A seed-candidate still
is reviewed as one frame.

The prompt (`review.visual` v2) asks for more than before:

| Check | What it asks | Can block the shot? |
|---|---|---|
| presence, identity, wardrobe, injuries, location | canon, as before; a face that changes between frames is an identity mismatch | yes (enforce mode) |
| time, props | canon, as before | no |
| emotion | does a readable face plausibly show what canon says the character feels? | no |
| hands | wrong finger counts, fused or melted fingers | no |
| objects | malformed, floating or merging objects, objects that change between frames | no |
| camera | does the view change across the frames the way the shot's planned camera type and movement say? | no |

It also scores the shot from 0 to 100 on five dimensions. A dimension it
cannot judge is null (for example, identity with nobody in frame).

- identity
- composition
- continuity
- lighting
- prompt adherence

Where the scores go:

- **The visual gate row:** they are recorded as a `VISUAL_SCORES` finding with
  severity `info`. An info finding is on record but is not a defect, so it
  never turns a pass into a warning.
- **Seed candidates:** they break ties. When two candidates agree with canon
  equally, the one with the higher mean score wins.
- **`shots.qc_score`:** unchanged. It is still the share of verified checks
  that match.

The reviewer stays in record mode by default (`VISUAL_REVIEW`). Only a clear
mismatch on a defining canon check can fail a shot, and only in enforce mode.

## 2. Technical QC depth (§40.1)

Every clip and every master is now also probed for how it is encoded:

- codecs;
- pixel format;
- average and nominal frame rate;
- audio channels and sample rate;
- the container's duration, compared with the duration of the frames actually
  counted.

New findings, all warnings:

| Code | On | When |
|---|---|---|
| `CLIP_` / `MASTER_VARIABLE_FRAME_RATE` | clip, master | average and nominal frame rate differ by more than 1 % |
| `CLIP_` / `MASTER_FRAMES_MISSING` | clip, master | the frames cover less than the container claims (by more than 0.2 s and 3 %) |
| `CLIP_` / `MASTER_LOW_FRAME_RATE` | clip, master | under 10 fps |
| `MASTER_VIDEO_CODEC` | master | not H.264 |
| `MASTER_PIXEL_FORMAT` | master | not yuv420p |
| `AUDIO_CODEC` | master | not AAC |
| `AUDIO_SAMPLE_RATE` | master | not the 48 kHz delivery rate |
| `AUDIO_CHANNELS` | master | not mono or stereo |

They go on record with the other gate findings and show on the project as
`QUALITY_FLAGGED`. They never block a shot or a film. A file that cannot be
read still fails, as before.

## 3. A/V sync after every render (§39–40)

The sync engine used to run only from the `avsync:check` command. Now, after
every final render that has clips:

1. A production timeline is built from the finished scenes and saved as a
   draft version, at 24 fps.
2. Each shot's clip is downloaded and measured.
3. The sync engine checks the timeline against the render profile's policy.
4. The report, its issues and the planned repairs are saved.
5. A failed check is recorded on the film as `QUALITY_FLAGGED`, with the
   timeline and the number of issues and errors.

It never blocks delivery. `RENDER_SYNC_CHECK=0` switches it off. The
`avsync:check` command uses the same code.

## 4. The editorial pass (§39.1)

The film's gate chain used to record the editorial pass as always skipped. It
now reads the latest finished editorial review (W13):

| Latest review | Editorial pass |
|---|---|
| none, or none that finished | skipped |
| applied | pass |
| ready, with nothing open | pass |
| ready, with undecided proposals or notes | warn (`EDITORIAL_PROPOSALS_OPEN`, `EDITORIAL_NOTES`) |

Editorial review is advisory and the owner asks for it, so it never blocks.

## 5. What is still open

- **Rendering from an approved timeline (§40.3).** The timeline is built from
  what was rendered and then checked; the render does not yet follow an
  approved timeline.
- **Executing sync repairs.** They are planned and saved; the repair engine
  that carries them out is Phase 9.
- **Calibrating the reviewer** on real output before `VISUAL_REVIEW=enforce` is
  recommended.
- **Character position** is judged only as presence in frame.

## 6. Owner steps

- Deploy the worker.
- Optional settings:
  - `RENDER_SYNC_CHECK=0` switches off the sync check after renders;
  - `VISUAL_REVIEW=off | record | enforce` (default `record`), unchanged.
