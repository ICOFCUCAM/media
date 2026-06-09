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

## Visual continuity

State carries *facts* and *assets* forward. A scene's `state_patch` records the
character's stable **asset id** and **wardrobe** under `characters[name]`
(`{ id, wardrobe, emotion, health }`), so every later scene inherits the same
`id` — it references the *same* character/look rather than "generate the king
again". `StateFields.assetId` / `wardrobe` flow through the one `statePatchFrom`
builder:

- **Storyboard** — picking a Library character anchors `characterId` to that
  asset's id; a Wardrobe field carries the look. The continuity panel shows
  `✓ King Adisa · adisa_001` and `👗 royal_armor_v3`, and the inherited-state
  chips/preamble surface them on every downstream scene.
- **Director** — sets `assetId: protagonist.id` on every scene and threads the
  per-scene `wardrobe` from Claude's `state`, so an auto-planned film is visually
  anchored from scene 1.
- **Worker** — `resolveContinuity(shot)` both injects `King Adisa — id:
  adisa_001, wardrobe: royal_armor_v3, …` into the prompt **and** resolves every
  in-play asset id (inherited + this scene's) to the character's stored reference
  frames (`Character.referenceUrls`), merging them into `referenceImageKeys`
  alongside the seed (deduped, capped at 4). So the same identity drives every
  shot at the pixel level, not just in prose — and it degrades gracefully: an
  asset with no stored frames simply adds nothing.

Reference frames are an IP-adapter/identity signal; for the tightest lock the
asset id also joins to a per-character **LoRA** (`Character.loraKey`).
`resolveContinuity` resolves those too and `buildShotRequest` passes them as
`ShotRequest.loraKeys` → the self-hosted Wan/Hunyuan adapters forward them to the
GPU worker (capability `supportsLora`; external hosted APIs report `false` and
ignore them). So the full identity stack is: **prose** (preamble `id`/wardrobe) →
**seed** → **IP-adapter reference frames** → **LoRA**.

### Training the LoRA (lora-queue)

A character's LoRA is produced by the **`lora-queue`** worker:

- **Producer** — `resolveContinuity` already fetches every in-play character; any
  that has reference frames but no `loraKey` is enqueued via `enqueueLora`
  (deduped by `jobId = lora:<characterId>`), so the *next* render uses the
  trained adapter. `maybeEnqueueLoraTraining(characterId)` is the guarded entry
  point for other triggers (e.g. the moment frames are uploaded).
- **Trainer** — `LoraTrainerClient` (`buildLoraTrainer(env)`) submits the
  character's name + appearance + reference-frame URLs to `LORA_TRAINER_URL`
  (submit + poll, same "drop a key in" shape as the external video adapter) and
  returns `{ loraKey, version }`.
- **Processor** — `lora.processor` writes `Character.loraKey`/`loraVersion` back.
  Resume-safe and graceful: already-trained → no-op, no frames → skip, trainer
  unset → labelled skip (identity falls back to seed + reference frames).

The remaining work is the GPU side: a training endpoint behind `LORA_TRAINER_URL`
that consumes frames and emits a `.safetensors`, and the inference GPU worker
honoring `loraKeys` at load time.
