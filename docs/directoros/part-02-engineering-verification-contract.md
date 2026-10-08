# Part 2 — Engineering & Verification Contract, Intelligence Layer, and own image layer

Received 2026-10-08. Recorded in full, in the author's order. Section numbers
continue from Part 1 (which ended at 59), so every requirement ID across all
parts is unique (`DOS-<section>.<n>`). The text itself is not shortened.

Omitted from the record, and only these: two advertisements that came with the
pasted text ("Workato — Embedded Integrations at Scale …" and "MarsBased SL —
AI-Augmented Development …"). They are not part of the specification.

The part has three movements:

- **A. §60–82:** the move from architecture to an executable, verifiable
  engineering contract (Reality Gate, No Fake Completion, No Silent Degradation,
  Capability Registry, phased execution, the ultimate end-to-end test).
- **B. §83–100:** the author's question about not calling ChatGPT/Claude many
  times, and the resulting Intelligence Layer + AI Production Compiler ("One-Pass
  Intelligence / Multi-Pass Execution"), including the instruction text for Claude.
- **C. §101–107:** the author's question "must I use OpenAI image when I am building
  my own image layer?" — no; the LLM is the brain, CineForge's own image layer
  (ComfyUI and models) is the execution layer.

---

# A. From architecture to an executable engineering contract

## 60. The critical issue to correct before giving Claude the architecture

**DOS-60.1** The Part 1 architecture is conceptually strong but **not yet strict
enough to guarantee a high-quality implementation**. It describes what the system
should do, but Claude can still interpret parts of it as:

> "Create the folders, interfaces, API endpoints and UI, and make something that
> appears to work."

That is exactly how you end up with a beautiful architecture that is **wired but
not functional**.

**DOS-60.2 The real problem: three different levels to distinguish.**

```
LEVEL 1
ARCHITECTURE
"What components should exist?"

        ↓

LEVEL 2
ENGINEERING CONTRACT
"What must each component actually do?"

        ↓

LEVEL 3
PROOF / ACCEPTANCE TEST
"What test proves that it really works?"
```

**DOS-60.3** The previous architecture was mostly Level 1, with some Level 2. It
must be taken to **Level 3**.

## 61. The CineForge DirectorOS Implementation Contract

**DOS-61.1** Create a **CineForge DirectorOS Implementation Contract**, not merely
an architecture document.

**DOS-61.2** Every job description must have:

1. **Purpose:** what the component is responsible for.
2. **Inputs:** exactly what it receives.
3. **Outputs:** exactly what it must produce.
4. **Dependencies:** what it may call.
5. **Forbidden behavior:** what it must NOT do.
6. **Runtime behavior:** what actually happens when it runs.
7. **Persistence:** what gets stored.
8. **Failure behavior:** what happens when something fails.
9. **Observability:** what must be logged/measured.
10. **Acceptance tests:** a test that proves the feature is real.
11. **Integration test:** a test proving it works with the other components.
12. **Production readiness criteria:** the exact conditions under which Claude is
    allowed to call it complete.

That changes everything.

## 62. Example — Character Continuity Engine

**DOS-62.1 The weak specification would be:**

> Build a character continuity engine that maintains character consistency
> between scenes.

Claude can easily produce:

```
CharacterContinuityService
    ↓
checkCharacter()
    ↓
return true
```

Everything looks wired. But nothing meaningful happens.

**DOS-62.2 The specification should instead say:**

### CHARACTER CONTINUITY ENGINE — IMPLEMENTATION CONTRACT

**DOS-62.3 Responsibility.** The engine must maintain canonical character state
across the entire Film IR and prevent downstream media generation from violating
approved character state.

**DOS-62.4 Required inputs**

```ts
interface CharacterContinuityInput {
    filmId: string;
    sceneId: string;
    shotId: string;
    characterId: string;
    worldStateVersion: string;
    characterStateVersion: string;
    requestedGeneration: GenerationRequest;
}
```

**DOS-62.5 Required checks.** The engine MUST compare:

```
canonical face identity
canonical age
hair
wardrobe
accessories
injuries
body state
emotional state
location
time
known possessions
character knowledge
```

against the requested shot.

**DOS-62.6 Required output**

```ts
interface ContinuityResult {
    passed: boolean;

    violations: ContinuityViolation[];

    requiredReferences: AssetReference[];

    correctedGenerationContext: GenerationContext;

    severity: "none" | "warning" | "blocking";
}
```

**DOS-62.7 Forbidden.** The engine must never return:

```
{ passed: true }
```

merely because the requested character exists. It must actually evaluate the
applicable canonical state.

**DOS-62.8 Acceptance test.** Given:

```
Maya
Scene 10:
red coat

Scene 11:
red coat

Scene 12:
user changes canonical wardrobe to blue coat
```

the engine must identify Scene 11 and Scene 12 as affected according to their
dependency graph.

**DOS-62.9 Integration test.** Change Maya's canonical wardrobe. Then verify:

```
affected shots identified
        ↓
old generation assets invalidated
        ↓
new reference pack generated
        ↓
new media jobs created
        ↓
unaffected shots NOT regenerated
```

**DOS-62.10** If that doesn't happen, the feature is **NOT IMPLEMENTED**. That is
the level of specification Claude needs.

## 63. This applies to EVERY major subsystem

**DOS-63.1** DirectorOS should not merely contain:

```
Director
Story Engine
Scene Planner
Shot Planner
Prompt Compiler
Continuity
QC
Editor
```

Each one needs a contract.

## 64. The Director — contract

**DOS-64.1** Not "The Director creates the movie." Instead:

```
DIRECTOR CONTRACT

INPUT
    User creative brief
    Film constraints
    Existing Film IR

OUTPUT
    FilmPlan

MUST
    create/modify canonical story state
    invoke Story Engine
    invoke Scene Planner
    maintain film constraints
    never directly invoke GPU
    never directly generate media
    never bypass validation

MUST NOT
    invent asset IDs
    bypass Film IR
    modify locked scenes
    issue raw FFmpeg commands
    select GPUs

PROOF
    Given a 10-minute movie request:
        Film Bible exists
        Story Graph exists
        Characters have IDs
        Locations have IDs
        Scenes have IDs
        dependencies exist
        Film IR validates
```

## 65. Story Engine — proof

**DOS-65.1** It needs to prove:

```
ACTS EXIST
        ↓
SEQUENCES EXIST
        ↓
SCENES EXIST
        ↓
PLOT THREADS EXIST
        ↓
CHARACTER ARCS EXIST
        ↓
SETUPS HAVE PAYOFFS
        ↓
STORY HAS CAUSALITY
```

Not merely:

```
GPT returned screenplay text.
```

## 66. Scene Architect — proof

**DOS-66.1** Must prove:

```
Every scene has:
    narrative purpose
    location
    time
    characters
    state
    emotional arc
    beats
    estimated duration
    shot requirements
```

**DOS-66.2** And:

```
scene duration
=
sum of shot durations
```

unless an explicit timing mechanism says otherwise.

## 67. Shot Architect — proof

**DOS-67.1** Must prove:

```
Every shot has:

shot ID
scene ID
duration
camera
lens
movement
composition
subject
action
continuity state
audio cues
transition
generation requirements
```

**DOS-67.2** Then:

```
sum(shots)
=
scene timeline
```

**DOS-67.3** This connects directly to the Master Production Clock work already
identified in the existing media-engine architecture.

## 68. Prompt Compiler — strict protection

**DOS-68.1** This one especially needs strict protection. Claude could easily
implement:

```
compilePrompt()
```

that simply concatenates strings. That would technically work but produce
mediocre results.

**DOS-68.2** Instead:

```
Canonical Film State
        +
Shot Intent
        +
Cinematography
        +
Character Reference
        +
Location Reference
        +
Lighting
        +
Continuity
        +
Model Capability
        ↓
Prompt Compiler
        ↓
Model-specific generation specification
```

**DOS-68.3** And it needs tests. For example: if Maya is wearing a red coat in the
canonical state, the compiled request must contain the canonical wardrobe
constraint **or an equivalent structured reference**.

**DOS-68.4** Not necessarily literally the words "red coat", because the actual
model adapter may use reference images/conditioning instead. That's important.

## 69. The Image Engine — contract

**DOS-69.1** This is where "wired but not functional" becomes particularly
dangerous. The job description cannot be "Generate an image using the configured
image model." It must define:

```
INPUT
    ShotSpec
    ReferencePack
    ModelSpec

PROCESS
    resolve references
    construct generation request
    execute model
    save candidates
    register artifacts
    return metadata

OUTPUT
    actual generated files
    dimensions
    model
    model revision
    seed where supported
    generation parameters
    artifact checksum
    execution time
```

**DOS-69.2** Then test:

```
submit image job
        ↓
actual model executes
        ↓
actual image file exists
        ↓
image is readable
        ↓
dimensions correct
        ↓
artifact registered
        ↓
checksum exists
        ↓
job marked completed
```

**DOS-69.3** If Claude mocks the generation response:

```json
{
  "status": "completed",
  "url": "..."
}
```

without an actual image, the test fails.

## 70. The critical principle — never self-certify

**DOS-70.1** Never allow a component to prove itself by returning its own claimed
status.

**DOS-70.2** Bad:

```ts
const result = await generator.generate();

if (result.status === "completed") {
   markJobCompleted();
}
```

The generator could return "completed" without producing valid media.

**DOS-70.3** Better:

```
generator reports completion
        ↓
artifact exists
        ↓
artifact readable
        ↓
media metadata inspected
        ↓
checksum calculated
        ↓
technical QC passes
        ↓
ONLY THEN:
job = COMPLETED
```

That is how fake functionality is prevented.

## 71. The same applies to Audio

**DOS-71.1** The existing audio requirements become **machine-enforced acceptance
criteria**, not documentation. For example:

```
Narration requested: 5.0 sec
Picture: 3.0 sec
```

The system must have a defined timeline policy. It must not allow FFmpeg to
accidentally decide:

```
output = min(audio, video)
```

**DOS-71.2** The previous bug demonstrated why this matters: the film mux and
dubbing pipeline must measure picture and narration independently and prevent
FFmpeg from silently cutting the film to whichever stream is shorter.

**DOS-71.3** That should be an **automated regression test forever**.

## 72. DirectorOS needs the same philosophy — zero hidden TODO functionality

**DOS-72.1** The Movie Layer should have zero "TODO" functionality hidden behind
interfaces. Claude should not be allowed to write:

```ts
// TODO: implement continuity analysis
return [];
```

or:

```ts
// placeholder for AI evaluation
return { score: 1 };
```

or:

```ts
// future integration
return true;
```

**DOS-72.2** Those should cause the **build/verification process to fail**.

## 73. The REALITY GATE

**DOS-73.1** Every CineForge subsystem has a status:

```
DESIGNED
SCAFFOLDED
WIRED
FUNCTIONAL
INTEGRATED
VALIDATED
PRODUCTION_READY
```

**DOS-73.2** Claude must never call something "complete" merely because it is
wired. For example:

```
Prompt Compiler

Architecture      ✓
Implementation    ✓
Unit tests        ✓
Real model test   ✓
Continuity test   ✓
Production test   ✓

STATUS:
PRODUCTION_READY
```

versus:

```
Architecture      ✓
Implementation    ✓
Unit tests        ✓
Real model test   ✗

STATUS:
WIRED_NOT_FUNCTIONAL
```

That distinction is enormously important.

## 74. The "No Fake Completion" rule

**DOS-74.1** At the top of Claude's implementation instructions:

> **NO FAKE COMPLETION RULE**
>
> A feature is not complete because:
>
> - its TypeScript/Python compiles;
> - an API endpoint exists;
> - a database table exists;
> - a UI button works;
> - an object is returned;
> - a job changes to `completed`;
> - a mock provider returns successfully;
> - a placeholder implementation exists;
> - an interface has been connected.
>
> A feature is complete only when its real underlying operation has executed
> successfully and an independent acceptance test verifies the resulting
> artifact/state.

That single rule will change the quality of Claude's implementation considerably.

## 75. The "No Silent Degradation" rule

**DOS-75.1** If a required capability is unavailable, the system must report
`NOT_IMPLEMENTED`, `UNAVAILABLE`, or `FAILED` rather than silently substituting a
mock, placeholder, empty result, fake success, or lower-quality behavior.

**DOS-75.2** Especially important for:

```
image generation
video generation
audio generation
continuity
QC
GPU routing
model loading
storage
rendering
```

## 76. REAL provider tests

**DOS-76.1** If CineForge says:

```
Image Provider: ComfyUI
```

the integration test must actually submit a ComfyUI workflow and verify the
resulting file.

**DOS-76.2** ComfyUI should remain the generation engine rather than Claude
recreating it. That should remain a **hard architectural boundary** (the author
notes this was already decided).

**DOS-76.3** Likewise `Wan` must actually generate. Not:

```
WanProvider.generate()
→ fake URL
```

## 77. The Capability Registry

**DOS-77.1** Every subsystem must declare what is actually operational. For
example:

```json
{
  "capability": "video_generation",
  "provider": "wan",
  "status": "production_ready",
  "realExecution": true,
  "requiresGpu": true,
  "supports": [
    "720p",
    "1080p"
  ]
}
```

Another:

```json
{
  "capability": "character_identity_qc",
  "status": "experimental",
  "realExecution": true
}
```

Another:

```json
{
  "capability": "lora_training",
  "status": "disabled",
  "realExecution": false
}
```

**DOS-77.2** That is much safer than pretending everything exposed in the UI is
functional. The existing architecture already identified a stub LoRA trainer as a
problem; this capability-state approach prevents such stubs from masquerading as
production features.

## 78. The UI obeys the Capability Registry

**DOS-78.1** If:

```
video_generation = production_ready
```

show:

```
Generate Video
```

If:

```
cinematic_generation = experimental
```

show:

```
Experimental
```

If:

```
lora_training = disabled
```

do not present a functional-looking training button.

## 79. How to make Claude work differently

**DOS-79.1** Don't tell Claude "Build DirectorOS." Tell it:

> "Implement DirectorOS according to the following executable engineering
> contract. You are not permitted to claim a subsystem functional until the
> specified acceptance tests have executed against the real implementation. Do not
> replace unavailable functionality with mocks or placeholders. Every external
> integration must have a real integration test. Every media-producing capability
> must produce and independently validate a real artifact."

Then give it the contracts.

## 80. Claude works in phases

**DOS-80.1** Not `"Build everything."` That is where quality collapses. Instead:

**DOS-80.2 PHASE 0 — AUDIT.** Claude examines the existing repository. No
implementation. Produces:

```
existing components
existing APIs
existing database
existing workers
existing media pipeline
existing tests
existing mocks
existing stubs
existing TODOs
existing dead paths
```

**DOS-80.3 PHASE 1 — CONTRACT.** Define:

```
Film IR
schemas
interfaces
state machines
events
database
queues
capabilities
```

Run schema tests.

**DOS-80.4 PHASE 2 — CANON.** Implement:

```
Film Bible
Character Bible
World Bible
Prop Bible
World State
Character State
Story Graph
Dependency Graph
```

Real persistence tests.

**DOS-80.5 PHASE 3 — STORY.** Implement:

```
Director
Story Engine
Scene Architect
Shot Architect
```

with structured outputs and validation.

**DOS-80.6 PHASE 4 — MEDIA.** Wire:

```
Image
Video
Audio
ComfyUI
Wan
FFmpeg
```

against real providers.

**DOS-80.7 PHASE 5 — QC.** Implement:

```
Continuity
Visual QC
Audio QC
Technical QC
```

**DOS-80.8 PHASE 6 — COMPILER.**

```
Film IR
 ↓
Shot IR
 ↓
Media Jobs
 ↓
Timeline
 ↓
Master
```

**DOS-80.9 PHASE 7 — ELASTIC GPU.** Then connect the architecture designed earlier:

```
DirectorOS
 ↓
Job Orchestrator
 ↓
GPU Scheduler
 ↓
RunPod Serverless
 ↓
real worker
```

**DOS-80.10 PHASE 8 — END-TO-END.** One complete movie. Not 100 mocked scenes. One
actual short film from prompt → final MP4. That becomes the ultimate proof.

## 81. The ultimate acceptance test

**DOS-81.1** Claude receives:

> Create a 3-minute cinematic short film about a woman arriving at an abandoned
> railway station at night and discovering that someone has left a message for
> her.

CineForge must actually perform:

```
USER BRIEF
     ↓
DIRECTOR
     ↓
FILM BIBLE
     ↓
CHARACTERS
     ↓
LOCATION
     ↓
STORY
     ↓
SCENES
     ↓
SHOTS
     ↓
REFERENCE PACKS
     ↓
REAL IMAGE GENERATION
     ↓
REAL VIDEO GENERATION
     ↓
REAL VOICE GENERATION
     ↓
REAL AMBIENCE/SFX
     ↓
REAL TIMELINE
     ↓
CONTINUITY QC
     ↓
AUDIO QC
     ↓
VIDEO QC
     ↓
FFMPEG MASTER
     ↓
FINAL MP4
```

**DOS-81.2** Then automatically verify:

```
✓ file exists
✓ MP4 readable
✓ expected duration
✓ expected resolution
✓ expected FPS
✓ audio present
✓ audio/video synchronized
✓ loudness valid
✓ no corrupt frames
✓ scenes present
✓ shots present
✓ character continuity
✓ location continuity
✓ generated assets registered
✓ provenance recorded
✓ no failed jobs hidden
```

**DOS-81.3** Only then can Claude report:

```
END_TO_END_MOVIE_PIPELINE: PASS
```

That is a very different standard from "I implemented the movie generation
architecture."

## 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol

**DOS-82.1** The previous architecture + job descriptions are **not yet the final
implementation specification**. The architecture is strong and the direction is
correct, but diagrams and feature descriptions leave too much interpretation room.

**DOS-82.2** A second document sits underneath the architecture: **CineForge
DirectorOS — Engineering & Verification Contract**. It defines every job, from
Director down to FFmpeg, in terms of:

```
RESPONSIBILITY
INPUT
OUTPUT
STATE
DEPENDENCIES
REAL EXECUTION
FAILURE
SECURITY
TELEMETRY
PERSISTENCE
ACCEPTANCE TEST
INTEGRATION TEST
NEGATIVE TEST
PERFORMANCE TEST
PRODUCTION-READY CRITERIA
```

**DOS-82.3** Add a **Claude Execution Protocol** that explicitly prevents:

```
placeholder implementations
fake success
mocked production paths
silent fallbacks
empty TODO implementations
unverified integrations
UI-only functionality
"wired but not functional"
```

That is the missing layer.

**DOS-82.4** We shouldn't merely tell Claude what CineForge should be. Write the
specification so that Claude has very little freedom to implement something
inferior and call it finished.

**DOS-82.5** Apply exactly the same discipline to the existing
`docs/38-media-engine-architecture.md` and its v2.4/v2.6 work: architecture first,
then enforceable runtime contracts, then real integration/acceptance tests, with
**no implementation declared complete without proof**.

---

# B. One master reasoning request — the Intelligence Layer and AI Production Compiler

## 83. The author's question

**DOS-83.1** Verbatim:

> "it would be good for chat gpt api not to call several times. can they be a chat
> gpt layer where based on the inscription or prompts the engine will generate a
> prompt that will cause chatpgt or claude to generate the required information,
> text, images and design for what is required? Can you elaborate if you
> understand?"

**DOS-83.2** Answer: yes, and this is a better architecture than DirectorOS making
many separate ChatGPT/Claude calls. It is an **AI instruction/compiler layer
between CineForge and the external AI models**:

> CineForge gives the AI layer one high-level production requirement. The AI layer
> understands what is needed, builds the complete structured production request,
> and then makes the minimum number of intelligent model calls necessary to
> produce all the required outputs.

**DOS-83.3 Important distinction.** We can minimise reasoning-model calls
dramatically, but one ChatGPT call cannot literally generate 40 independent images
from CineForge's own GPU engine. Actual image/video/audio generation is a separate
execution workload. What one high-value Director/Planner call **can** do is
generate the entire production specification for those 40 assets; CineForge then
executes those assets locally/in parallel.

**DOS-83.4 (author's note)** OpenAI's current Responses API is well suited to this
because a single response can produce structured output and invoke
tools/functions, while maintaining state across interactions.
Source cited: <https://developers.openai.com/api/reference/responses/overview>

## 84. Conventional vs recommended call pattern

**DOS-84.1 Instead of** this (expensive, slow, potentially inconsistent):

```
User
 ↓
GPT call → write story
 ↓
GPT call → write characters
 ↓
GPT call → write scene 1
 ↓
GPT call → write scene 2
 ↓
GPT call → write shot 1
 ↓
GPT call → write shot 2
 ↓
GPT call → create image prompt
 ↓
GPT call → create another image prompt
 ↓
Claude call → fix continuity
 ↓
GPT call → fix audio
```

**DOS-84.2 Recommended:**

```
                    USER
                     │
                     ▼
             ┌─────────────────┐
             │ CINEFORGE AI    │
             │ DIRECTOR LAYER  │
             └────────┬────────┘
                      │
                 ONE MAJOR
              PLANNING REQUEST
                      │
                      ▼
             ┌─────────────────┐
             │ PRODUCTION      │
             │ COMPILER        │
             └────────┬────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
     STORY          VISUAL         AUDIO
     PLAN            PLAN           PLAN
        │             │             │
        └─────────────┼─────────────┘
                      ▼
              CINEFORGE FILM IR
                      │
                      ▼
             LOCAL EXECUTION
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
     IMAGE           VIDEO          AUDIO
     ENGINE          ENGINE         ENGINE
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                 QC / EDIT
```

## 85. The key innovation — CineForge AI Production Compiler

**DOS-85.1** A component called **CineForge AI Production Compiler**, distinct from
the Director:

- The **Director** understands filmmaking.
- The **Production Compiler** understands how to turn the Director's decision into
  executable work.

**DOS-85.2 Example.** The user says:

> Create a 5-minute cinematic science-fiction film about a woman who lands on Mars
> and discovers an abandoned research station.

Instead of immediately asking GPT "Write the screenplay", CineForge sends **one
carefully constructed master request** containing:

```
CINEFORGE PRODUCTION REQUEST

Project:
Mars Station

Duration:
5 minutes

Genre:
Science fiction thriller

Quality:
Cinematic

Requirements:
- professional screenplay
- character development
- visual continuity
- cinematic shot design
- image references
- video requirements
- dialogue
- voice requirements
- music
- sound effects
- environment
- lighting
- camera language
- scene timing
- continuity
```

**DOS-85.3** The model returns a structured **Film Production Package**:

```json
{
  "film": {},
  "characters": [],
  "locations": [],
  "world_rules": [],
  "story_structure": [],
  "scenes": [],
  "shots": [],
  "dialogue": [],
  "visual_design": [],
  "image_requests": [],
  "video_requests": [],
  "voice_requests": [],
  "music_requests": [],
  "sfx_requests": [],
  "continuity_rules": [],
  "timeline": []
}
```

**DOS-85.4** This is extremely important: the LLM isn't producing "a screenplay". It
is producing an **executable production plan**.

## 86. Then CineForge takes over

**DOS-86.1** Suppose GPT produces:

```
12 scenes
64 shots
19 characters/assets
31 images
24 video clips
18 dialogue clips
12 SFX
6 music cues
```

CineForge does **not** make another 100 GPT calls. It compiles those instructions
into jobs:

```
JOB 001 → image
JOB 002 → image
JOB 003 → video
JOB 004 → voice
JOB 005 → image
...
```

Then CineForge's own engines execute them.

**DOS-86.2 This dramatically reduces API calls.** The conventional approach:

```
100 assets
×
2–3 LLM calls
=
200–300 LLM calls
```

This architecture:

```
1 master production call
        +
possibly 1 targeted revision call
        +
media generation calls
```

The expensive reasoning model is used primarily for high-level intelligence, not
repetitive prompt-writing.

## 87. Film IR as the contract between AI and CineForge

**DOS-87.1** The master call should not simply return huge raw JSON. It produces
**Film IR** (Film Intermediate Representation), a structured production language:

```
FILM
 ├── CHARACTERS
 ├── LOCATIONS
 ├── WORLD
 ├── ACTS
 ├── SCENES
 ├── SHOTS
 ├── AUDIO
 ├── VISUAL
 └── TIMELINE
```

This becomes the **contract between AI and CineForge**.

**DOS-87.2 Compiler analogy (to help Claude understand).** A programmer writes:

```
for each character...
```

The compiler turns that into machine instructions. Similarly:

```
User:
"Make a cinematic film about..."
```

becomes:

```
DirectorOS
      ↓
Film IR
      ↓
Production Compiler
      ↓
Media Jobs
      ↓
GPU
```

**DOS-87.3**

- The LLM does not control the GPU.
- The LLM does not control FFmpeg.
- The LLM does not directly manipulate the database.
- The LLM produces instructions **in CineForge's language**.

**DOS-87.4 This also solves the "Claude is average" problem.** Claude doesn't get
to decide "I'll implement whatever seems reasonable." Claude has to implement the
CineForge language specification. For example:

```
FilmIR
SceneIR
ShotIR
CharacterIR
AudioCueIR
MediaRequestIR
ContinuityIR
```

are strict schemas. Claude's job becomes: **implement the interpreter/compiler for
this specification**. That is much harder to mess up.

## 88. Provider-neutral Intelligence Layer and model router

**DOS-88.1** Do not call it `ChatGPT Layer`. Call it **CineForge Intelligence
Layer**:

```
                    CINEFORGE INTELLIGENCE
                              │
               ┌──────────────┼──────────────┐
               │              │              │
            OpenAI          Claude         Local
               │              │            Models
               └──────────────┼──────────────┘
                              │
                         Film IR
```

The system can choose the best reasoning provider.

**DOS-88.2 Model Router** (`AI Router`):

```
task                    provider

film planning            best reasoning model
screenwriting            best writing model
visual design            best multimodal model
continuity               best reasoning model
image generation         own image engine
video generation         own video engine
voice                    own audio engine
music                    own audio engine
```

**DOS-88.3** Do not pay GPT to do work CineForge's own infrastructure can already
do.

## 89. Don't ask GPT to create actual images if the own engine is better

**DOS-89.1** The LLM decides:

```
WHAT IMAGE IS REQUIRED
```

CineForge's image engine does:

```
CREATE THE IMAGE
```

For example:

```json
{
  "assetId": "img_042",
  "type": "cinematic_reference",
  "subject": "Maya",
  "location": "Mars Station",
  "camera": "50mm medium close-up",
  "lighting": "cold emergency lighting",
  "emotion": "fear",
  "continuityRefs": [
    "char_maya_v3",
    "loc_mars_station_v2"
  ],
  "generationTier": "cinematic"
}
```

Then:

```
Production Compiler
       ↓
ComfyUI / Flux / your image engine
       ↓
GPU
       ↓
actual image
```

## 90. The LLM is the "brain"; the infrastructure is the "hands"

**DOS-90.1**

```
                CINEFORGE
                    │
          ┌─────────▼─────────┐
          │       BRAIN       │
          │ Intelligence Layer│
          └─────────┬─────────┘
                    │
              instructions
                    │
          ┌─────────▼─────────┐
          │      COMPILER     │
          └─────────┬─────────┘
                    │
              executable jobs
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
     IMAGE        VIDEO        AUDIO
     ENGINE       ENGINE       ENGINE
       │            │            │
       └────────────┼────────────┘
                    ▼
                  FILM
```

## 91. Changes don't regenerate everything (and don't re-call the AI)

**DOS-91.1** The user says "Make the station much darker." CineForge checks the
dependency graph:

```
Station lighting
       │
       ├── Scene 1
       ├── Scene 2
       ├── Scene 5
       ├── Scene 8
       └── Scene 11
```

Only those assets need regeneration. **No need to call GPT again to rewrite the
whole film.**

**DOS-91.2** The user says "Make Maya's hair shorter." CineForge:

```
Character Maya
       ↓
appearance state changed
       ↓
dependency graph
       ↓
affected shots
       ↓
affected image/video jobs
```

Then regenerates only those.

## 92. Film State — the database is the source of truth

**DOS-92.1** The AI layer maintains **FILM STATE**, containing:

```
Story state
Character state
World state
Location state
Prop state
Visual state
Audio state
Timeline state
Asset state
```

**DOS-92.2** The next AI request receives **only the relevant state**, not the
entire history. That saves tokens and improves consistency.

**DOS-92.3** No permanent giant ChatGPT conversation. Instead:

```
Film Database
       ↓
State Compiler
       ↓
Relevant Context
       ↓
LLM
       ↓
Structured Film IR
```

The database is the source of truth. The LLM is the reasoning engine.

## 93. One Master Call + Surgical Calls

**DOS-93.1 Initial creation:** `1 MASTER LLM CALL` generates:

```
Film Bible
Story
Characters
Locations
Scenes
Shots
Audio plan
Visual plan
Timeline
```

Then CineForge executes.

**DOS-93.2 Later, only if necessary:** a `TARGETED LLM CALL`. Examples:

```
"Scene 12 doesn't pass continuity."

"Rewrite this dialogue."

"Improve the ending."

"Create a replacement shot."

"Fix pacing."
```

**DOS-93.3** So instead of `LLM call, LLM call, LLM call, …` you get:

```
MASTER
   ↓
EXECUTE
   ↓
VALIDATE
   ↓
ONLY CALL AI WHEN SOMETHING ACTUALLY REQUIRES REASONING
```

## 94. Tool definitions — proposed, validated, then executed

**DOS-94.1** The master AI request can include tool definitions. For example the
Director has access to:

```
create_character()
create_location()
create_scene()
create_shot()
query_character()
query_world_state()
create_media_job()
request_continuity_check()
```

**DOS-94.2 (author's note)** OpenAI's current Responses API supports function
calling for connecting the model to application functionality.
Source cited: <https://developers.openai.com/api/reference/responses/overview>

**DOS-94.3** But do not let the model freely execute arbitrary functions. Instead:

```
LLM
 ↓
proposed Film IR
 ↓
CineForge validator
 ↓
approved operations
 ↓
execution
```

This gives control.

## 95. Images are a special case

**DOS-95.1 (author's note)** With OpenAI's current Responses API, a model can use
an image-generation tool as part of a response, and the result can be returned in
the same response workflow.
Source cited: <https://developers.openai.com/api/docs/guides/tools-image-generation>

**DOS-95.2** But the image engine stays **provider-neutral**, because these must
all be interchangeable:

```
OpenAI image
ComfyUI
Flux
Wan
future model
your own GPU model
```

**DOS-95.3** DirectorOS says:

```
I need asset IMAGE_042
```

and the **Media Router** decides how to make it.

## 96. The revised architecture

**DOS-96.1** The previous architecture is modified to:

```
                         USER
                           │
                           ▼
                ┌────────────────────┐
                │ CINEFORGE           │
                │ INTELLIGENCE LAYER  │
                └──────────┬─────────┘
                           │
                     MASTER REQUEST
                           │
                           ▼
                ┌────────────────────┐
                │ AI DIRECTOR        │
                │ / REASONING MODEL  │
                └──────────┬─────────┘
                           │
                     STRUCTURED
                       FILM IR
                           │
                           ▼
                ┌────────────────────┐
                │ FILM IR VALIDATOR  │
                └──────────┬─────────┘
                           │
                           ▼
                ┌────────────────────┐
                │ PRODUCTION         │
                │ COMPILER           │
                └──────────┬─────────┘
                           │
              ┌────────────┼─────────────┐
              │            │             │
              ▼            ▼             ▼
          IMAGE JOBS    VIDEO JOBS    AUDIO JOBS
              │            │             │
              ▼            ▼             ▼
          IMAGE ENGINE   VIDEO ENGINE  AUDIO ENGINE
              │            │             │
              └────────────┼─────────────┘
                           ▼
                    MEDIA ARTIFACTS
                           │
                           ▼
                    QUALITY CONTROL
                           │
                  ┌────────┴────────┐
                  │                 │
                 PASS             FAIL
                  │                 │
                  ▼                 ▼
               TIMELINE       TARGETED AI CALL
                  │                 │
                  │                 ▼
                  │            REVISE IR
                  │                 │
                  └─────────────────┘
                           │
                           ▼
                       MASTER FILM
```

## 97. The most important rule — call AI only when reasoning is required

**DOS-97.1** The AI should not be called because a piece of the pipeline exists. It
should be called because reasoning is actually required.

**DOS-97.2 No AI call needed** (deterministic):

```
resize image
encode MP4
normalize audio
calculate duration
extract frames
upload file
calculate checksum
route GPU
render timeline
```

**DOS-97.3 AI call needed:**

```
invent story
rewrite dialogue
solve continuity conflict
design scene
choose cinematography
interpret creative direction
evaluate artistic mismatch
```

This saves money and makes the system much more reliable.

## 98. Batch reasoning

**DOS-98.1** Suppose there are 30 shots. Don't do `30 GPT calls`. Give the model the
entire scene/sequence and request:

```
Generate the complete shot plan for all shots.
```

Structured output:

```
shots: [
   {...},
   {...},
   {...}
]
```

Then CineForge executes the 30 media jobs independently.

**DOS-98.2 (author's note)** Structured Outputs are designed specifically to make
this kind of machine-consumable response reliable by enforcing a supplied schema
rather than merely asking for JSON.
Source cited: <https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses>

## 99. Name — CineForge One-Pass Intelligence / Multi-Pass Execution

**DOS-99.1** Not literally one API call for the entire movie in every situation,
because very large films eventually exceed context/output limits and some
revisions genuinely require another reasoning pass. Rather:

```
ONE INTELLIGENT PLANNING PASS
              ↓
       MANY DETERMINISTIC
          EXECUTION JOBS
              ↓
      AUTOMATIC VALIDATION
              ↓
   ONLY NECESSARY AI REVISION
```

That is the sweet spot.

## 100. Specification text to add for Claude (verbatim)

**DOS-100.1**

> CineForge must not use an LLM as a repetitive prompt-generation service.
> Implement a centralized Intelligence Layer and Production Compiler. A single
> master reasoning request should, wherever practical, produce the complete
> structured Film IR required for a production unit (film, sequence, or scene),
> including story, characters, locations, world state, scene plans, shot plans,
> visual specifications, audio specifications, continuity constraints and
> media-generation requirements.

**DOS-100.2**

> The LLM produces instructions, not media-engine implementation. CineForge's
> deterministic Production Compiler converts Film IR into executable media jobs.
> Image, video and audio engines execute those jobs independently and in parallel.

**DOS-100.3**

> Do not make separate LLM calls merely to rewrite information that the master
> response already contains. Persist Film IR and canonical state in the CineForge
> database. Subsequent LLM calls are permitted only when a new reasoning operation
> is genuinely required: creative revision, continuity resolution, failed artistic
> evaluation, user modification, or missing information.

**DOS-100.4**

> The system must distinguish reasoning operations from deterministic operations.
> Do not call an LLM for FFmpeg, encoding, resizing, transcoding, storage,
> checksums, GPU routing, duration calculation, timeline arithmetic or other
> deterministic operations.

**DOS-100.5**

> The Intelligence Layer must be provider-neutral and support OpenAI, Claude and
> future providers behind a common interface. Use structured schemas for all
> production outputs. The LLM must produce Film IR, not arbitrary prose.

**DOS-100.6**

> The final system should optimize for minimum reasoning-model calls, maximum reuse
> of generated planning information, parallel media execution, persistent canonical
> state and targeted AI revision.

**DOS-100.7**

> A feature must not be considered functional merely because an LLM call
> succeeded. The resulting Film IR must compile into real executable jobs, those
> jobs must produce real artifacts, and independent validation must confirm that
> the artifacts satisfy the requested production specification.

**DOS-100.8 In one sentence:**

> We want ChatGPT/Claude to act like the film's senior director and production
> architect — not like a worker we repeatedly ask to write another little prompt.

---

# C. Own image layer — OpenAI image generation is optional

## 101. The author's question and the answer

**DOS-101.1** Verbatim:

> "must i use open ai image when i am building my own image layer?"

**DOS-101.2** No. OpenAI Image Generation is not needed when CineForge builds its
own image-generation layer. OpenAI/Claude primarily act as the **intelligence
layer**; CineForge's own image engine remains the **execution layer**.

**DOS-101.3 Recommended architecture:**

```
                    CINEFORGE
                       │
                       ▼
             ┌─────────────────────┐
             │ Intelligence Layer  │
             │                     │
             │ OpenAI / Claude     │
             │                     │
             │ • story             │
             │ • screenplay        │
             │ • characters        │
             │ • scene design      │
             │ • shot design       │
             │ • image prompts     │
             │ • visual continuity │
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │ Production Compiler │
             │                     │
             │ Film IR → Shot IR   │
             │ → Generation Jobs   │
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │ YOUR IMAGE LAYER    │
             │                     │
             │ ComfyUI             │
             │ Wan / Flux / SDXL   │
             │ Your models         │
             │ LoRAs               │
             │ ControlNet          │
             │ IP-Adapter          │
             │ Reference images    │
             └──────────┬──────────┘
                        │
                        ▼
                 Generated Images
                        │
                        ▼
                  QC / Continuity
```

**DOS-101.4** OpenAI does not have to generate the image. It can determine "This is
what the image needs to be." The image layer determines "This is how we actually
generate it."

## 102. Owning the image pipeline gives more control

**DOS-102.1** DirectorOS could produce:

```json
{
  "shot_id": "SC07_SH04",
  "subject": "Maya",
  "action": "walking toward the abandoned railway station",
  "camera": {
    "shot": "medium-wide",
    "lens": "35mm",
    "angle": "slightly low",
    "movement": "slow dolly"
  },
  "lighting": {
    "time": "night",
    "source": "cold moonlight",
    "practical": "flickering station lamp"
  },
  "character_state": {
    "wardrobe": "dark green coat",
    "hair": "wet shoulder-length black hair",
    "emotion": "cautious",
    "injuries": []
  },
  "environment": {
    "location": "abandoned railway station",
    "weather": "light rain",
    "ground": "wet concrete"
  },
  "style": {
    "cinematic": true,
    "realism": "photorealistic",
    "color_language": "cold blue with warm practicals"
  }
}
```

**DOS-102.2** CineForge's Prompt Compiler converts that into the exact format the
image engine needs:

```
FILM IR
   ↓
SHOT IR
   ↓
REFERENCE PACK
   ↓
PROMPT COMPILER
   ↓
COMFYUI WORKFLOW
   ↓
YOUR IMAGE MODEL
   ↓
IMAGE
```

That is substantially more powerful than simply sending "Generate an image of a
woman at a railway station."

## 103. ComfyUI is the execution/generation graph underneath CineForge

**DOS-103.1** This is exactly where ComfyUI belongs. Don't have Claude rebuild
ComfyUI. Use ComfyUI as the execution/generation graph underneath CineForge.

**DOS-103.2** CineForge decides:

```
Which model?
Which checkpoint?
Which LoRA?
Which ControlNet?
Which reference images?
Which sampler?
Which resolution?
Which seed strategy?
Which workflow?
Which image-to-image strength?
Which character reference?
Which previous frame?
```

Then CineForge sends a **validated workflow** to ComfyUI.

**DOS-103.3**

```
                DIRECTOROS
                    │
                    ▼
              IMAGE PLANNER
                    │
                    ▼
             MODEL ROUTER
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
     Flux         SDXL        Wan image
       │            │            │
       └────────────┼────────────┘
                    ▼
                 ComfyUI
                    │
                    ▼
             Generated Asset
```

**DOS-103.4** New models can be added later without changing DirectorOS.

## 104. What OpenAI/Claude should actually do (and not do)

**DOS-104.1** Spend the API money on:

- **Story:** "What happens?"
- **Screenplay:** "What do the characters say?"
- **Direction:** "How should this scene feel?"
- **Cinematography:** "What camera language communicates this emotion?"
- **Production design:** "What should the environment look like?"
- **Character design:** "What are the immutable characteristics of this character?"
- **Shot design:** "What shots are required to tell this scene?"
- **Prompt construction:** "Translate the canonical shot specification into a
  generation request."
- **Continuity:** "Does this shot contradict the previous shot?"
- **Editorial intelligence:** "Is this scene too slow?"

**DOS-104.2** But **not**:

- resize image
- encode image
- run FFmpeg
- generate thumbnails
- route GPU
- store files
- calculate duration
- create hashes
- execute ComfyUI
- perform deterministic QC

Those belong to CineForge.

## 105. Provider interface — no lock-in

**DOS-105.1**

```ts
interface ImageProvider {
    generate(request: ImageGenerationRequest):
        Promise<ImageGenerationResult>;
}
```

Then:

```
OpenAIImageProvider
ComfyUIProvider
FluxProvider
SDXLProvider
RunPodImageProvider
LocalImageProvider
FutureProvider
```

**DOS-105.2** DirectorOS doesn't care. It produces `ImageGenerationRequest`; the
provider adapter handles the actual generation. A better future image model is
added as `NewProvider` without rewriting the film system.

## 106. OpenAI image generation is optional, not foundational

**DOS-106.1** Capability registry example:

```json
{
  "capability": "image_generation",
  "providers": [
    {
      "id": "cineforge-comfyui",
      "type": "internal",
      "enabled": true,
      "primary": true
    },
    {
      "id": "openai-image",
      "type": "external",
      "enabled": false,
      "primary": false
    }
  ]
}
```

**DOS-106.2** The system can then choose:

```
CineForge Image Layer
        │
        ├── ComfyUI + Flux
        ├── ComfyUI + SDXL
        ├── custom models
        ├── LoRAs
        ├── ControlNet
        └── future models
```

**DOS-106.3** OpenAI can be activated later as one additional provider.

## 107. The important distinction — intelligence vs media generation

**DOS-107.1** Don't confuse **AI intelligence** with **AI media generation**. They
are two different things.

**DOS-107.2** The goal:

| Role | Who |
|---|---|
| Director's brain | OpenAI / Claude |
| Production company | CineForge |
| Cameras, lighting, actors and physical production | ComfyUI / models |
| GPU studio | RunPod |
| Post-production facility | FFmpeg / media engine |
| Quality-control department | QC / Continuity |

**DOS-107.3** That gives a much stronger product architecture than making CineForge
dependent on OpenAI's image generator, and it fits the DirectorOS/Film IR
architecture.

---

*End of Part 2. The author is sending further parts until they say "complete".*
