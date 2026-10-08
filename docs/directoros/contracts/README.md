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

Contracts to write before their workstream starts (from the gap analysis):
Shot Architect and Cinematography
Engine (W4) · Prompt Compiler and model compilers (W4) · Visual Reviewer and
quality gates (W5) · Editor Agent (W5) · ImageProvider and ComfyUI runtime (W6,
with docs/38 §AT) · Voice Engine (W7, with Part 4 §157–175) · Versioning, locks
and passes (W8).
