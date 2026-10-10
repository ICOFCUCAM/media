# 67 — Dubs as real masters: full mix, lip-synced (DirectorOS W22)

**Status:** implemented in code (2026-10-10). No migration.
Contract: [dubs.md](directoros/contracts/dubs.md).
Requirements: Part 3 §111 and §117.3/§117.5.
It builds on W7c (dubbing on the Voice Engine), W16 (sound design), W19
(locked films) and W21 (lip sync).

## 1. What changed

A dub used to replace the finished film's **whole** soundtrack with the
translated voice. The music, ambience and effects were lost, and the mouths
still moved to the original language.

Now each dubbed language is rendered by the same engine as the film:

| | Before | Now |
|---|---|---|
| Picture | the original master | the film's clips in its cut. A locked film follows the frozen timeline its master was delivered from (W19). With `LIP_SYNC=1`, each dialogue shot is lip-synced to the **translated** line |
| Voice | the translated scene tracks, joined | the same, placed scene by scene in the mix |
| Music, ambience, effects | lost | kept, under the translated voice, mixed by the production profile |
| Check | none | the Final Quality Gate, the same as the original |
| Output | `film/final_<lang>.mp4` | `film/<lang>/final.mp4`, and `films.locales[lang]` records `mixed: true` and the number of lip-synced shots |

The translated speech is produced exactly as before: each character speaks
the language in their own voice, cloned voices included.

## 2. Lip sync for dubs

The dubbed scene track already knows where each translated line starts and
how long it is spoken. The lip-sync pass (W21) reads each line out of that
track.

- **Which shots:** the same rule as for the original. A shot is lip-synced
  when the line's speaker is in frame; wides and inserts never are.
- **Caching:** results are content-keyed, so each language and shot is
  lip-synced once.
- **Failures:** a shot that cannot be lip-synced keeps its clip, and the
  failure is recorded with the language.

## 3. Fallback

- `DUB_MIX=0` keeps the old voice swap.
- If the full dub cannot be rendered (a clip is missing, the mix fails, or
  the gate refuses it), the language falls back to the voice swap. It is
  recorded as `DUB_MIX_FALLBACK`, so it never silently loses its music.
- A language whose translated speech overruns the picture is handled as
  before.

## 4. Inside

The film's render and every dubbed render now build their inputs from one
place, `render/inputs.ts`:

- the scene assets: clips, cuts, music, voice and sound design, with stub
  audio rows excluded;
- the lip-sync scenes.

They also share:

- the lip-sync pass, `render/lip-sync-pass.ts`;
- the quality gate and the brand outro, `render/profile.ts`.

## 5. What is still open

- **The live conversation loop:** speech recognition, an LLM reply and a
  talking avatar (§111.3, §117.4).
- **Cost:** a dub is now a full re-render per language: every clip is
  re-encoded and mixed, not just the audio remuxed.

## 6. Owner steps

- Deploy the worker.
- Optional settings:
  - `LIP_SYNC=1` lip-syncs dubs too, at one paid call per dialogue shot per
    language;
  - `DUB_MIX=0` returns to the voice-only swap.
