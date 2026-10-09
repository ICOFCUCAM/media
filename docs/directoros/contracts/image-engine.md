# Contract — The Image Engine: ledger, providers, place and prop references, takes (W17)

Requirements: gap analysis §W17; Part 1 §15 and §34–35; Part 2 §69, §95 and §106.

Code:
- `apps/worker/src/images/providers.ts` (`ImageProvider`, `GeneratedImage`, `candidateSeed`)
- `apps/worker/src/images/ledger.ts`
- `apps/worker/src/canon/world-refs.ts`
- `apps/worker/src/canon/reference-pack.ts`
- `packages/movie/src/world/places.ts`
- `apps/worker/src/processors/video.processor.ts` (`referenceImageGenerator`, `resolveSeedKey`)
- `apps/worker/src/billing/meter.ts` (`meteredImages`)
- `apps/worker/src/acceptance/probes.ts` (`image:fal`)
- `apps/web/components/DirectorPasses.tsx`, `apps/web/lib/production.ts`
- migrations `0052_image_engine.sql` and `0053_image_engine_search_path.sql`

## 1. Purpose

Every still CineForge makes is real, recorded and reproducible where the
provider allows it. Places and props look the same from shot to shot. The
owner can choose a different take before a shot is filmed.

## 2. Inputs

- A prompt compiled from canon.
- A size.
- A seed, for a seeded provider.
- The purpose and subject of the still.
- The canon digest it depicts.

## 3. Outputs

- The stored image.
- An `image_generations` row: provider, model, seed, prompt sha256, object
  sha256, size, canon digest, candidate and chosen.
- `world_references` rows.
- A reference pack that includes place and prop stills.

## 4. Dependencies

- W6: the provider registry, the reference pack, seed candidates and the
  Visual Reviewer.
- W3: canon digests and the Continuity Engine's required references.
- W11: metering.
- W10: provider probes.

## 5. Forbidden behavior

- Storing or recording a still the provider did not return, or one that is
  empty.
- Claiming a seed for a provider that takes none.
- Changing an image record other than which candidate is chosen.
- Drawing a place or prop again when its canon has not changed.
- Choosing a take for another owner's shot, or for a shot that already has its video.
- Labelling one provider's image with another's model.
- Using ComfyUI before Phase 1.

## 6. Runtime behavior

- **Seed stills:** `resolveSeedKey` draws N candidates with stable seeds, has
  the Visual Reviewer rank them, records every candidate and stores the chosen
  one on the shot.
- **Reference stills:** `resolveContinuity` resolves the wardrobe, location and
  prop references. Each is found by its digest, or drawn and recorded.
- **Pack order:** seed, previous end frame, wardrobe, identity, location, props.
- **Choosing a take:** the owner calls `choose_seed_candidate`.

## 7. Persistence

- **`image_generations`:** append-only except the `chosen` flag; RLS gives the owner read access.
- **`world_references`:** append-only; unique on project, kind, ref_key and
  digest; RLS gives the owner read access.
- **`shots.seed_image_key`:** points at the still in use.

## 8. Status

FUNCTIONAL. Self-hosted image models are gated. Style and camera reference
images are open. Per-dimension frame scores came in W18 (quality-depth.md)
and break ties between candidates.
