# Implementation contracts (DOS-61, DOS-63)

Every DirectorOS subsystem gets one contract file here **before** it is built.
A contract is the executable job description the code is held to; the
architecture documents say what a subsystem is, the contract says what it must
do, must never do, and what proves it.

A subsystem's maturity (Reality Gate, DOS-73; `apps/web/lib/system.ts`) may be
raised to `VALIDATED` only when every acceptance and integration test named in
its contract exists and passes; CI enforces that a `VALIDATED` claim names
evidence files that exist (`scripts/check-truth.mjs`).

## The twelve fields (all required)

| # | Field | What it pins down |
|---|---|---|
| 1 | Purpose | what the component is responsible for, and what it is not |
| 2 | Inputs | exactly what it receives (types, ids, versions) |
| 3 | Outputs | exactly what it must produce |
| 4 | Dependencies | what it may call — and nothing else |
| 5 | Forbidden behavior | what it must NOT do (stubs, silent substitution, self-certification…) |
| 6 | Runtime behavior | what actually happens when it runs, step by step |
| 7 | Persistence | what gets stored, where, and whether it is append-only |
| 8 | Failure behavior | which gaps FAIL the job and which are recorded degradations (DOS-75) |
| 9 | Observability | events, metrics and rows that show it ran |
| 10 | Acceptance tests | tests that prove the feature is real (real artifact / real state) |
| 11 | Integration test | a test proving it works with the components around it |
| 12 | Production readiness | the exact conditions for `PRODUCTION_READY` |

## Contracts

| Contract | Subsystem | Workstream | Maturity |
|---|---|---|---|
| [truth-layer.md](truth-layer.md) | Truth layer: failures, degradations, capability registry, truth gate | W1 | FUNCTIONAL |
| [film-ir.md](film-ir.md) | Film IR, validator chain, Production Compiler | W2 | INTEGRATED |
| [intelligence-layer.md](intelligence-layer.md) | Provider-neutral intelligence layer, router, prompt registry, decision log | W2 | INTEGRATED |
| [world-state.md](world-state.md) | Canon, World State Engine, story knowledge and foreshadowing, canon revisions | W3 | INTEGRATED |
| [continuity-engine.md](continuity-engine.md) | Character Continuity Engine (Part 2 §62) | W3 | INTEGRATED |
| [cinematography-and-prompts.md](cinematography-and-prompts.md) | Cinematography Engine, canonical media request, model prompt compilers | W4 | INTEGRATED |
| [quality-gates.md](quality-gates.md) | Technical QC, regenerate loop, Final Quality Gate, gate chain | W5 | INTEGRATED |
| [images-and-references.md](images-and-references.md) | Image providers, seed candidates, reference pack, end-state memory (ComfyUI gated) | W6 | INTEGRATED |
| [voice-engine.md](voice-engine.md) | Voice Engine: interface, consent, recording quality, router, jobs, mastering, /v1 API (self-hosted models gated) | W7 | INTEGRATED |
| [versions-and-locks.md](versions-and-locks.md) | Append-only clip / voice / master versions; DB-enforced scene and film locks | W8 | INTEGRATED |
| [passes-and-edits.md](passes-and-edits.md) | STORY → PREVIS → FINAL passes (DB-enforced), edit command, dependency edges, plan history | W8 | INTEGRATED |
| [director-workspace.md](director-workspace.md) | Director workspace: bible · scenes & shots · chat, timeline strip, decision log with why, plain-language edits | W9 | INTEGRATED |
| [evaluation-and-acceptance.md](evaluation-and-acceptance.md) | Real-provider probes, benchmark (corpus, cases, prompt lock, live planning score), sync instrument calibration, the sixteen-check film acceptance | W10 | FUNCTIONAL |
| [platform.md](platform.md) | Production types (incl. animation), public API auth and routes, metering, atomic grants, probes and metrics | W11 | FUNCTIONAL |
| [animation.md](animation.md) | Animation Studio: Character Cards and cast, Show Bible and episodes, animated design, still-motion engine | W12 | FUNCTIONAL |
| [editor.md](editor.md) | Editor Agent: structured edit operations, editorial review, timing requests, owner-approved apply, directorial roles | W13 | FUNCTIONAL |
| [visual-review.md](visual-review.md) | Visual Reviewer and visual quality gate (record mode) | W5 (first slice) | INTEGRATED |

Contracts to write before their workstream starts (from the gap analysis):
ComfyUI runtime (W6, with docs/38 §AT — gated on
Phase 1).
