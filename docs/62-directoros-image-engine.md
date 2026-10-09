# 62 — The Image Engine: every still on record, a second provider, places and props, choosing takes (DirectorOS W17)

**Status:** implemented in code (2026-10-09). Migrations 0052 and 0053 are
**applied live**.
Contract: [image-engine.md](directoros/contracts/image-engine.md).
Requirements: Part 1 §15 and §34–35; Part 2 §69, §95 and §106.
It builds on W6 (docs/50): the provider registry, seed candidates and wardrobe
references.

## 1. Every still on record (§69)

Each image provider now returns what it made:

- the stored key;
- the provider and model;
- the seed it drew with (null when the provider takes none);
- the sha256 of the stored bytes;
- the prompt's sha256;
- the size.

Every still CineForge generates (seed frame, seed candidate, or a wardrobe,
location or prop reference) is one row in `image_generations` (migration
0052), together with the canon digest it depicts and, for candidates, its
index and whether it is the one in use.

The table is append-only: only which candidate is chosen may change. A still
that was generated is never thrown away because its record could not be
written; the failure is logged.

A provider answer with no image, or an empty image, fails. Nothing is stored
or recorded as a still. The real-provider probes (`image:openai`, `image:fal`)
generate, store and decode a real image and report its checksum.

## 2. A second provider (§95, §106)

`IMAGE_PROVIDERS` is an ordered list, default `openai`. The first configured
provider that is not gated is used:

| Provider | Model | Seeds | Configured by |
|---|---|---|---|
| `openai` | `OPENAI_IMAGE_MODEL` (default gpt-image-1) | no | `OPENAI_API_KEY` + storage |
| `fal` | `FAL_IMAGE_MODEL` (default Flux dev) | **yes**: the same seed redraws the same still | `FAL_KEY` + storage |
| `comfyui` | — | — | gated on Phase 1 |

Metering now names each provider's own model; it used to say OpenAI for every
image. The `seed_image_generation` capability reports whichever provider will
actually be used.

## 3. Seed candidates and choosing a take (§15)

With `SEED_CANDIDATES` set to 2–4, a shot draws that many stills and the
Visual Reviewer ranks them against canon (W6).

Each candidate now has a stable seed derived from the shot. With a seeded
provider (fal), the same shot draws the same candidates again.

In a three-pass production's storyboard pass, the owner sees the other takes
under each scene and can use a different one before approving. The choice
goes through `choose_seed_candidate`, which the database runs only for the
owner, and only for a shot that has no video yet.

## 4. Location and prop references (§34–35)

The Continuity Engine names, for every shot, the place it happens in and the
props in frame.

- **The still:** each is drawn once as canon describes it, with the film's
  look:
  - a place: wide, empty of people, in its own light;
  - a prop: alone, on a plain background.
- **Keyed by a canon digest:** the still is reused while the canon is
  unchanged. A canon change (a place's light, a prop's description, the film's
  look) gives a new digest and a new still. This is the same scheme as the
  wardrobe references.
- **Recorded in `world_references`:** one row per place or prop and digest,
  append-only. The still itself is also in the image ledger.
- **In the reference pack:** these stills go after the people (seed, previous
  end frame, wardrobe, identity, location, props). Whatever does not fit is
  listed, not lost.
- **Gaps:** when no still can be had, the shot runs on its prompt and
  WORLD_REFERENCE_UNAVAILABLE is recorded.
- **Switching off:** `WORLD_REFERENCES=0`.

## 5. What is still open

- **An image system of CineForge's own** (ComfyUI with Flux or SDXL, LoRA-driven
  stills): gated on Phase 1.
- **Style and camera references:** they are not separate images. The film's
  look is written into every prompt.
- **Per-dimension frame scores** (identity, composition, lighting): not
  produced. The reviewer judges canon facts, match or mismatch. (Since W18,
  docs/63: produced, and they break ties between candidates.)
- **Seed candidates are off by default** (`SEED_CANDIDATES=1`), because each
  candidate is a paid image.

## 6. Owner steps

- Deploy the worker and the web app.
- Optional settings:
  - `IMAGE_PROVIDERS=fal,openai` with `FAL_KEY` set, to draw stills with Flux
    and real seeds;
  - `SEED_CANDIDATES=2` to `4`, to get takes to choose from in the storyboard
    pass;
  - `WORLD_REFERENCES=0`, to switch off place and prop stills.
