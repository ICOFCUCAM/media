# 52 — Versions and locks (DirectorOS W8a)

**Status:** implemented in code (2026-10-09); migrations 0037 and 0038
**applied live**. Contract: [versions-and-locks.md](directoros/contracts/versions-and-locks.md).

## 1. What changed

| Before | Now |
|---|---|
| A regenerated shot, a canon edit or a re-render replaced the pointer and the old media was forgotten | Every accepted **clip**, **scene voice track** and **master** is an immutable row in `media_versions` (hash, length, how it was made). The shot's `video_key` and the film's `mp4_key` point at the newest version; history is never erased |
| The master was always written to `film/final.mp4`, overwriting the last one | Each render goes to its own path, `projects/<id>/film/v<N>/final.mp4` (poster and HLS beside it), and is recorded as master version N |
| Nothing could be frozen | **Scene lock** and **film lock**, enforced by the database: a locked scene's shots, dialogue lines and audio cannot be added, changed or removed by anyone — worker, canon edit or client — until it is unlocked. A locked film locks every scene |
| — | A scene locks only when every shot in it is ready with a clip; a film only when every shot in it is |
| Canon edits always applied | A canon edit that would touch a locked scene (or any edit to a locked film) is refused with `SCENE_LOCKED` / `FILM_LOCKED` and recorded as rejected; nothing is half-applied |

## 2. Using it

On a production's page, **Locks and versions** lists the scenes. For each it
shows whether it is finished or locked and how many takes (clip versions) it
has. A finished scene can be locked or unlocked; when every shot is ready, the
whole film can be locked. Every delivered master is listed (v1, v2, …); the
newest is the one that plays.

## 3. Rules the database enforces (0037, 0038)

- `scenes.locked_at` / `projects.locked_at` (with `locked_by`, set to the user
  who locked it).
- Triggers on `shots`, `dialogue_lines`, `audio_tracks` refuse insert, update,
  delete and moving rows out of a locked scene (`42501`).
- A locked scene's own content cannot change; its `status` (pipeline
  bookkeeping) can. It cannot be deleted while locked; deleting the whole
  project still cascades.
- A scene cannot be unlocked while its film is locked.
- The lock check is not callable over the API (0038); the triggers run as
  their owner.

## 4. Limits (carried forward to W8b)

- Re-planning a project still deletes and recreates its scenes.
- The pass state machine (STORY → PREVIS → FINAL) and an edit command API
  are not built yet.
- Locking does not yet trigger the final render on an approved timeline.
- The page counts takes but does not yet play earlier ones or restore one
  as current.
