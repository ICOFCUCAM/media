# DirectorOS W24 — story state, the Cinematographer's call, reference-conditioned stills

W24 closes the shallow items left in the story and cinematography layers.

## Goals in the film state (DOS-92.1)

The Film IR has `goals` (`goal_<name>`: whose goal, what they want, what failing
costs them). Each scene's `goalChanges` mark a goal as advanced, blocked,
achieved or abandoned. The World State Engine carries every goal's status
scene by scene, next to relationships, knowledge and who is alive. The story
validator refuses a goal that moves after it was achieved or abandoned
(`GOAL_AFTER_END`).

## Audience devices (DOS-57.2)

A scene lists the dramatic irony, misdirection or surprise it plays on purpose
(`devices`, each tied to a fact). The canon validator checks each device
against who knows the fact at that scene:

| device | holds when |
|---|---|
| dramatic irony | the audience knows the fact and someone in the scene does not (`DEVICE_NO_IRONY`) |
| misdirection | the audience does not know it yet and learns it in a later scene (`DEVICE_MISDIRECTION_UNPAID`) |
| surprise | the audience learns it in this very scene, not before (`DEVICE_SURPRISE_NOT_REVEALED`) |

The Director's prompt (`director.master` v8) asks for goals and devices.

## The Cinematographer's call (DOS-11.2, 26.1, 92.2, 92.3)

After the master plan validates, every scene with a visual-grammar advisory is
given to the Cinematographer, a separate role call (`cinema.design`, task
`shot_design`). It gets only that scene's state (`sceneState`): place, purpose,
beats, people and their visible state, relationships and goals of who is there,
what the audience knows, the film's look, and how the previous scene ended. It
returns the scene's shots redesigned.

The answer is kept only when the whole film still validates (same length, same
limits) and the scene has fewer advisories than before. Otherwise the
Director's shots stand. At most four scenes per film go to this call.
`DIRECTOR_COVERAGE_PASS=0` turns it off.

Every other follow-up call already receives a digest, not the history: the
director chat gets the canon digest, and the Editor gets the editorial digest.

## Style and camera references; conditioned stills (DOS-34.1, 35.1)

- **Style reference.** The film's look (palette, light, lenses, texture, genre,
  tone) is drawn once as a style still. It is stored as a world reference of
  kind `style` (migration 0056), keyed by a digest of the look, and shared by
  every shot.
- **Camera reference.** The scene's establishing frame (the still its first
  shot was drawn from) goes with every later shot in the scene, so the set
  keeps its geography across angles.
- **Reference pack order:** seed → previous end frame → wardrobe → identity →
  camera → location → style → props.
- **Conditioned seed stills.** Seed stills are now drawn from up to four
  reference images (wardrobe, identity, camera, location, style). fal's
  multi-reference model (`FAL_REFERENCE_IMAGE_MODEL`, default
  `fal-ai/flux-pro/kontext/multi`) draws them. If it fails, or only OpenAI is
  available, the still is drawn from text, and
  `REFERENCE_STILL_UNCONDITIONED` records why.

## Proof items (DOS-65.1, 66.x, 67.x)

Audited as built:
- the causality and knowledge validators (W3);
- the scene and film length validators;
- the exact master production clock;
- the A/V sync engine's measured durations.
