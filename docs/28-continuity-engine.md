# 28 — The Continuity Engine

The goal is not to generate clips. The goal is to generate a coherent **movie**.
Scenes are not isolated video generations — each one **inherits the final state
of every scene before it** and **writes its own changes**, so facts carry
forward and can never silently contradict.

## Project Memory Graph

A running, folded state built from every scene's `state_patch`:

```
characters     name → { emotion, health, wardrobe, … }
relationships  "Adisa->brother" → "distrust"
locations      "village" → "destroyed"      // can never reappear intact
world          season → "winter"            // can't become summer in scene 20
goals          "King Adisa" → "find evidence"
timeline       [ { index, heading, event } … ]
```

The engine (`packages/shared/src/continuity.ts`, mirrored client-side in
`apps/web/lib/continuity.ts`) is pure and folds scenes in index order:

```
computeContinuity(scenes) → {
  perScene: [{ index, inherited, bridgeIn, dependsOn, affects, score, notes }],
  final:    ProjectState   // includes the timeline
}
```

`inherited` for scene N is the state produced by scenes `0..N-1`.

## The Scene Bridge

Between every pair of scenes sits a bridge — the secret sauce:

```jsonc
{
  "whatJustHappened":     "Enemy invaded",
  "whatChanged":          "King loses his army",
  "whatCarriesForward":   "Fear, a thirst for revenge",
  "nextSceneRequirements":"Emergency council meeting"
}
```

The **next** scene automatically consumes the previous bridge: it appears as
"Carried forward" / "This scene must…" in the prompt preamble.

## Continuity score

Deterministic and explainable (0–100). A scene earns points for being connected
— a bridge in (25), an anchored character (25), an anchored world/location (20),
advancing state (15), a bridge out (15) — and is penalised −50 for a hard
contradiction (e.g. set in a location prior scenes destroyed). `notes` explains
every deduction in the storyboard card.

## Dependency graph

Each scene declares `depends_on` (defaults to the previous scene). The engine
back-fills `affects`, so the card shows both *depends on S4* and *affects S6*.

## How it's wired

- **Storyboard UI** (`StoryboardStudio`) folds continuity in a `useMemo` and each
  scene card shows: anchored characters/location, **inherited state** chips,
  carried-forward bridge, **continuity score**, dependencies and the **project
  timeline** — plus editable Scene Bridge + the state this scene changes
  (health, season, location status, goal).
- **Persistence** (`scenes.bridge`, `scenes.state_patch`, `scenes.depends_on`,
  `scenes.continuity_score`; migration `0009`). Prisma mirrors these on `Scene`.
- **Worker** (`video.processor`) calls `continuityPreamble(shot)` before every
  generation — it folds all prior scenes and prepends the inherited "Previous
  State" block + the incoming bridge to the shot prompt, so the rendered clip
  continues the story instead of starting fresh.

## Auto-fill (the Director proposes continuity)

Creators don't start from blank bridges. `autoContinuity(scenes)` derives a Scene
Bridge + state fields (emotion, injuries, season, destroyed locations, goals)
from each scene's script — deterministic and dependency-free, so it runs the
same in the browser and the worker:

- **Storyboard** — the **✨ Auto-fill continuity** button folds proposals across
  every scene, filling *blank fields only* (a creator's own edits are never
  overwritten), then persists the recomputed score + dependencies.
- **Director** — `DirectorService.plan` persists each scene's `bridge` +
  `state_patch` (+ `characterRef`/`locationNote`/`depends_on`), so an
  auto-generated film arrives with a populated, consistent Project Memory Graph
  from the first render. The Director asks **Claude directly** for a structured
  `bridge { … }` and `state { emotion, health, season, locationStatus, goal }`
  per scene (`director/llm.ts`); these are parsed defensively and preferred
  field-by-field, with the deterministic `autoContinuity` filling any blanks (and
  covering the no-API-key / parse-failure paths). Best of both: semantic when the
  model delivers, never empty when it doesn't. The plan is requested via **forced
  tool use** — a `submit_film_plan` tool whose `input_schema` encodes the whole
  plan (logline/bible/scenes + per-scene `bridge`/`state`), with `tool_choice`
  pinned to it — so the Director reads a schema-shaped object straight off
  `tool_use.input` (no JSON scraping). Extracting JSON from a text reply is the
  fallback, then the deterministic stub.

`statePatchFrom(fields)` is the single builder both sides use to turn flat
fields into a `state_patch`.

## Visual continuity (next)

State carries *facts* forward today. Asset-ID continuity (same `character_id` /
`wardrobe` references rather than "generate the king again") rides on the seed
frame + reference-video path already wired in docs/22 and the Library anchors;
binding a stable asset id per character/wardrobe into `state_patch` is the next
increment.
