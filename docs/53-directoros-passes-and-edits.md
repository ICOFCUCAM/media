# 53 — Passes, edits, dependency edges and plan history (DirectorOS W8b)

**Status:** implemented in code (2026-10-09); migrations 0039–0041 **applied
live**. Contract: [passes-and-edits.md](directoros/contracts/passes-and-edits.md).
Together with W8a ([docs/52](52-directoros-versions-and-locks.md)) this
completes the W8 map: versions, locks, dependency edges, passes and the edit
command.

## 1. Production passes — STORY → PREVIS → FINAL

When you create a film you can choose **"Review story & storyboard first"**
(a three-pass production) or **"Straight through"** (as before, the default).

| Pass | What happens | What you do |
|---|---|---|
| STORY | The Director plans the film; the project waits in **REVIEW**. No stills, no video, no GPU | Read the scenes and narration; **Approve story** |
| PREVIS | A storyboard still is drawn for every image-led shot (cheap, no video) | **Approve storyboard** per scene, or approve every storyboard |
| FINAL | Each approved scene generates its video, voices and music; when every scene is approved and ready, the film renders | Watch it arrive |

The database enforces the one rule that matters: in a three-pass production
**no shot of an unapproved scene can enter video generation**, whatever code
path tries (0040). A storyboard can be approved only after the story; an
approval cannot be withdrawn while that scene is generating; the pass mode is
fixed once the film is planned.

## 2. Changing the film — the edit command

On the production page, **Change the film** sends one canon change:

- a new outfit for a character from a scene on;
- an outfit changed everywhere it is worn (the page shows how many shots wear it);
- a visible state (an injury, wet, dirt) from a scene on.

The worker applies it through the canon revision path. Only the shots it
touches regenerate, and the film re-assembles. A change that breaks canon,
touches a locked scene or film, or names something that is not in the film is
refused, and the reasons are shown. Every request keeps its status: pending,
applying, applied (with how many shots), rejected (with the issues) or failed
(with the error).

## 3. Dependency edges

When a film is planned, and again whenever an edit recompiles a shot, each
shot's dependencies are stored in `shot_dependencies`. These are its
location, everyone and everything it frames, each framed character's
wardrobe, and what they hold. "What does changing this touch?" is then a
query. Tests prove the edges cover every shot the canon revision regenerates.

## 4. Plan history

Before a re-plan replaces a scene, or a canon edit changes it, the scene as it
was is kept in `scene_versions`. That covers its plan, its shots with their
clip pointers, and its dialogue. The table is append-only, so nothing a scene
was is lost. With W8a's clip, voice and master versions, no earlier state of a
film is destroyed.

## 5. Takes

In **Locks and versions**, open a scene's takes to play any earlier clip
(v1, v2, …) and choose **use** to make it current again. A locked scene's
takes cannot be switched. Re-assemble the film to see the restored take.

## 6. Limits (carried forward)

- Three passes are a choice, not yet the default. (Since W19, docs/64: the
  default in the create flow.)
- Previs draws stills only. Rough voices, camera previews and timing in previs
  are not built. (Since W19, docs/64: built, as an animatic per scene.)
- The Editor Agent (typed edit operations on timeline versions) is still to come.
- Edits from the page cover outfits and visible state. Identity, location and
  prop edits are accepted by the worker and the API table, but the page does
  not offer them yet.
