# 05 — Director AI

The Director AI is the film producer. It turns one prompt into a fully
structured, production-ready plan and orchestrates the pipeline.

## Responsibilities
1. **Screenplay generation** — logline, synopsis, acts, scenes, dialogue.
2. **Character & location extraction** — populate the Character/World Bibles.
3. **Scene planning** — break the story into N scenes sized to hit the target
   duration.
4. **Shot planning** — decompose each scene into shots with camera direction.
5. **Continuity enforcement** — initialize and constrain continuity state.
6. **Cinematic direction** — genre, tone, pacing, color, music cues.

## How duration maps to structure
Target seconds → scene/shot budget (deterministic, then LLM fills content):

```
targetSeconds = 1800 (30 min)
avgSceneSec   = 18           # tunable per genre/pacing
=> scenes     ≈ 100
avgShotSec    = 5            # model clip length (Wan 2.1 ~5s)
shotsPerScene ≈ ceil(avgSceneSec / avgShotSec) = 4
=> shots      ≈ 400
```

So "a 30-minute historical movie" → ~100 scenes, ~400 shots, each a production
unit. The Director emits `Scene 1 … Scene 100` with complete instructions.

## Pipeline stages (multi-pass LLM)

```mermaid
flowchart TB
  P[Prompt + targetSeconds] --> S1[Pass 1: Concept]
  S1 --> S2[Pass 2: Beat sheet / acts]
  S2 --> S3[Pass 3: Scene list with headings + summaries]
  S3 --> S4[Pass 4: Bible extraction - characters, locations, objects]
  S4 --> S5[Pass 5: Per-scene shot list + camera + dialogue]
  S5 --> S6[Pass 6: Continuity seeding]
  S6 --> OUT[Persisted screenplay + scenes + shots]
```

Multi-pass keeps each LLM call small and structured (avoids one giant
unreliable generation) and lets long films stream scene-by-scene to the queue
as soon as the scene list exists.

## LLM provider
Uses Claude (Anthropic API) as the reasoning model for planning. The client
lives in `apps/api/src/director/llm.ts`. Default model: latest Claude (see
`docs/claude-api` guidance / repo skill). Structured output is enforced with
**tool/JSON schemas** so every pass returns validated objects.

> When wiring the LLM client, consult the `claude-api` skill for current model
> ids, structured-output (tool use), and prompt-caching guidance — do not
> hardcode model ids from memory.

## Output contracts (zod, in `packages/shared`)

```ts
// Scene as produced by the Director
const ScenePlan = z.object({
  index: z.number().int(),
  heading: z.string(),                  // "EXT. SAVANNA - DAWN"
  summary: z.string(),
  locationRef: z.string(),              // World Bible name/id
  timeOfDay: z.string().optional(),
  weather: z.string().optional(),
  characterRefs: z.array(z.string()),   // Character Bible names/ids
  dialogue: z.array(z.object({
    character: z.string().nullable(),
    text: z.string(),
    emotion: z.string().optional(),
  })),
  shots: z.array(z.object({
    index: z.number().int(),
    description: z.string(),
    shotSize: z.enum(["EWS","WS","MS","MCU","CU","ECU"]),
    movement: z.enum(["static","pan","tilt","dolly","crane","handheld","drone"]),
    angle: z.enum(["eye","low","high","dutch","overhead"]),
    lens: z.string().optional(),        // "35mm", "anamorphic"
    durationSec: z.number(),
  })),
});
```

## Camera planning
Each shot carries a `cameraPlan` (size/movement/angle/lens). The Prompt Builder
([09](09-scene-pipeline.md)) translates this into model-specific prompt tokens
and motion strength, so cinematic intent survives into generation.

## Orchestration (worker)
`film.processor.ts` runs the Director, persists screenplay + bibles, then uses
a **BullMQ flow** to fan out one `scene-job` per scene with a parent
`render-job` that waits for all children ([13](13-queues.md)).

## Implementation checklist
- [ ] LLM client with retry + JSON-schema validation
- [ ] 6-pass prompt templates + caching of system/context
- [ ] Duration→structure planner (configurable per genre)
- [ ] Persist + emit `project.progress` per pass
- [ ] Idempotency: re-running a pass is safe (upsert by index)
