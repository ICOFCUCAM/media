# DirectorOS — Movie Intelligence specification (source record)

This folder records, **in full and without summarising**, the Movie Intelligence /
DirectorOS specification the product owner is dictating in parts. It is the source
of truth for a later gap analysis: what in it is **not built** in Cineforge, what
is **shallow**, and what is **poorly built**.

Rules for this folder:

- Each part is kept as dictated: every section, list, schema and diagram, in the
  original order and wording. Light formatting only: headings and code fences.
- Every requirement gets a stable ID `DOS-<section>.<n>` so the gap analysis can
  reference it line by line.
- Nothing here is a design decision yet. Where the dictation names a provider or
  API (e.g. OpenAI Responses, Structured Outputs), that is recorded as the author's
  recommendation. Provider choice is settled during the gap analysis against
  `docs/38` (provider-neutral rule) and the existing code.
- Parts arrive until the author says **"complete"**. Until then this record is
  open: append, never rewrite.

| Part | File | Received | Sections |
|---|---|---|---|
| 1 | [part-01-movie-intelligence-architecture.md](part-01-movie-intelligence-architecture.md) | 2026-10-08 | 0 (preamble) and 1–59 |
| 2 | [part-02-engineering-verification-contract.md](part-02-engineering-verification-contract.md) | 2026-10-08 | 60–107 |
| 3 | [part-03-voice-clone-talker.md](part-03-voice-clone-talker.md) | 2026-10-08 | 108–129 |
| 4 | [part-04-voice-engine-models-and-implementation.md](part-04-voice-engine-models-and-implementation.md) | 2026-10-08 | 130–176 |

Requirements index: [requirements-index.md](requirements-index.md), 454 IDs (Part 1: 140, Part 2: 138, Part 3: 52, Part 4: 124), with
status and workstream columns filled by the gap analysis.

**Gap analysis:** [gap-analysis.md](gap-analysis.md) — Parts 1–4 against the code at
merge `9c957bf` (2026-10-08): the as-built baseline, section-by-section status,
the silent-degradation register, workstreams W0–W11, the sequenced roadmap inside
the docs/38 §AX.2 order, and the decisions needed. Parts sent after this are
added to the index and analysed the same way.

**Execution:** [execution-protocol.md](execution-protocol.md) (the rules every
implementation follows, and the spec's phases mapped onto this repository) ·
[contracts/](contracts/README.md) (12-field implementation contracts, one per
subsystem, written before it is built).
