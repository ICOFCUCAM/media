# 58 — The Editor Agent (DirectorOS W13)

**Status:** implemented in code (2026-10-09); migration 0048 **applied live**.
Contract: [editor.md](directoros/contracts/editor.md). Requirements: Part 1
§21 (Editor Agent), §26–28 (the directorial roles), §46 (natural-language
editing).

## 1. What the Editor does

After the scenes are generated, the Editor watches the film **as a whole**
and answers the nine questions of §21.1: is the pacing correct, is the
opening strong, are there redundant shots, is the emotional escalation
working, should scenes be shortened, does the climax arrive too early, is the
ending satisfying, are transitions coherent, is dialogue repetitive. Then it
proposes edits — or none, which is a valid answer.

Asked for one change instead ("make the opening 15 seconds faster", §46), it
proposes exactly the edits that do it: the film is given to it on its
timecodes, so it knows which scenes and shots fall in those 15 seconds.

It never edits anything itself. The owner approves or rejects each proposal
and applies the approved ones together.

## 2. Structured edit operations (§21.2–21.3)

A closed vocabulary (`packages/movie/src/edit/operations.ts`):

| Operation | Does | Costs |
|---|---|---|
| `CUT_SHOT` | removes a shot (never a scene's last) | a re-cut |
| `TRIM_SHOT` | shortens a shot, keeping its start | a re-cut — the same clip, trimmed |
| `EXTEND_SHOT` | lengthens a shot (≤ 10 s, ≤ the runtime's clip limit) | that shot is generated again |
| `SHORTEN_SCENE` | shortens a scene, taking time from its last shots first (2 s minimum a shot) | re-cuts |
| `MOVE_SCENE` | moves a scene after another; it joins that scene's act | a re-cut (order only) |
| `ADD_INSERT` | a new insert shot of a character, prop or place | the new shot is generated |
| `REMOVE_LINE` | removes a repeated or needless line | the scene is re-voiced |

`applyEdits` applies them to a copy of the Film IR. Shot and line numbers in
every operation refer to **the cut that was reviewed**, so a set of proposals
approved together means what each said. The edited film must pass what a
canon revision passes — references, story (a payoff never before its setup,
acts in order), world state, film grammar (the 180° line) — plus shot order,
clip limits, and **lines are never cut short**: a scene that would become too
short for its narration and dialogue refuses the edit with that reason.

Every proposal is dry-run before the owner sees it, with its cost: seconds
gained or lost, shots re-cut, removed, to generate, scenes re-voiced. A
suggestion that names nothing real, or would break the story or a line, is
dropped and counted, never offered.

## 3. Applying edits

The worker applies a review's approved proposals **together**:

- A **re-cut** keeps the clip: the shot's `cut_sec` is set and the render
  trims the clip to it (`withCut`). Nothing is generated.
- A **cut** shot's row is deleted; its clips stay in `media_versions`.
- An **extension** or **insert** is generated: new prompt, seed and cache
  key, status PENDING.
- A **removed line** rewrites the scene's lines and deletes its voice track,
  so the scene is voiced again.
- Scenes and shots are re-indexed in one transaction (two-phase, so the
  unique indexes never collide); every touched scene is snapshotted first
  (`scene_versions`, reason `editorial`); the plan is written back with
  `editedFrom` / `editedBy`; dependency edges are rewritten.
- Then the film **resumes**: only PENDING shots generate, the voice of
  re-voiced scenes is made again, and the master renders as a **new
  version** (`film/v<N>/`, a `media_versions` row).

Refused, with the reason:
- a review of an earlier cut (the canon version changed since);
- a locked film or a locked scene;
- a set of approved edits that together break the story or a line.

## 4. In the workspace

The Director workspace gets an **Editor** panel. Leave the box empty to review
the whole cut, or type a request. It shows the nine answers, and each proposal
with its reason and cost and Approve / Reject. "Apply N approved edits" applies
them. The chat also takes cut and timing requests: the Director
(`director.edit` v2) files them for the Editor and says nothing changes until
you approve.

## 5. The directorial roles (§26–28)

§27 says to start with six roles and not twenty agents. Part 2 §85 puts
story, cinematography and audio planning into one master call. So a role is a
**responsibility**, carried by logged prompts and deterministic engines
(`packages/movie/src/intelligence/roles.ts`):

| Role | Prompts | Engines |
|---|---|---|
| Director | director.master, director.revision, director.edit | planner, chat |
| Story / Screenplay | translate.lines | story & canon validators, world state |
| Visual / Cinematography | — (in the master plan) | cinema engine, prompt compilers, still-motion |
| Audio | — (in the master plan) | scene voices, score, mix |
| Continuity | — | continuity engine, fixed cast |
| Editor / QC | editor.review, review.visual, social.kit | edit operations, editorial apply, quality gates, visual reviewer |

Every registered prompt belongs to exactly one role (tested). No role depends
on a vendor's multi-agent feature (§26.2).

## 6. What is still open

- Separate Script, Shot and Music agents (§26.1): not built, by design.
- Music is one score bed for the film; an edit re-cuts it to the new length but
  does not re-time it (§46.2 "accelerate music").
- Transitions other than hard cuts (dissolves, match cuts) are planned but not
  rendered.

## 7. Owner steps

- Run `bench:live` to score `editor.review` v1 and `director.edit` v2.
- Deploy the worker (the Editor runs in the project poller) and the web app.
