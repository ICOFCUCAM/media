# DirectorOS W27: sync repairs, cut edges, the fitted score, and owner edits

W27 closes the items the workstream docs had left open and that could be
built now (none of them needs ComfyUI or a self-hosted voice model). The Ads
Studio items (A2, A3, A5) are in docs/47.

## 1. The repair engine (docs/38 Phase 9; DOS-39.2, 40.x)

After every final render, the sync check plans repairs and saves them as
`repair_jobs` (W18). Now the worker carries them out
(`apps/worker/src/avsync/repair.ts`).

| Planned repair | What happens |
|---|---|
| `retime_clip`, `hold_last_frame`, `trim_tail`, `conform_frame_rate` | The shot's clip is re-encoded to fit its slot. It is stored as a new version of the shot (`media_versions`, derivation `sync_repair`), and the shot points at it. |
| `regenerate_shot`, `regenerate_tail` | The shot is queued to generate again, with a new gateway authorization like any generation. At most `SYNC_REPAIR_MAX_REGEN` times per shot (default 1). |
| `normalize_loudness` | Cancelled with the reason: every master is already loudness-corrected when it renders (W23). |
| `rebuild_subtitles` | Cancelled: subtitles are rebuilt from the dialogue when the film is localized. |
| `shift_audio`, `reanchor`, `human_review` | Cancelled with the reason. These are placement decisions for the owner. |

- Every job moves planned → running → succeeded / failed / cancelled. The
  0030 guard keeps the planned action itself immutable.
- A repaired issue is marked resolved. A regenerating one is marked
  repairing.
- After clip repairs, the film renders once more (`repairRound`). After
  regenerations, the resume job generates those shots and renders. The next
  sync check judges the result.
- The number of rounds is bounded by `SYNC_REPAIR_ROUNDS` (default 1).

**Settings**
- `SYNC_REPAIR=off` (default) | `clips` | `all`. Off keeps W18's behaviour:
  repairs are planned and shown, not run.
- `clips` runs only the cheap re-encodes.
- `all` also regenerates shots, which spends GPU time.

## 2. Transitions on the cut (DOS-21, Part 1 §46)

A shot's planned `transition` is how it is entered. It is now rendered
(`transitionPlan`, `fadeArgs`, `dissolveArgs` in `ffmpeg/commands.ts`).

| Transition | Rendered as |
|---|---|
| `dissolve` | A 0.5 s crossfade from the shot before. The outgoing clip's last frame is held for the length of the dissolve, so the incoming shot still starts exactly where the timeline puts it, and the pair lasts exactly as long as the two clips. Timing is unchanged, so speech and sound placement are unchanged. |
| `fade_in` / `fade_out` | The shot fades up from black at its head, or down to black at its tail. |
| `cut`, `smash_cut`, `match_cut` | A hard cut. A match cut is matched in the framing, which the Director plans. |

- A dissolve on the first shot fades in.
- A clip shorter than two transitions keeps hard edges.
- A transition that cannot be rendered is cut instead, and recorded as
  `TRANSITION_SKIPPED`.
- Transitions are carried through the approved timeline (`applyCut`) and
  through dubs.
- `RENDER_TRANSITIONS=0` renders every edge as a cut.

## 3. The score fitted to the cut (Part 1 §46.2)

**Re-timing.** A score within ±15 % of the film's length
(`RENDER_MUSIC_RETIME_MAX`) has its tempo changed, with pitch kept (ffmpeg
`atempo`), so it ends with the cut instead of being cut off. This also
covers an edit that shortens or lengthens the film.

**Much shorter scores** loop with crossfaded seams.

**Much longer scores** fade out where the film ends, as before (W25).

`RENDER_MUSIC_RETIME=0` turns this off.

## 4. Ambience beds without seams (W16 open item)

- An ambience bed shorter than its scene now loops with 1 s equal-power
  crossfades at every seam (`seamlessLoopArgs`), instead of a hard jump.
- The same builder loops a short score.
- A loop that would need more than 40 copies keeps the plain loop.

## 5. Deleting a voice erases it (Part 3 §110, §118; migration 0061)

The Voice Lab has a **Delete voice** button. `DELETE /v1/voices/:id` already
existed.

**What happens when a voice row is deleted (by its owner, the API, or an
admin)**
1. A trigger records what the voice leaves behind in `voice_erasures`: the
   uploaded recording, every engine artifact, and the provider-side clone.
   This happens before the artifacts cascade away.
2. The worker deletes the owner's files. Only keys under `voices/<user>/`
   are deleted, never anything else.
3. The worker asks each engine to delete its clone. The engine contract has
   an optional `deleteVoice`. The fal MiniMax adapter has none, so that
   outcome is recorded as `not_supported`.
4. Failures retry three times, then stay recorded.
5. Cached speech in the voice was already purged (W14).

**What stays.** Readings the owner already made stay in their library.

**Who can read and write.** Owners can read their own erasures; only the
worker writes.

## 6. The change form: identity, places, props (W8b open item)

"Change the film" now also offers:
- how a character looks (face, hair, build);
- a place (description, architecture, era, light);
- a prop (name, description).

The form starts from what the canon says now. It shows how many shots
depend on the entity (`shot_dependencies`), and only those shots
regenerate. The worker already accepted these kinds.

## 7. The Film Bible, edited in the workspace (W9 open item; migration 0062)

The Director workspace's Bible column has **Edit bible**. It covers:
- logline, synopsis, premise;
- genre, tone, themes, audience, era, place;
- the look (palette, light, lenses, texture);
- the sound (score, ambience).

Saving sends one `film_bible` canon change through the edit requests. It
passes canon, locks and passes like any other change.

| What changed | What is made again |
|---|---|
| Story text | No media. |
| The look | It is in every shot's prompt, so the shots it changes regenerate. |
| The score style | The score is recomposed. The Film Bible's score style now leads the score prompt. |
| The ambience style | Every bed is redrawn. |

## 8. One Continuity Engine (W3 open item)

The web storyboard keeps a client-safe copy of the worker's Continuity
Engine, because the shared package's barrel is not browser-safe. The copy
had drifted: it lacked the filter that keeps internal ids out of prompts.

It is now identical, and `packages/shared/src/continuity-copy.test.ts`
fails CI if the two ever differ again.

## 9. Where each character stands (Part 1 §10.2, §17; DOS-17.2)

A shot may now carry `blocking`: for each framed character, left / center /
right third and foreground / midground / background.

- **The Director plans it.** `director.master` v10 asks for it whenever
  more than one person is in frame, or where someone stands matters.
- **The validator** refuses a placement of someone not in the shot
  (`BLOCKING_NOT_IN_FRAME`) and a double placement (`BLOCKING_DUPLICATE`).
- **Prompts.** The placement goes into every compiled prompt ("Maya (left
  third, foreground), …").
- **The Visual Reviewer.** `review.visual` v3 judges a character who is
  clearly elsewhere in the frame as a presence mismatch.
- **Older shots.** Shots without blocking compile exactly as before, with
  the same cache keys.

## 10. Owner steps

1. Apply migrations 0060–0062 (done live with this PR).
2. Deploy the worker.
3. Optional settings:
   - `SYNC_REPAIR=clips` lets the worker fix clip timing after renders.
   - `SYNC_REPAIR=all` also allows regenerations, which cost GPU time.
