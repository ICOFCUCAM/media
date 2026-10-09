# 54 — Director workspace (DirectorOS W9)

**Status:** implemented in code (2026-10-09); migration 0042 **applied live**.
Contract: [director-workspace.md](directoros/contracts/director-workspace.md).

## 1. The workspace

Each production's file has a **Director workspace** button
(`/projects/<id>/director`). It opens one screen:

| Area | What it shows |
|---|---|
| Timeline strip | The latest production timeline (scenes, shots, dialogue, narration, music) when the Master Clock has built one; otherwise the plan laid end to end, labelled as planned |
| Bible | Logline; the cast with face, marks, wardrobe and voice; locations; props — from the film's canon (Film IR) |
| Scenes & shots | Pick a scene; its shots with frame (or storyboard still), length, camera and status |
| Director | The chat (below) and the **decision log**: every AI decision for this production — plan, revision, frame review, translation, instruction — with when, which model, the outcome and **why** in a sentence |

It is a single column on a phone and three columns on a wide screen. Only
what the Capability Registry says works is offered: with no planning model
configured, the chat says so instead of taking instructions.

## 2. Telling the Director

Write an instruction in plain words: *"give Maya a red coat from the harbour
on"*, *"she has a cut above her eye after the fight"*. The worker reads it with
the intelligence layer (task `edit_interpret`, prompt `director.edit` v1)
as **at most one** canon change, using only ids that exist in the film. The
Director replies in a sentence or two.

- **A canon change** (outfit, looks, visible state, location, prop): checked
  against the edit command's strict schema and **filed as an edit request**.
  From there it goes through canon, locks and passes like any other edit, and
  only the shots that depend on it regenerate.
- **Anything else** (a question, a camera or tone note, a timing request):
  answered, nothing changed. The reply says what is possible instead.
- The model never changes anything itself. A malformed change is refused with
  the reason; a film planned before the Film IR, or no planning model, is
  explained.

## 3. The "why" of every decision

`ai_decisions.summary` (0042) holds one sentence per decision. For example:
- "Planned *The Harbour* in 6 scenes with 3 characters: …"
- "Revised the plan to fix 2 issue(s) (SCENE_LENGTH, SPEECH_TOO_LONG). …"
- "Reviewed 7 canon checks on the frame: contradicts wardrobe."
- "Translated 24 line(s) into French."
- "Read 'make her coat red' as a scene_wardrobe change: …"

A summarizer that fails never breaks the call.

## 4. Studios brought in

- **Voice Studio** (was the Voice Lab):
  - every voice shows whose it is (consent);
  - each recording's quality report is shown: good / fair / poor, length, share of speech, and the first issues;
  - a pointer to give the voice to a character in the Casting Room;
  - no model names anywhere (the avatar option no longer says "Kling").
- **Storyboard Studio**: once a storyboard is saved, it links straight to the
  Director workspace and the production file (locks, takes, edits, passes).

## 5. Limits (carried forward)

- Tone, cinematography, music and timing changes by instruction are answered,
  not applied. Multi-department revisions and re-timing need the Editor Agent.
- The bible is read-only in the workspace. Changes go through the chat or the
  change form.
- The Voice Studio's readings and avatars still call fal directly (W7 carried).
