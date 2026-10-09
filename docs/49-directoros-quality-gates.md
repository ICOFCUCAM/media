# 49 — Quality gates (DirectorOS W5)

**Status:** implemented in code (2026-10-09). Migration 0035
(`quality_gate_results`) is applied to the live database. Contract:
[quality-gates.md](directoros/contracts/quality-gates.md).

## 1. What changed

| Before | Now |
|---|---|
| A shot was READY once its file existed in storage | Every clip is **measured** first (picture, length, size, black, freeze, hash); an unreadable or empty clip never becomes READY |
| A bad shot stayed bad | A blocking result **regenerates the shot with a new seed** (bounded by the job's attempts), then fails it with the reason |
| The film was delivered once assembled | A **Final Quality Gate** measures the master before upload: picture, length, sound present, loudness (−16 LUFS ±2), true peak (≤ −1 dBTP), long black or frozen runs |
| Checks were scattered and invisible | Every judgement is a **gate result** — story, continuity (planning), technical + visual (each shot), technical + audio (master), editorial (pending the Editor Agent, W8) — stored per project |

## 2. Modes

| Variable | Default | Effect |
|---|---|---|
| `QUALITY_GATES` | `record` | `record`: defects (black, frozen, truncated, silent) are recorded and shown; only unusable media blocks. `enforce`: defects block → regenerate → fail. |
| `VISUAL_REVIEW` | `record` | as in docs/46: `enforce` makes a canon contradiction blocking (it now regenerates before failing) |

Both stay in `record` until the gates are calibrated on live films
(production stays in report mode).

## 3. Verify after deploying the worker

1. `select gate, outcome, count(*) from quality_gate_results group by 1, 2;`
   — rows for story, continuity, technical, visual, audio, editorial.
2. A shot's rows show `attempt`; a regenerated shot has attempt 2.
3. The project page lists any `QUALITY_FLAGGED` notes.

## 4. Limits (carried forward)

- Hands, objects and camera motion are not judged yet; motion is judged only
  as freezing.
- Codec, channel layout and dropped-frame checks on the master are not yet in
  the gate.
- The Editor Agent (and so the editorial gate) is W8.
