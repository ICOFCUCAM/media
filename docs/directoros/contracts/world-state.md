# Contract — Canon, World State Engine, story graph and canon revisions (W3)

Requirements: DOS-5, 32.3–32.4, 33, 55, 56, 57, 58, 62.8–62.9, 92.
Follow-ups (same contract): story state (relationships, deaths), the wardrobe
reference pack (`world/wardrobe.ts`, `apps/worker/src/canon/wardrobe-refs.ts`,
migration 0034).
Code: `packages/movie/src/ir/schema.ts` (canon fields), `ir/validate.ts`
(canon stage), `packages/movie/src/world/` (state, graph, revise, version),
`apps/worker/src/canon/` (revision service, CLI),
`packages/db/supabase/migrations/0033_canon_revisions.sql`.

## 1. Purpose

Hold the film's canon as typed, id-keyed data; know the state of the world at
every scene; know what each character and the audience knows; keep setups and
mysteries honest; and when canon changes, know exactly what it touches so only
that is regenerated. Not responsible for shot-level checks against a request
(continuity-engine.md), cinematography continuity (W4) or locks and passes (W8).

## 2. Inputs

- The Film IR (`FilmPackage`): cast (identity, wardrobe entries), locations,
  props, **facts** (`fact_*`, `knownAtStart`), threads (`answerFactId` for
  mysteries), setups (`plantedIn`, `developedIn[]`, `paidOffIn`, `factId`),
  scenes with **storyTime** (`day`, `continuous`, `flashback`), per-character
  state (wardrobe, emotion, physical, holding), **reveals** (fact → knowers),
  dialogue lines with **references** (facts relied on); **relationships**
  (`rel_*`, pair + initial state), per-scene **relationshipChanges** and
  **deaths**.
- A `CanonChange`: `scene_wardrobe`, `wardrobe_description`, `identity`,
  `physical`, `location`, `prop`.

## 3. Outputs

- `materializeWorld(pkg)` → `WorldTimeline`: initial knowledge per knower, and
  per scene `SceneWorld` = clock, location, every character's
  present/location/wardrobe/emotion/physical/holding/knows/lastScene, every
  prop's holder and last-seen location, what the audience knows, who is
  alive (and where they died), how each relationship stands.
- `wardrobeReferenceSpec(pkg, character, wardrobe)` → the reference still's
  prompt and the sha256 digest of exactly the canon it depicts.
- `canonGraph(pkg).dependents(ref)` → scenes, shots and dialogue lines that
  depend on a character, wardrobe entry, location, prop, fact or the style.
- `reviseCanon(pkg, change)` → the revised package, canon issues, the scenes
  and shots whose compiled output changed, the graph's prediction, and the
  canon version before and after (`canonVersion`, content hash).
- Worker `applyCanonRevision` → applied/rejected, issues, affected scenes, the
  database ids of the invalidated shots.

## 4. Dependencies

`packages/movie`: zod, node:crypto, the compiler. Worker: Prisma
(screenplays, scenes, shots, characters, canon_revisions). No model calls.

## 5. Forbidden behavior

- Keying state by display name (ids only; names are labels).
- Inferring state with heuristics when the plan states it (the planner must
  state every field; omissions are schema errors).
- A canon change that silently breaks canon: it is rejected and touches nothing.
- Regenerating shots the change does not touch; keeping media for shots it does.
- Discarding a creator-uploaded seed frame on a revision.

## 6. Runtime behavior

Planning: the validator's **canon** stage (after references and story) checks
story time (backwards only in flashbacks; continuous scenes stay on the same
day), continuous action (no wardrobe change, injuries do not vanish), one
holder per prop, knowledge (a line's referenced facts are known to its speaker
by that scene; reveals go to people present), foreshadowing (development
between plant and payoff; the setup's fact is shown to the audience by the
plant), mysteries (not known at start; revealed to the audience within the
thread), story state (the dead appear only in flashbacks, die once, on screen
and in present time; relationship changes involve someone present), and every
planned shot against the world state (framed characters are
present, framed props are not with someone elsewhere). Failures feed the one
surgical revision like any other issue.

Revision: apply the change (scene-scoped changes propagate across the
continuity run — scenes joined by `storyTime.continuous`; `physical` only
forward), re-validate canon, compile before and after, diff per scene and per
shot. The worker then, in one transaction, rewrites the affected scenes'
`state_patch` and the affected shots' prompt, prompt hash, cache key and camera
plan, sets them `PENDING` and clears video, thumbnail, QC score, attempts and a
generated seed frame; and stores the revised package in `screenplays.raw`
(`canonVersion`, `revisedFrom`). A "resume" film job then regenerates only
those shots and re-assembles.

Wardrobe reference pack: for each framed character's wardrobe the worker
looks up `(character, wardrobe, digest)`; found → reused, missing → generated
once with the image provider and inserted (a concurrent duplicate resolves to
the first row), unavailable → `WARDROBE_REFERENCE_UNAVAILABLE` degradation.
The still goes ahead of identity frames in the shot request. A canon change
changes the digest, so the next generation of an affected shot gets a new
still (§62.9 "new reference pack generated").

## 7. Persistence

The canon is the package in `screenplays.raw` (with `canonVersion`). World
state is derived, never stored (it is reproducible from the package).
`canon_revisions` (0033): append-only, one row per applied or rejected change —
kind, change, from/to version, outcome, issues, affected scenes and shots,
invalidated count, actor. Old clips stay in `media_versions` history.
`wardrobe_references` (0034): append-only, one row per character, wardrobe
entry and digest.

## 8. Failure behavior

Invalid canon at planning → the plan's revision, then `DIRECTOR_OUTPUT_INVALID`.
Invalid canon change → `rejected` row, nothing written. A project without a
Film IR (planned before W2) → `CanonUnavailableError`. Missing 0033 table →
the change still applies; the row is logged only (tolerated until applied).

## 9. Observability

`canon.revision` log line per attempt; `canon_revisions` rows; the operator
dry run (`canon:revise` without `--apply`) prints the change's footprint.

## 10. Acceptance tests

`packages/movie/src/world/world.test.ts`: per-scene materialized state;
off-screen carry-forward; dropped props; continuity runs; every canon issue
(knowledge, unestablished setup, development order, spoiled and unresolved
mysteries, time regression and flashback, wardrobe change and dropped injury in
continuous action, two holders, framed-but-absent, reveal to someone absent);
pre-W3 packages parse; the model schema requires every field; **§62.8 Maya
red→blue: scenes 11 and 12 affected, scene 10 not, only Maya's shots, the
graph predicted exactly that**; wardrobe rewrite, injury propagation, location
change, rejected change.

Story state: relationships evolve and reach the preamble and the generation
context; the dead stay dead outside flashbacks; deaths and changes on screen,
once, in present time. Wardrobe pack: digests change exactly when depicted
canon changes; render-time reuse, regeneration after a canon change, recorded
gaps (`canon/wardrobe-refs.test.ts`).

## 11. Integration test

`apps/worker/src/canon/revision.test.ts` (**§62.9**): a planned project with
every shot READY; Maya's coat changes; exactly the two affected shots are
re-keyed with the new canon in their prompt, set PENDING with media dropped
(a generated seed dropped, an uploaded seed kept); every other shot keeps
status, clip and cache key; scene state carries the new wardrobe; the stored
package is versioned; one revision row. A rejected change writes nothing.
`apps/worker/src/canon/revision.db.test.ts` runs the same flow on a real
PostgreSQL through the real Prisma client — planned with the production
`persistPlan`, all twelve shots READY, Maya's coat changed: exactly the two
affected rows reset and re-keyed, the other ten untouched, the revision row
written, and two shots racing for one wardrobe reference resolve to one row
(CI job `migration-0026`). Live with the GPU: `canon:live-check` (docs/46
§5a), to run once the worker is deployed.

## 12. Production readiness

Migrations 0033–0034 applied (done 2026-10-08); `canon:live-check` passing
on live infrastructure; a creator-facing canon editor that previews the
footprint and charges for regeneration (W8); the W10 live revision test.
