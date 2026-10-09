# 50 — Image providers, seed candidates and visual memory (DirectorOS W6)

**Status:** implemented in code (2026-10-09), except the self-hosted image
runtime, which is **blocked by the owner's rule**: no ComfyUI or model work
until Phase 1 (docs/39) is operationally complete. No migration. Contract:
[images-and-references.md](directoros/contracts/images-and-references.md).

## 1. What changed

| Before | Now |
|---|---|
| Seed frames and wardrobe stills each built their own OpenAI client | One **image provider registry** (`IMAGE_PROVIDERS`, default `openai`; `none` to switch off); `comfyui` is listed and reported as gated |
| One seed still per shot, taken as drawn | **Seed candidates** (`SEED_CANDIDATES`, 1–4): the Visual Reviewer picks the still that best shows canon; every candidate is kept with its review |
| Up to 4 identity frames, in any order | A **reference pack** per shot: seed → the previous shot's last frame → wardrobe stills → identity frames, capped at 4, with what was dropped listed |
| Shots of a scene never saw each other | **End-state memory**: each accepted shot's last frame is kept and the next shot in the same continuous action starts from it; `SEQUENTIAL_SHOTS=1` chains a scene's shots so it is always there |

## 2. Configuration

| Variable | Default | Effect |
|---|---|---|
| `IMAGE_PROVIDERS` | `openai` | ordered providers; `comfyui` is gated (Phase 1); `none` disables stills |
| `SEED_CANDIDATES` | `1` | stills drawn per image-to-video shot (each is one image call; review needs a `visual_review` route) |
| `SEQUENTIAL_SHOTS` | off | `1` makes each shot wait for the previous one in its scene (slower; guarantees end-frame memory) |

## 3. Limits (carried forward)

- ComfyUI runtime, Workflow Registry, approved image models: gated (owner rule).
- Location, prop and vehicle reference stills are not generated yet.
- Candidates are stills; video candidates would multiply GPU cost.
