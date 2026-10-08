# Part 1 — CineForge Movie Intelligence Architecture (DirectorOS)

Received 2026-10-08. Recorded in full, in the author's order. Requirement IDs
(`DOS-n.m`) are added for traceability; the text itself is not shortened.

---

## 0. Preamble — the stance

> And I would go one level beyond a conventional "AI video generator."

What is being described should **not** simply be a feature that asks GPT:

> "Write me a movie and generate some images."

That approach will produce attractive individual scenes but eventually suffer from:

- character inconsistency
- continuity errors
- weak pacing
- contradictory locations
- changing costumes
- incorrect props
- poor shot progression
- bad dialogue timing
- disconnected audio

Instead, CineForge should have a dedicated **Movie Intelligence Layer** sitting
above the media engine.

**The key architectural idea (DOS-0.1):**

> The AI decides what the film should be. CineForge converts that decision into a
> deterministic production plan. Your image/audio/video engines execute the plan.
> A continuity and quality system continuously checks the result and sends
> corrections back into the production loop.

**Author's provider note (DOS-0.2):** OpenAI's current Responses API is
particularly suitable as the reasoning/orchestration interface because it supports
multimodal inputs, structured outputs, function calling and stateful workflows;
OpenAI recommends Responses for new projects.
Source cited: <https://developers.openai.com/blog/responses-api>

### CINEFORGE MOVIE INTELLIGENCE ARCHITECTURE (DOS-0.3)

The complete system structure:

```
                         USER
                           │
                           ▼
                 ┌─────────────────────┐
                 │   MOVIE DIRECTOR    │
                 │       AGENT         │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │  STORY INTELLIGENCE │
                 │      ENGINE         │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │     FILM BIBLE      │
                 │   CANONICAL TRUTH   │
                 └──────────┬──────────┘
                            │
             ┌──────────────┼───────────────┐
             │              │               │
             ▼              ▼               ▼
        CHARACTERS       LOCATIONS        OBJECTS
        COSTUMES         TIME/WEATHER     RELATIONSHIPS
        VOICES           VISUAL STYLE     THEMES
             │              │               │
             └──────────────┼───────────────┘
                            ▼
                 ┌─────────────────────┐
                 │   STORY GRAPH       │
                 └──────────┬──────────┘
                            ▼
                 ┌─────────────────────┐
                 │  SCENE ARCHITECT    │
                 └──────────┬──────────┘
                            ▼
                 ┌─────────────────────┐
                 │   SHOT ARCHITECT    │
                 └──────────┬──────────┘
                            ▼
                 ┌─────────────────────┐
                 │ PROMPT COMPILER     │
                 └──────────┬──────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
          IMAGE AI       AUDIO AI       VIDEO AI
              │             │             │
              └─────────────┼─────────────┘
                            ▼
                 ┌─────────────────────┐
                 │  MEDIA ENGINE       │
                 │  CineForge          │
                 └──────────┬──────────┘
                            ▼
                 ┌─────────────────────┐
                 │ CONTINUITY / QC     │
                 │      ENGINE         │
                 └──────────┬──────────┘
                            │
                   PASS ────┴──── REVISE
                            │
                            ▼
                    FINAL TIMELINE
                            │
                            ▼
                     MASTER MOVIE
```

That is the foundation to use.

---

## 1. The most important change

**DOS-1.1** Do not make the LLM the video-production engine. Make it the
**CineForge Director**.

**DOS-1.2** The Director decides:

```
What happens?
Who is present?
Why does it happen?
Where does it happen?
What should the audience see?
What should the audience hear?
What should the audience feel?
What should happen next?
```

**DOS-1.3** But it does **not** directly decide:

```
FFmpeg commands
GPU allocation
video encoding
frame interpolation
audio normalization
storage
render scheduling
```

Those belong to CineForge's deterministic production system.

---

## 2. The four-layer model

CineForge Movie Production is divided into four major layers.

**DOS-2.1 Layer A — Intelligence**

```
Director
Story Architect
Screenwriter
Cinematographer
Production Designer
Composer
Sound Director
Continuity Director
Editor
Quality Director
```

**DOS-2.2 Layer B — Canon**

```
Film Bible
Character Bible
World Bible
Location Bible
Prop Bible
Style Bible
Audio Bible
Continuity Graph
```

**DOS-2.3 Layer C — Production**

```
Scene Planner
Shot Planner
Prompt Compiler
Asset Planner
Generation Scheduler
Timeline Builder
```

**DOS-2.4 Layer D — Media Engine**

```
Image generation
Video generation
Audio generation
TTS
Music
SFX
Lip sync
Upscaling
Interpolation
Compositing
FFmpeg
Mastering
```

**DOS-2.5** This separation is extremely important.

---

## 3. Film Bible

**DOS-3.1** The single source of truth for the movie.

**DOS-3.2** Location in the codebase:

```
cineforge/
  movie/
    intelligence/
    canon/
      film-bible/
```

**DOS-3.3** The Film Bible contains:

```
Title
Genre
Logline
Premise
Themes
Tone
Audience
Rating
Era
Geography
Visual language
Narrative structure
Characters
Locations
Objects
Costumes
Vehicles
Technology
Weather rules
Lighting rules
Camera language
Color language
Audio language
Dialogue style
Continuity rules
```

---

## 4. Character Bible

**DOS-4.1** Every character becomes a persistent entity. Example:

```json
{
  "characterId": "char_maya",
  "name": "Maya",
  "age": 34,
  "role": "protagonist",
  "appearance": {},
  "faceIdentity": {},
  "bodyIdentity": {},
  "hair": {},
  "voice": {},
  "personality": {},
  "wardrobe": [],
  "relationships": [],
  "arc": {},
  "visualReferences": [],
  "voiceReference": null
}
```

**DOS-4.2** The crucial point: every subsequent scene references the character
**ID**. Not:

> "Create a woman who looks like Maya."

Instead:

```
characterId = char_maya
```

**DOS-4.3** The generation system then retrieves Maya's canonical identity.

---

## 5. Character state

Where CineForge can go beyond many current systems.

**DOS-5.1** Do not only store:

```
Maya looks like this.
```

Store:

```
Maya at story time T:
```

Example:

```
hair = wet
clothing = damaged
left sleeve = torn
face = bruised
holding = revolver
emotional_state = frightened
location = warehouse
```

**DOS-5.2** After a major event:

```
Maya gets injured.
```

the state changes. **Future scenes inherit it.**

**DOS-5.3** This prevents: Maya gets shot in Scene 17 → magically has no injury in
Scene 18.

---

## 6. World Bible

**DOS-6.1** The same principle applies to the environment. Example:

```
Location:
Lagos Central Station

Architecture:
1920s colonial station

Time:
2038

Weather:
heavy rain

Lighting:
cold fluorescent + sodium exterior

Floor:
wet marble

Main entrance:
east side

Platform:
south

Clock:
large mechanical clock above ticket hall
```

**DOS-6.2** Every shot referencing the station receives the same world state.

---

## 7. Prop Bible

**DOS-7.1** Every important object gets an identity. Example:

```
PROP-017
Silver pocket watch
Owned by Daniel
Scratched glass
Stopped at 02:17
Inherited from father
```

**DOS-7.2** If it becomes important later:

```
Scene 4:
Daniel possesses watch.

Scene 17:
Daniel loses watch.

Scene 22:
Maya discovers watch.

Scene 31:
watch identifies Daniel's location.
```

**DOS-7.3** Now the object **participates in the story graph**. That is much more
powerful than simply generating another image prompt.

---

## 8. Story graph

**DOS-8.1** Instead of storing the movie as a long block of text, build a graph.

```
ACT I
 │
 ├── SCENE 01
 │
 ├── SCENE 02
 │
 └── SCENE 03
       │
       ▼
ACT II
 │
 ├── SCENE 04
 ├── SCENE 05
 ├── SCENE 06
 │
 └── ...
       │
       ▼
ACT III
```

**DOS-8.2** Each scene has relationships:

```
scene_17
  ├── follows scene_16
  ├── continues location_03
  ├── contains char_maya
  ├── references prop_017
  ├── resolves plot_thread_04
  ├── advances character_arc_maya
  └── creates plot_thread_09
```

---

## 9. Scene graph

**DOS-9.1** A scene contains much more than dialogue. Example:

```json
{
  "sceneId": "scene_017",

  "purpose": "Reveal the betrayal",

  "locationId": "loc_03",

  "time": "night",

  "durationSeconds": 94,

  "characters": [
    "char_maya",
    "char_daniel"
  ],

  "props": [
    "prop_017"
  ],

  "emotionalArc": {
    "start": "suspicion",
    "middle": "fear",
    "end": "betrayal"
  },

  "storyBeats": [],

  "dialogue": [],

  "shots": []
}
```

---

## 10. Shot Architect

**DOS-10.1** This is where CineForge becomes a real filmmaking system rather than
an AI prompt generator. The scene planner generates:

```
SHOT 001
SHOT 002
SHOT 003
...
```

**DOS-10.2** Each shot has:

```
duration
camera
lens
movement
composition
subject
action
location
lighting
depth of field
focus
emotion
dialogue
sound
music
transition
continuity
```

Example:

```json
{
  "shotId": "scene017_shot04",

  "duration": 5.2,

  "camera": {
    "shotSize": "medium_close_up",
    "angle": "low",
    "lens": "50mm",
    "movement": "slow_dolly_in"
  },

  "subject": "char_maya",

  "action": "Maya realizes Daniel has lied.",

  "emotion": "controlled disbelief",

  "lighting": "cold window light",

  "audio": {
    "dialogue": "...",
    "ambience": "rain",
    "musicCue": "tension_03"
  }
}
```

---

## 11. Cinematography Engine

**DOS-11.1** The Director has a separate cinematography intelligence layer. It
determines:

```
shot size
camera position
lens
depth
movement
framing
focus
lighting
color
transition
```

**DOS-11.2** Importantly, it should understand **visual grammar**. For example:

```
establishing shot
→ medium shot
→ close-up
→ reaction
→ insert
→ reverse shot
→ wide release
```

rather than generating every shot independently.

---

## 12. The Prompt Compiler

One of the most important components.

**DOS-12.1** Do not let GPT directly generate a final image prompt from scratch
every time. Instead:

```
CANON
+
SCENE
+
SHOT
+
CHARACTER STATE
+
LOCATION STATE
+
CAMERA
+
STYLE
+
CONTINUITY
+
GENERATION MODEL
```

go into the **Prompt Compiler** and produce:

```
IMAGE PROMPT
VIDEO PROMPT
AUDIO PROMPT
VOICE PROMPT
MUSIC PROMPT
SFX PROMPT
```

**DOS-12.2 (author's note)** OpenAI's current image-generation guidance similarly
recommends structured prompt construction around scene/background, subject,
details, constraints and intended use rather than relying on clever free-form
prompts.
Source cited: <https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide>

---

## 13. Model-specific prompt compilers

Another area where CineForge can be ahead.

**DOS-13.1** Do not have one universal prompt. Create adapters:

```
PromptCompiler
    │
    ├── OpenAIImageCompiler
    ├── FluxCompiler
    ├── SDXLCompiler
    ├── WanCompiler
    ├── ComfyUICompiler
    ├── TTSCompiler
    ├── MusicCompiler
    └── SFXCompiler
```

**DOS-13.2** The Director describes the desired result in a **canonical
language**. The adapter translates it into the syntax/conditioning appropriate for
the actual model.

---

## 14. Canonical media request

**DOS-14.1** Internally, CineForge has something like:

```json
{
  "shotId": "scene017_shot04",

  "visualIntent": {
    "subject": "Maya",
    "action": "realizes betrayal",
    "emotion": "controlled disbelief"
  },

  "camera": {
    "shot": "medium_close_up",
    "lens": "50mm",
    "movement": "slow_dolly_in"
  },

  "environment": {
    "location": "loc_03",
    "time": "night",
    "weather": "rain"
  },

  "style": {
    "cinematicLanguage": "neo_noir",
    "contrast": "moderate"
  },

  "continuity": {
    "characterState": "state_204",
    "requiredProps": ["prop_017"]
  }
}
```

**DOS-14.2** The model-specific compiler then turns this into whatever the
image/video engine requires.

---

## 15. Image generation

**DOS-15.1** Your own image system becomes an **execution backend**.
Architecture:

```
Movie Director
      ↓
Shot Architect
      ↓
Canonical Shot
      ↓
Prompt Compiler
      ↓
Image Job
      ↓
GPU Scheduler
      ↓
Your Image Engine
      ↓
Candidate Images
```

**DOS-15.2** Don't immediately accept the first image. Generate:

```
candidate A
candidate B
candidate C
```

Then evaluate them.

---

## 16. Image Director / Visual Reviewer

**DOS-16.1** Use a multimodal model to evaluate generated images against:

```
character identity
composition
camera
lighting
wardrobe
location
props
emotion
continuity
prompt adherence
```

**DOS-16.2** Score:

```
Identity: 94
Composition: 91
Continuity: 98
Lighting: 87
Prompt adherence: 93
```

Then:

```
PASS
```

or:

```
REVISE
```

**DOS-16.3** This creates a **generate → evaluate → revise** loop.

---

## 17. The same for video

**DOS-17.1** Do not trust the generated video merely because it rendered
successfully. Run:

```
video generation
        ↓
extract frames
        ↓
visual evaluator
        ↓
continuity evaluator
        ↓
motion evaluator
        ↓
artifact detector
        ↓
PASS / REGENERATE
```

**DOS-17.2** Check:

```
face consistency
hands
objects
camera movement
motion
lighting
background
character position
wardrobe
continuity
```

---

## 18. Audio architecture

**DOS-18.1** Audio is planned at the **shot level**, not added at the end. For
each shot:

```
Dialogue
Ambience
Foley
SFX
Music
Room tone
Silence
```

Example:

```
SHOT 04

Dialogue:
Maya whispers...

Ambience:
rain + distant traffic

Foley:
wet shoes

SFX:
watch clicks

Music:
low cello drone

Room:
warehouse reverb
```

**DOS-18.2** Then your own audio engine generates the appropriate components.

---

## 19. Voice identity

**DOS-19.1** Every character gets:

```
voiceId
```

and:

```
voice profile
```

**DOS-19.2** The system must maintain:

```
pitch
age
accent
speech rate
emotional range
loudness
```

**DOS-19.3** Dialogue generation then becomes:

```
character → voice identity → audio generation
```

rather than asking the audio model to reinvent the voice every scene.

---

## 20. Audio continuity

**DOS-20.1** The existing audio engineering work becomes part of the Movie
Intelligence architecture. The final audio pipeline continues to enforce:

```
per-speaker loudness matching
EBU R128
-14 LUFS target where appropriate
ducking
de-clicking
crossfades
room tone
```

**DOS-20.2** The Movie Layer decides **what** should be heard. The Media Engine
decides **how** to technically master it.

---

## 21. Editor Agent

**DOS-21.1** After scenes are generated, create **Editorial Intelligence**. It
reviews the movie as a whole. It asks:

```
Is the pacing correct?

Is the opening strong?

Are there redundant shots?

Is the emotional escalation working?

Are there scenes that should be shortened?

Does the climax arrive too early?

Is the ending satisfying?

Are transitions coherent?

Is dialogue repetitive?
```

**DOS-21.2** It can then propose:

```
CUT SHOT 34
EXTEND SHOT 42
MOVE SCENE 17
SHORTEN SCENE 22
ADD INSERT
REMOVE REPETITION
```

**DOS-21.3** These become **structured edit operations**, not free-form
instructions.

---

## 22. The movie as a compilable object

Where CineForge becomes genuinely different: treat the movie like software.

**DOS-22.1** The user creates:

```
Movie Source
```

CineForge compiles it into `Film Plan`, which compiles into `Shot Plan`, which
compiles into `Media Jobs`, which compile into `Timeline`, which compiles into
`Master Film`. So:

```
MOVIE SOURCE
     ↓
FILM IR
     ↓
SCENE IR
     ↓
SHOT IR
     ↓
MEDIA IR
     ↓
TIMELINE IR
     ↓
MASTER
```

IR = Intermediate Representation. "This is an extremely powerful architecture."

---

## 23. CineForge Film IR

**DOS-23.1** Create:

```
src/movie-ir/
```

with:

```
film.ts
act.ts
sequence.ts
scene.ts
shot.ts
character.ts
location.ts
prop.ts
dialogue.ts
audio.ts
camera.ts
continuity.ts
timeline.ts
```

**DOS-23.2** The LLM never directly controls the final renderer. It produces Film
IR. CineForge validates it. Then CineForge executes it.

---

## 24. Validator

**DOS-24.1** Every AI output goes through:

```
AI
 ↓
Schema validation
 ↓
Canon validation
 ↓
Continuity validation
 ↓
Production validation
 ↓
Budget validation
 ↓
Execution
```

**DOS-24.2 (author's note)** OpenAI's Structured Outputs are particularly useful
here because they constrain model responses to developer-defined JSON schemas
rather than relying on ordinary JSON prompting. OpenAI recommends Structured
Outputs over basic JSON mode when supported.
Source cited: <https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses>

---

## 25. Never let GPT return "just text"

**DOS-25.1** For production operations, require structured output. For example:

```
generate_scene()
```

returns:

```json
{
  "scene": {},
  "characters": [],
  "locations": [],
  "shots": [],
  "audio": [],
  "continuityChanges": []
}
```

not:

```
"Here's a beautiful scene..."
```

**DOS-25.2** That difference will dramatically improve reliability.

---

## 26. Multi-agent directorial system

**DOS-26.1** Specialised AI roles:

```
                 MASTER DIRECTOR
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   STORY AGENT    CINEMA AGENT    AUDIO AGENT
        │              │              │
   SCRIPT AGENT    SHOT AGENT     MUSIC AGENT
        │              │              │
        └──────────────┼──────────────┘
                       │
                CONTINUITY AGENT
                       │
                  EDITOR AGENT
                       │
                    QC AGENT
```

**DOS-26.2 (author's note)** Current OpenAI APIs even provide a multi-agent
capability for parallel focused subagents, although it is currently described as
beta. Use that as an **optimization** rather than make the core CineForge
architecture dependent on it.
Source cited: <https://developers.openai.com/api/docs/guides/responses-multi-agent>

---

## 27. But don't create 20 agents just because you can

**DOS-27.1** Too many agents create:

```
conflicting decisions
context explosion
higher cost
unpredictability
```

**DOS-27.2** Start with:

1. Director
2. Story/Screenplay
3. Visual/Cinematography
4. Audio
5. Continuity
6. Editor/QC

That's enough.

---

## 28. The Director should control them

**DOS-28.1** The user shouldn't have to manage agents. The user says:

> "Create a 12-minute science-fiction short film about a woman who discovers that
> her dead husband is communicating through an abandoned satellite."

Then:

```
DIRECTOR
    ↓
STORY
    ↓
FILM BIBLE
    ↓
CHARACTER BIBLE
    ↓
WORLD BIBLE
    ↓
ACTS
    ↓
SCENES
    ↓
SHOTS
    ↓
MEDIA
    ↓
QC
    ↓
EDIT
    ↓
FILM
```

---

## 29. The user can interrupt at any level

**DOS-29.1** The user could say:

> "Change Maya's jacket to red."

**DOS-29.2** CineForge shouldn't regenerate the entire film. Instead:

```
Film Bible
 ↓
Character Bible
 ↓
Maya wardrobe state
 ↓
affected shots identified
 ↓
only affected assets regenerated
```

This is **dependency-aware regeneration**.

---

## 30. Dependency graph

**DOS-30.1** Every asset knows what depends on it. Example:

```
Maya
 │
 ├── Scene 03
 │    ├── Shot 12
 │    └── Shot 13
 │
 ├── Scene 07
 │    ├── Shot 31
 │    └── Shot 32
 │
 └── Scene 11
      └── Shot 58
```

**DOS-30.2** Change Maya's appearance:

```
Maya changed
 ↓
dependency graph
 ↓
affected shots
 ↓
regenerate only affected shots
```

This can save enormous GPU cost.

---

## 31. Version everything

**DOS-31.1** Use:

```
Film v1
Film v2
Film v3
```

and:

```
Character Maya v4
Scene 17 v8
Shot 17.04 v3
```

**DOS-31.2** Never destroy the previous version.

---

## 32. Continuity Engine

**DOS-32.1** One of CineForge's signature technologies. It checks:

**Character (DOS-32.2)**

```
face
hair
age
clothes
injuries
position
emotional state
```

**Environment (DOS-32.3)**

```
weather
time
lighting
architecture
objects
```

**Story (DOS-32.4)**

```
knowledge
relationships
plot state
dead/alive state
location
timeline
```

**Cinematography (DOS-32.5)**

```
screen direction
eyeline
camera axis
shot progression
```

**Audio (DOS-32.6)**

```
voice
room
ambience
music
sound continuity
```

---

## 33. Temporal continuity

**DOS-33.1** The system understands:

```
Scene 10 happens at 14:00.
Scene 11 happens 3 minutes later.
Scene 12 happens next morning.
```

**DOS-33.2** Therefore:

```
weather
sun
clothing
injuries
objects
character knowledge
```

must update accordingly. Much more sophisticated than ordinary prompt-based
generation.

---

## 34. Visual memory

**DOS-34.1** Store references for every important entity:

```
character reference
location reference
prop reference
costume reference
vehicle reference
architecture reference
style reference
```

**DOS-34.2** The image generator receives the appropriate references for each
shot.

---

## 35. Reference pack

**DOS-35.1** For every scene, CineForge automatically assembles:

```
SCENE REFERENCE PACK
--------------------

Character references
Location references
Prop references
Costume references
Previous shot
Previous scene
Style reference
Camera reference
Lighting reference
```

**DOS-35.2** The generation engine then receives only the relevant context. This
prevents enormous prompts and unnecessary context.

---

## 36. Shot-to-shot visual memory

**DOS-36.1** A generated shot becomes an input reference for the next shot when
appropriate:

```
Shot 01
 ↓
Shot 02
 ↓
Shot 03
```

**DOS-36.2** The next generation knows:

```
where the character ended
where the camera ended
where objects were
what lighting looked like
```

This creates actual visual continuity.

---

## 37. Scene lock

**DOS-37.1** Once a scene is approved:

```
SCENE LOCKED
```

**DOS-37.2** The system preserves:

```
character identity
location
wardrobe
lighting
visual style
approved references
```

unless the user explicitly unlocks it.

---

## 38. Film lock

**DOS-38.1** At the end:

```
FILM LOCK
```

means:

```
Canon frozen
Timeline frozen
Assets versioned
Audio frozen
Master settings frozen
```

**DOS-38.2** Then the system produces the final master.

---

## 39. Quality gates

**DOS-39.1** Before a scene becomes final:

```
STORY PASS
      ↓
VISUAL PASS
      ↓
CONTINUITY PASS
      ↓
AUDIO PASS
      ↓
TECHNICAL PASS
      ↓
EDITORIAL PASS
```

**DOS-39.2** If one fails:

```
REVISE
```

not:

```
export anyway
```

---

## 40. Technical QC

**DOS-40.1** The existing CineForge media engine checks:

```
resolution
fps
codec
frame rate
duration
audio sample rate
channels
loudness
black frames
dropped frames
corrupt frames
audio/video sync
```

**DOS-40.2** The previous film-mux issue is exactly the kind of thing this layer
must catch. For example:

```
picture = 30 sec
narration = 35 sec
```

The master compiler should not silently truncate one to the other.

**DOS-40.3** The timeline explicitly determines:

```
picture duration
audio duration
padding
ducking
extension
fade
```

---

## 41. Movie cost optimization

**DOS-41.1** Because CineForge is building its own GPU infrastructure, the Movie
Layer understands cost. For example:

```
Storyboard
 ↓
cheap image generation
 ↓
approval
 ↓
video generation
```

**DOS-41.2** Don't spend expensive GPU time generating video for an unapproved
scene. This is crucial.

---

## 42. Two-pass production

**DOS-42.1 PASS 1 — PREVIS.** Cheap:

```
script
storyboard
rough images
rough voice
rough timing
```

User approves.

**DOS-42.2 PASS 2 — FINAL.** Expensive:

```
high-quality images
video
voice
music
SFX
upscaling
master
```

This can dramatically reduce GPU waste.

---

## 43. Three-pass would be even better

For professional production:

**DOS-43.1 PASS 1 — STORY**

```
screenplay
structure
characters
scenes
```

**DOS-43.2 PASS 2 — PREVIS**

```
storyboard
rough voices
camera
timing
```

**DOS-43.3 PASS 3 — FINAL**

```
image
video
audio
editing
mastering
```

**DOS-43.4** This should become the **CineForge standard**.

---

## 44. The user interface

**DOS-44.1** The Movie layer is not just another chat window. Use:

```
┌─────────────────────────────────────────────┐
│                 CINEFORGE                   │
├───────────┬─────────────────────┬───────────┤
│ FILM      │                     │ DIRECTOR  │
│           │    STORYBOARD       │           │
│ Bible     │                     │ Chat      │
│ Characters│   [01][02][03][04]  │           │
│ Locations │   [05][06][07][08]  │           │
│ Scenes    │                     │ Decisions │
│ Shots     │                     │           │
│ Assets    │                     │           │
│ Timeline  │                     │           │
├───────────┴─────────────────────┴───────────┤
│              CINEMATIC TIMELINE             │
└─────────────────────────────────────────────┘
```

---

## 45. Director chat

**DOS-45.1** The user can say:

> "Make Scene 7 darker and more psychologically disturbing."

**DOS-45.2** The Director interprets this as:

```
change scene tone
 ↓
cinematography revision
 ↓
lighting revision
 ↓
music revision
 ↓
possibly dialogue revision
 ↓
affected shots identified
```

Not simply: regenerate scene 7.

---

## 46. Natural-language editing

**DOS-46.1** The user should be able to say:

> "Make the opening 15 seconds faster."

**DOS-46.2** CineForge determines:

```
timeline dependencies
```

and may:

```
remove shot 3
shorten shot 4
change shot 5
accelerate music
```

**DOS-46.3** The user doesn't need to understand the timeline representation.

---

## 47. "Why" explanation

**DOS-47.1** Every major AI decision has an internal explanation record. For
example:

```
Why was this shot generated?

Because:
Scene 17 requires Maya to discover the watch.
The previous shot establishes the watch on the floor.
A close-up insert was therefore selected.
```

**DOS-47.2** This makes CineForge much easier to debug.

---

## 48. AI decision log

**DOS-48.1** Store:

```
agent
model
prompt version
input context
output schema
decision
timestamp
cost
```

**DOS-48.2** This creates an audit trail.

---

## 49. Prompt versioning

**DOS-49.1** Do not hard-code giant prompts throughout the application. Create:

```
prompts/
    director/
    screenplay/
    scene/
    cinematography/
    image/
    video/
    audio/
    continuity/
    editor/
```

**DOS-49.2** Each prompt has:

```
version
purpose
model
schema
evaluation score
```

**DOS-49.3** Then CineForge can be improved without rewriting the engine.

---

## 50. Evaluation system

How to get ahead.

**DOS-50.1** Build an internal benchmark. For example:

```
100 test scenes
50 characters
30 locations
20 continuity tests
20 dialogue tests
20 cinematography tests
```

**DOS-50.2** Every new prompt/model change runs the benchmark. Measure:

```
character consistency
story consistency
prompt adherence
continuity
visual quality
audio quality
cost
latency
```

**DOS-50.3** Do not rely on "It looks better to me." Use measurable evaluation.

**DOS-50.4 (author's note)** OpenAI's Structured Outputs guidance also explicitly
recommends creating evals to determine whether schemas and outputs are working
well.
Source cited: <https://developers.openai.com/api/docs/guides/structured-outputs>

---

## 51. Model router

**DOS-51.1** Don't permanently tie CineForge to OpenAI. Create an **AI Provider
Abstraction**:

```
                    AI ROUTER
                       │
       ┌───────────────┼───────────────┐
       │               │               │
    OpenAI          Anthropic       Local Models
       │               │               │
       └───────────────┼───────────────┘
                       │
                  CineForge
```

**DOS-51.2** Then:

```
Director → best reasoning model
Image → best image model
Video → best video model
Voice → best voice model
Music → best music model
```

This keeps CineForge independent.

---

## 52. ChatGPT should not be the only intelligence

**DOS-52.1** Important for long-term strategy. Use OpenAI as one of the strongest
reasoning providers, but architect CineForge so the interface is:

```
LLMProvider
```

not:

```
OpenAIEverywhere
```

**DOS-52.2** Then providers can change as models improve.

---

## 53. The "DirectorOS"

**DOS-53.1** Give this subsystem its own name: **CineForge DirectorOS**. It is the
intelligence layer above the media engine. Architecture:

```
DirectorOS
│
├── Story Intelligence
├── Film Bible
├── World Model
├── Character State
├── Continuity Graph
├── Scene Planner
├── Shot Planner
├── Cinematography
├── Audio Direction
├── Prompt Compiler
├── Asset Intelligence
├── Editorial Intelligence
├── QC
└── Production Compiler
```

Then:

```
DirectorOS
      ↓
CineForge Media Engine
```

---

## 54. The really advanced part

**DOS-54.1** To be ahead of today's video generators, don't think of CineForge as
"AI that makes videos." Think of it as:

> **AI that understands a film as a persistent world and compiles that world into
> media.**

That distinction is enormous.

**DOS-54.2** The system remembers:

```
WHO
WHERE
WHEN
WHY
WHAT HAPPENED
WHAT CHANGED
WHAT THE CAMERA SAW
WHAT THE AUDIENCE KNOWS
WHAT THE CHARACTER KNOWS
WHAT OBJECTS EXIST
WHAT SOUNDS EXIST
WHAT MUST REMAIN CONSISTENT
```

---

## 55. World State Engine

**DOS-55.1** At every point in the film a **WORLD STATE** exists. Example:

```json
{
  "storyTime": "2038-10-17T23:14",

  "locations": {
    "warehouse": {
      "weather": "rain",
      "power": "partial",
      "doors": {
        "east": "open"
      }
    }
  },

  "characters": {
    "maya": {
      "location": "warehouse",
      "injuries": ["left_arm"],
      "clothing": "wet_red_coat",
      "emotion": "fear",
      "knowledge": [
        "daniel_is_alive"
      ]
    }
  },

  "objects": {
    "watch_017": {
      "location": "warehouse_floor",
      "owner": "daniel"
    }
  }
}
```

**DOS-55.2** Every shot is generated against this world state. Far more robust
than simply passing previous text into GPT.

---

## 56. Story knowledge vs character knowledge

**DOS-56.1** The Director knows the whole story. Maya does not. So:

```
Director Knowledge:
Daniel is secretly alive.

Maya Knowledge:
Daniel is dead.
```

**DOS-56.2** The system must not accidentally make Maya say "I know Daniel is
alive" unless she has learned it.

**DOS-56.3** This gives proper dramatic storytelling.

---

## 57. Audience knowledge

**DOS-57.1** One step further: track **WHAT THE AUDIENCE KNOWS**.

**DOS-57.2** This allows CineForge to deliberately create:

```
dramatic irony
mystery
revelation
foreshadowing
misdirection
surprise
```

**DOS-57.3** Something ordinary image-to-video pipelines don't really model.

---

## 58. Foreshadowing graph

**DOS-58.1** The story engine maintains:

```
Plant → Development → Payoff
```

Example:

```
Scene 3
Pocket watch appears.

Scene 11
Watch stops at 02:17.

Scene 22
Victim died at 02:17.

Scene 35
Watch identifies killer.
```

**DOS-58.2** The system can automatically check: did the film actually establish
the information required for the payoff? That is a genuine storytelling engine.

---

## 59. The Movie Compiler

**DOS-59.1** Ultimately:

```
USER IDEA
   ↓
DIRECTOROS
   ↓
FILM BIBLE
   ↓
WORLD MODEL
   ↓
STORY GRAPH
   ↓
SCENE GRAPH
   ↓
SHOT GRAPH
   ↓
ASSET GRAPH
   ↓
MEDIA GENERATION
   ↓
CONTINUITY QC
   ↓
EDITORIAL QC
   ↓
TIMELINE
   ↓
MASTER
```

**DOS-59.2** The existing elastic GPU architecture sits underneath:

```
                    DIRECTOROS
                         │
                         ▼
                  PRODUCTION JOBS
                         │
                         ▼
                 CINEFORGE QUEUE
                         │
                         ▼
                  GPU SCHEDULER
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
         L4           5090/L40S       H100
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  MEDIA ENGINE
```

---

*End of Part 1. The author is sending further parts until they say "complete".*
