# 66 — Lip sync for dialogue, frame interpolation, Character Card portraits (DirectorOS W21)

**Status:** implemented in code (2026-10-09). Migration 0054 is **applied live**.
Contract: [lip-sync-and-portraits.md](directoros/contracts/lip-sync-and-portraits.md).
Requirements: Part 1 §2.4 (lip sync, interpolation) and Part 5 §183 (the
Character Card's image). Dubbing (Part 3 §111) is covered only in part: see §4.

## 1. Lip sync for dialogue shots

Video models do not move a speaker's mouth to the film's lines. With
`LIP_SYNC=1`, before the film is assembled, a dialogue shot is prepared when
it frames someone who speaks during it.

**Which shots:**

- A shot is chosen when a character in frame speaks while it plays.
- Wides, extreme wides and inserts are never chosen.
- A shot with less than 0.4 s of speech is skipped.

**What happens to each one:**

1. **The dialogue stem.** That character's lines are cut to the shot and
   laid at their places, with silence elsewhere. The stem is exactly the
   shot's length, at 48 kHz mono.
2. **The lip-sync model.** The clip and the stem go to a hosted model:
   `FAL_LIPSYNC_MODEL`, default `fal-ai/sync-lipsync`, in `cut_off` mode so
   the clip keeps its length.
3. **Storage and reuse.** The result is stored under a content key (the
   model, clip, shot length and line slices). The same shot is not
   lip-synced twice.
4. **The render.** The render uses the lip-synced clip in place of the
   original, including for a locked film's approved timeline (W19).

**Records:**

- Each call is metered (`purpose: lip_sync`).
- A failed shot keeps its clip and is recorded as `LIP_SYNC_FAILED`.
- When no provider is configured, the film is recorded once as
  `LIP_SYNC_UNAVAILABLE`.
- Nothing blocks the film.

**Probe:** `lipsync:fal` draws a face, holds it for 3 s, sends it with a tone
through the lip-sync model, and verifies the clip that comes back.

Characters are matched to speakers through the film's cast names: the Film
IR keys its characters by id and the rows store them by name.

## 2. Frame interpolation

With `RENDER_INTERPOLATE=1`, every frame-rate change in the render makes new
in-between frames instead of repeating or dropping frames. It uses ffmpeg
motion-compensated interpolation (`minterpolate`, mci/aobmc/bidir).

- The light pass runs at 24 fps instead of 16, so a 16 fps model clip plays
  smoothly at 24.
- It runs on the CPU and is slower than the default conform.

## 3. Character Card portraits

A card can now have its portrait, drawn from the card itself:

- name and look;
- age and height;
- hair, eyes and clothing;
- the animated design (proportions, exact colours);
- the animation style, or a photoreal portrait for live action.

**How it is made:**

1. The owner clicks **Draw portrait**, which sets `portrait_status =
   'requested'`.
2. The poller claims the request, draws the portrait with the image engine
   (W17) and records it in the image ledger (purpose `portrait`).
3. It writes the key under the card's project, so the owner can read it.
4. A failure is shown on the card with its reason.

**The database (0054):**

- A client can only request a portrait: it cannot write the key, the error,
  or any other status.
- A client cannot reset a request while it is being drawn.

## 4. What is still open

- **Dubbed versions are not lip-synced.** A dub replaces the voice on the
  finished master, and the per-shot lip sync runs before assembly. Lip-syncing
  a dub means re-assembling the picture per language.
- **Live conversation through an avatar.** Talking avatars from a portrait and
  a reading exist (Voice Lab); a live conversation does not.
- **Character animation in storybook and motion comic** beyond the mouth.

## 5. Owner steps

- Deploy the worker and the web app.
- Optional settings:
  - `LIP_SYNC=1` (with `FAL_KEY`) lip-syncs dialogue shots; each lip-synced
    shot is one paid call. `FAL_LIPSYNC_MODEL` chooses the model.
  - `RENDER_INTERPOLATE=1` turns on frame interpolation; it costs more CPU
    time per render.
- Portraits use the configured image provider (`IMAGE_PROVIDERS`).
