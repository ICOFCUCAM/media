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

Requirements index: [requirements-index.md](requirements-index.md), 140 IDs for Part 1, with
status columns the gap analysis fills in. The gap analysis is not started; it runs
after "complete".
