# 48 — Cinematography and the Prompt Compiler (DirectorOS W4)

**Status:** implemented in code (2026-10-09). No migration. Contract:
[cinematography-and-prompts.md](directoros/contracts/cinematography-and-prompts.md).

## 1. What changed

| Before | Now |
|---|---|
| Shot camera was planned but nothing checked film grammar | The **Cinematography Engine**: every shot states its side of the action line and its subject's screen direction; a cut straight across the line or a reverse whose eyelines don't meet is sent back to the Director; grammar slips (no establishing wide, repeated sizes, jumps to ECU, flipped direction) are recorded |
| One prompt shape for every engine, assembled from canon text | A **canonical media request** per shot (intent, each subject's canonical look and holdings, camera, place, light, style, continuity, sound), compiled **per model**: Wan, Hunyuan, OpenAI image (seed stills), and a default for other video providers |
| Continuity added at render time as a second text block | Continuity is inside the compiled prompt; the extra block is only for projects planned before the Film IR |
| Cache key over a prompt without continuity → a changed coat could reuse an old clip | The cache key hashes the compiled prompt, which contains the shot's canon — a canon change always re-keys exactly the shots that show it |
| Prompt silently cut to fit | Lowest-priority parts dropped first, the subject and action always kept, and every omission recorded (`PROMPT_LIMITED`) |

The Director prompt is now `director.master` v4 (cinematography rules).

## 2. Verify after deploying the worker

1. A new film's shots have prompts that start with who is in frame and what
   they do, and contain each character's canonical look and the scene's
   wardrobe.
2. With `INTELLIGENCE_ROUTES` unchanged, `ai_decisions` shows prompt version 4.
3. The project page lists any `CINEMA_ADVISORY` / `PROMPT_LIMITED` notes.
4. Seed stills (when OpenAI is configured) are generated from the structured
   still prompt.

## 3. Limits (carried forward)

- No separate shot-design model call: coverage is planned in the master call
  under the engine's rules (one-pass doctrine).
- Flux / SDXL / ComfyUI compilers come with the image runtime (W6); TTS,
  music and SFX compilers with the Voice Engine (W7).
- Prompt profiles are reasoned, not yet tuned on real output (W10).
