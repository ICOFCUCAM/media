# Execution protocol (DOS-79, DOS-80, DOS-82)

How DirectorOS is built in this repository. It binds every implementation
session, human or Claude.

## The rules

1. **No fake completion (DOS-74).** A feature is complete only when its real
   underlying operation has run and an independent acceptance test verifies the
   resulting artifact or state. Compiling code, an endpoint, a table, a button,
   a returned object, a job marked `completed`, a mock or placeholder that
   succeeds, or a connected interface do not count.
2. **No silent degradation (DOS-75).** An unavailable required capability
   reports `NOT_IMPLEMENTED`, `UNAVAILABLE` or `FAILED`. Weaker-but-honest
   results are recorded as degradations and shown (docs/44). Substitutes run
   only behind the reviewed, default-off switches in `scripts/check-truth.mjs`.
3. **Never self-certify (DOS-70).** Readiness comes from checks on the
   artifact (storage, probes, QC), not from the producer's own claim.
4. **Contract first (DOS-61/63).** No subsystem is built without its contract
   in [contracts/](contracts/README.md), all twelve fields filled.
5. **Reality Gate (DOS-73).** Maturity in `apps/web/lib/system.ts` moves one
   step at a time with evidence; `VALIDATED` requires named acceptance tests
   that exist (enforced in CI).
6. **No hidden TODOs (DOS-72).** Unfinished work is a `not built` row in
   [requirements-index.md](requirements-index.md), never a code comment
   (enforced in CI).
7. **Production stays in the owner's hands.** Deploy keys, gateway
   enforcement, migrations on the live database and model approvals wait for
   the owner (docs/38 §AY, docs/39 §10).

## Phases: the spec's order mapped onto this repository

Part 2 §80 gives eight phases. This repository already has a governing order
for the media engine (docs/38 §AX.2). They are combined like this; the
workstreams (W0–W12) and stages (S0–S12) are defined in
[gap-analysis.md](gap-analysis.md) §8–9.

| Spec phase (§80) | Here | Status |
|---|---|---|
| 0 Audit | The gap analysis (as-built baseline, 454 requirement IDs) | done 2026-10-08 |
| — (prerequisite) | W1 truth layer: failures vs degradations, capability registry, truth gate | done — this protocol's rules 1–6 are now enforced in code and CI |
| 1 Contract | W2: Film IR schemas, validators, provider router; contracts for W2–W4 | next |
| 2 Canon | W3: bibles, world state, character state, story graph, dependency graph | after W2 IR |
| 3 Story | W2/W3/W4: Director master call, Story Engine, Scene and Shot Architects | after canon schemas |
| 4 Media | W6 image layer (ComfyUI) and W7 Voice Engine, on docs/38 Phases 6–8 | ComfyUI gated on docs/38 Phase 1 complete |
| 5 QC | W5 + docs/38 Phases 9–10 (repair, Final Quality Gate) | after W4 |
| 6 Compiler | W2/W4/W8: Film IR → Shot IR → media jobs → timeline → master (docs/38 Phase 11) | after W5 |
| 7 Elastic GPU | docs/38 Phase 12 (DeployPro GPU orchestration) | DeployPro gates G1–G4 |
| 8 Acceptance | W10: real-provider tests and the 3-minute film (Part 2 §81) | needs a running production system (W0) |

Each phase ends with its contracts' acceptance tests passing in CI and its
requirement rows updated in the index.
