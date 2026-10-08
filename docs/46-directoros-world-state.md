# 46 — Canon, world state and continuity (DirectorOS W3)

**Status:** implemented in code (2026-10-08). Migrations 0027–0034 are
**applied to the live database** (2026-10-08). The live worker still runs
pre-W1 code: deploying it (docs/43) is what turns all of this on.
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
| No story state | **Relationships** (how each pair stands, changing scene by scene) and **who is alive**: the dead appear only in flashbacks, and a dead character in frame is blocked |
| Wardrobe lived only in the text prompt | A **wardrobe reference pack**: one generated still per character and wardrobe entry, keyed by the canon it shows, sent with every shot of that character in that wardrobe; a canon change produces a new still |
| Nobody looked at the generated pictures | The **Visual Reviewer**: a frame of every Film IR shot is checked by a vision model against what canon says the shot shows |

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

## 3. Migrations (applied)

0027–0034 were applied to the live project on 2026-10-08, in order, through
the Supabase migration tool; every new table has RLS on and the security
advisor reports nothing new. For another environment, apply the files in
`packages/db/supabase/migrations/` in order after 0026.

Checks: `select kind, outcome, invalidated, affected_scenes from canon_revisions order by created_at desc limit 20;`
and `select wardrobe_key, digest, storage_key from wardrobe_references order by created_at desc limit 20;`

## 3a. Configuration

| Variable | Effect |
|---|---|
| `WARDROBE_REFERENCES` | `0` disables the wardrobe reference pack. Otherwise stills are generated with the OpenAI image provider when `OPENAI_API_KEY` and `S3_BUCKET` are set (one per character × wardrobe × canon version; reused after). |
| `VISUAL_REVIEW` | `record` (default): contradictions are recorded as `VISUAL_REVIEW_FLAGGED` and the shot stays READY. `enforce`: a contradiction fails the shot (`VISUAL_REVIEW_FAILED`). `off`: no review. |
| `INTELLIGENCE_ROUTES` | add `visual_review=anthropic:claude-sonnet-5-5` to review on a cheaper model; default is the same model as planning. One vision call per Film IR shot. |

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
5. `wardrobe_references` has rows for the cast; `ai_decisions` has
   `visual_review` rows; `shots.qc_score` is set; any contradiction shows as
   a `VISUAL_REVIEW_FLAGGED` degradation on the project page.

## 5a. Live acceptance (W10) — run once after the deploy

On a finished Film IR film, with the deployed worker's `DATABASE_URL` and
`REDIS_URL`:

```sh
pnpm --filter @cineforge/worker canon:live-check <projectId> change.json
```

It applies the change, regenerates on the GPU, and exits 0 only if the
affected shots got new clips and cache keys, every other shot kept its exact
clip, the revision is recorded, and (for a wardrobe change) a new wardrobe
reference was generated. The same flow runs on every PR against a real
Postgres with the real Prisma client (`canon/revision.db.test.ts`, CI job
`migration-0026`), without the GPU.

## 6. Limits (carried forward)

- The live end-to-end run with the GPU has not happened: the deployed worker
  predates W1. `canon:live-check` (§5a) is the test to run after the deploy.
- The Visual Reviewer is uncalibrated, so it records by default; switch to
  `enforce` only after reviewing its flags on real films. It reviews one
  frame per shot, not motion.
- Goals and plot state are not modelled (W5 story review).
- The storyboard UI keeps its own text continuity (`apps/web/lib/continuity.ts`)
  for hand-made projects; Film IR projects use the engine.
