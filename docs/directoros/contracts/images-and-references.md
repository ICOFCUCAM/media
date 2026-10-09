# Contract — Image providers, seed candidates, reference pack, end-state memory (W6)

Requirements: DOS-15, 34, 35, 36, 95, 105, 106 (DOS-101–103 ComfyUI: gated).
Code: `apps/worker/src/images/` (providers.ts, candidates.ts, record.ts),
`apps/worker/src/canon/reference-pack.ts`, `apps/worker/src/orchestration/shot-nodes.ts`,
`apps/worker/src/processors/video.processor.ts`, `apps/worker/src/quality/measure.ts`.

## 1. Purpose

Generate every still through one provider registry, choose seed stills on
evidence instead of taking the first, give each shot exactly the references
it needs, and let a shot start where the previous one ended. Not responsible
for the self-hosted image runtime (ComfyUI), which is gated (§12).

## 2. Inputs

`IMAGE_PROVIDERS` (default `openai`; `none` disables), `SEED_CANDIDATES`
(1–4, default 1), `SEQUENTIAL_SHOTS` (`1` chains a scene's shots); the
shot's compiled still prompt (W4), canon context (W3), and the framed
characters' wardrobe stills and identity frames.

## 3. Outputs

A stored still per request; the chosen seed (`shots.seed_image_key`) with all
candidates in `media_versions`; the shot's ordered reference list; the
shot's last frame at `projects/<p>/frames/<shot>-end.jpg`.

## 4. Dependencies

The image provider (OpenAI image today), storage, the Visual Reviewer, ffmpeg.

## 5. Forbidden behavior

- A call site building its own image client (everything goes through the registry).
- Using a gated provider (ComfyUI) or silently skipping it: it is listed with
  the reason, in the registry and the Capability Registry.
- Dropping references silently: what does not fit the cap is listed.
- Video candidates by default (N× GPU cost) — candidates are stills.

## 6. Runtime behavior

Seed: the registry's first configured, non-gated provider draws
`SEED_CANDIDATES` stills; with more than one, each is reviewed against the
shot's canon and the best is chosen — passing first, then most matches net of
mismatches, then fewest unverified; without a vision route the first is kept.
References: seed → previous end frame → wardrobe stills → identity frames,
deduplicated, at most 4. End-state memory: after a shot passes its gates its
last frame is stored; the next shot in the scene (or the first shot of a
scene that continues the previous one) uses it when it exists — always with
`SEQUENTIAL_SHOTS=1`, opportunistically otherwise.

## 7. Persistence

`media_versions` (0029): one immutable row per seed candidate (`asset_type`
image, the shot as `asset_id`), derivation `{ role: seed_candidate, chosen,
review }`. End frames in storage (derivable, not versioned). A canon revision
clears generated seeds (all candidates of the shot).

## 8. Failure behavior

No provider → `SEED_IMAGE_UNAVAILABLE` (text-to-video) and
`WARDROBE_REFERENCE_UNAVAILABLE`, with the registry's reason. A failed review
of a candidate counts as unreviewed. End-frame capture failures are logged and
never fail the shot.

## 9. Observability

`media_versions` rows; `seed.candidates` / `shot.end_frame` log lines;
`system_capabilities.seed_image_generation` (provider, gated note).

## 10. Acceptance tests

`apps/worker/src/canon/reference-pack.test.ts` (pack order, cap, dropped;
registry: OpenAI when configured, reasons, ComfyUI gated, `none`),
`images/candidates.test.ts` (candidate count, selection order, media-version
rows, sequential flow edges), `quality/qc.media.test.ts` (real last frame).

## 11. Integration test

Pending (W10): a live film with `SEED_CANDIDATES=3` and `SEQUENTIAL_SHOTS=1`
showing three candidate rows per shot, one chosen, and end frames in the
references of following shots.

## 12. Production readiness

The ComfyUI runtime, Workflow Registry and approved image models (docs/38
Phases 6–8) — **gated by the owner's rule on Phase 1 being operationally
complete**; then OpenAI becomes optional rather than the default.
