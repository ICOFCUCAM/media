# 46 — Canon, world state and continuity (DirectorOS W3)

**Status:** implemented in code (2026-10-08). Migration 0033
(`canon_revisions`) is **not applied** to the live database; until it is,
canon revisions still apply and are written to the worker log only.
Contracts: [world-state.md](directoros/contracts/world-state.md),
[continuity-engine.md](directoros/contracts/continuity-engine.md).

## 1. What changed

| Before | Now |
|---|---|
| Continuity was name-keyed free text folded scene by scene, partly guessed from the script | A **World State Engine** folds the Film IR into typed, id-keyed state per scene: where each character is, what they wear, their visible physical state and emotion, what they hold and know; where every prop is; what the audience knows |
| Only `timeOfDay` | **Story time**: story day, continuous action (no time cut), flashback. Time runs backwards only in flashbacks |
| No knowledge tracking | **Facts**: who knows what before scene one, who learns what in each scene, and which facts each line relies on — a character cannot say what they cannot know yet |
| Setups only had "planted before payoff" | **Plant → development → payoff**, with the fact the plant shows the audience; **mysteries** must be withheld at first and answered for the audience within the thread |
| The continuity "check" was a presence heuristic | The **Character Continuity Engine** returns a `ContinuityResult` (Part 2 §62): violations with severity, required references, the corrected generation context, and the list of checks that ran |
| A canon change meant re-running the film | **Canon revisions**: a change (wardrobe, identity, injury, location, prop) names exactly the scenes and shots it touches; only those shots are invalidated and regenerated |
| Every shot carried every inherited character's reference frames and LoRA (an establishing shot carried the lead's face) | Only the characters **in frame** — from the engine's `requiredReferences` |
| The continuity preamble wrote database ids into video prompts | Ids and canon keys are never prompt text |

Planning also changed: the Director's prompt (`director.master` v2) asks for
story time, facts, reveals and line references; the validator's new **canon**
stage rejects a plan that breaks them, and the one surgical revision fixes it.

## 2. The acceptance case (Part 2 §62.8)

Maya wears a red coat in scenes 10 and 11; scene 12 continues scene 11's
action; scene 10 is the day before. Changing her coat to blue in scene 12:

- affected scenes: **11 and 12** (the coat is the same garment through the
  continuous action), not 10;
- affected shots: only the shots of Maya in 11 and 12; the harbour wide shot,
  Ewan's shot and the key insert keep their clips;
- the dependency graph predicted exactly those shots before anything changed.

## 3. Apply migration 0033 (owner step)

After 0027–0032:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/supabase/migrations/0033_canon_revisions.sql
```

Check: `select kind, outcome, invalidated, affected_scenes from canon_revisions order by created_at desc limit 20;`

## 4. Revising canon (operator)

There is no creator-facing canon editor yet (W8: it must preview the footprint
and charge for regeneration). Operators can:

```sh
cat > change.json <<'JSON'
{"kind":"scene_wardrobe","sceneId":"scene_12","characterId":"char_maya",
 "wardrobe":{"id":"wardrobe_blue_coat","description":"long blue wool coat"}}
JSON
pnpm --filter @cineforge/worker canon:revise <projectId> change.json          # dry run: footprint + canon issues
pnpm --filter @cineforge/worker canon:revise <projectId> change.json --apply  # invalidate + enqueue resume
```

Ids come from `screenplays.raw.package`. Change kinds: `scene_wardrobe`,
`wardrobe_description`, `identity`, `physical`, `location`, `prop`. A change
that breaks canon (an injury vanishing mid-action, say) is rejected and
recorded; nothing is written. Regeneration spends GPU time and is not charged.

## 5. Verify after deploying the worker

1. Create a 30 s film. `screenplays.raw.package` has `facts`, and each scene
   has `storyTime` and `reveals`; `screenplays.raw.canonVersion` is set.
2. Scene rows' `state_patch.world` has `story time`; character entries carry
   `key`; video prompts contain no uuids.
3. A shot without characters in frame is sent with no character reference
   frames or LoRAs.
4. Dry-run a `scene_wardrobe` change on that film: it names the scenes and
   shots; `--apply` sets only those shots PENDING and the film re-assembles.

## 6. Limits (carried forward)

- References are per character; a wardrobe change re-prompts the shot but
  there is no wardrobe reference image yet (W4 reference packs, W6 images).
- The engine checks the request and the plan, not the generated pixels
  (Visual Reviewer, W5).
- Relationships, goals and dead/alive state are not modelled yet; world state
  covers characters, props, time and knowledge (relationships with W5's
  story review, locks and passes with W8).
- The storyboard UI keeps its own text continuity (`apps/web/lib/continuity.ts`)
  for hand-made projects; Film IR projects use the engine.
