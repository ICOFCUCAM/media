# 61 — Sound design: ambience, sound effects and the profile-driven mix (DirectorOS W16)

**Status:** implemented in code (2026-10-09). No migration is needed: the
`audio_tracks` kinds AMBIENCE and SFX already existed.
Contract: [sound-design.md](directoros/contracts/sound-design.md).
Requirements: Part 1 §18 and §20; Part 5 §178.4, §180.1 and §181.5.

Before W16, every scene's plan named its ambience and sound effects, but
nothing generated them: films had dialogue and a score only. The mix also
hard-coded −16 LUFS and the ducking, ignoring the sync policy.

## 1. The sound plan (§18)

`packages/movie/src/sound/plan.ts` turns each scene of the Film IR into
generation requests:

- **Ambience** comes from the scene's planned ambience, its place (interior or
  exterior), the hour and the film's ambience style. It becomes one loopable
  bed per scene, and its prompt never asks for music or voices.
- **Sound effects:** each planned effect is anchored to the shot whose action
  shares the most sound words with it, a beat after that shot starts.
  - An effect that matches no shot is spread evenly through the scene, and
    that is recorded as its anchor.
  - At most `SFX_MAX_PER_SCENE` (default 4) effects per scene are generated.

## 2. Generation (worker)

Each scene now has `ambience` and `sfx` audio jobs next to `music` and
`voice`. `SOUND_DESIGN=0` leaves them out.

- **Model:** a cloud text-to-audio model, `FAL_SOUND_MODEL`. It defaults to the
  score model, Stable Audio. No GPU is involved.
- **Content-addressed storage:** sounds are stored under
  `audio_cache/sound/<sha256 of model, prompt, length>`. The same sound is
  generated once and reused, so a place that sounds the same in two scenes
  gets the very same bed: consistent room tone, paid for once.
- **Metering:** each generated second is metered. A cache hit is free.
- **Ledger:** each sound is an `audio_track` row (AMBIENCE runs under the whole
  scene; SFX at its planned moment) and an `audio_generations` row on the
  Master Clock.
- **Failures:**
  - A provider failure is retried first. Generated sounds are cached, so the
    retry pays only for what failed.
  - A sound still missing after the retry is recorded as TRACK_MISSING, naming
    the sound.
  - When no provider is configured, one film-level note says so.
- **Capability:** `sfx_generation` reports the provider when `FAL_KEY` is set,
  and is otherwise unavailable or disabled.

## 3. The mix (§20)

The render measures each scene's span in the cut, from its clips as trimmed.
It then builds two stems placed on that timeline:

- **Ambience:** each scene's bed is looped to exactly its scene's span, faded
  at the edges, and silent outside it.
- **Effects:** each effect lands where its shot lands in the cut. The planned
  moment is scaled by the scene's real length against its planned length, and
  an effect never runs past the scene's end.

Then the stems are mixed, with dialogue as the anchor:

| Stem | Treatment |
|---|---|
| Dialogue | never attenuated |
| Score | stem level, then ducked under the dialogue (sidechain, strong) |
| Ambience | stem level, then ducked gently under the dialogue |
| Effects | stem level, never ducked |

- **Stem levels and ducking** come from the production profile's mix spec
  (`packages/shared/src/sync/mix.ts`). Cinematic, broadcast, documentary,
  education, corporate and social each have their own. Speech-forward
  profiles keep the beds lower.
- **Loudness and true peak:** the master is normalised to the sync policy's
  delivery target, aiming 0.5 dB under its true-peak ceiling. The Final
  Quality Gate now judges against the same targets (it used to hard-code
  −16 / −1).
- **Which profile:** `RENDER_SYNC_PROFILE`, else `RUNTIME_SYNC_PROFILE`, else
  cinematic.

**Unchanged:** per-line de-click and mastering in the Voice Engine (docs/51)
and per-character loudness traits (docs/60). The ambience beds supply room
tone under dialogue.

## 4. Proven against real FFmpeg

`apps/worker/src/ffmpeg/sound.media.test.ts`, required in CI's media job:

- an effect lands at its moment and is silent everywhere else;
- a bed loops past its source length and stops at its scene's edge;
- a two-scene film with dialogue, ambience and an effect is mixed to
  −16 LUFS ±2, with the effect audible where its shot lands.

The film acceptance check `audio_present` now counts ambience beds as well as
effects.

## 5. What is still open

- **Narration placement:** narration is still one bed concatenated in scene
  order, not placed per scene on the timeline. A scene whose speech is
  shorter than its picture shifts later speech earlier.
- **Sound effects in the plan:** they are planned per scene and anchored to
  shots by their words. A shot does not yet carry its own audio cues.
- **Ambience loop seams:** a bed shorter than its scene is looped with no
  crossfade at the seam.
- **Motion comics and storybooks:** characters do not animate within a panel or page.

## 6. Owner steps

- Deploy the worker. It needs `FAL_KEY`, as music already does.
- Optional settings:
  - `FAL_SOUND_MODEL` (sound model);
  - `SFX_MAX_PER_SCENE` (effects per scene);
  - `AMBIENCE_MAX_SEC` (ambience bed length);
  - `RENDER_SYNC_PROFILE` (mix profile);
  - `SOUND_DESIGN=0` (switch sound design off).
