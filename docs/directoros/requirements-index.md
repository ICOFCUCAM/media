# DirectorOS requirements index

One row per requirement ID in the source record. The last two columns are filled in by the gap analysis after the author says "complete".

**Status values:** `built` · `shallow` · `poorly built` · `not built` · `n/a` (author's note or recommendation, not a requirement).

## Part 1 — Movie Intelligence Architecture

| ID | Section | Requirement (pointer; the full text is in the part file) | Cineforge status | Where / notes |
|---|---|---|---|---|
| DOS-0.1 | 0. Preamble — the stance | The key architectural idea — > The AI decides what the film should be. CineForge converts that decision into a | | |
| DOS-0.2 | 0. Preamble — the stance | Author's provider note : OpenAI's current Responses API is | | |
| DOS-0.3 | 0. Preamble — the stance | ### CINEFORGE MOVIE INTELLIGENCE ARCHITECTURE | | |
| DOS-1.1 | 1. The most important change | Do not make the LLM the video-production engine. Make it the CineForge Director. | | |
| DOS-1.2 | 1. The most important change | The Director decides — What happens?; Who is present?; Why does it happen?; Where does it happen?; What should the audience see?; What should the audience hear?; What should the audience feel?; What should happen next? | | |
| DOS-1.3 | 1. The most important change | But it does not directly decide — FFmpeg commands; GPU allocation; video encoding; frame interpolation; audio normalization; storage; render scheduling | | |
| DOS-2.1 | 2. The four-layer model | Layer A — Intelligence — Director; Story Architect; Screenwriter; Cinematographer; Production Designer; Composer; Sound Director; Continuity Director; Editor; Quality Director | | |
| DOS-2.2 | 2. The four-layer model | Layer B — Canon — Film Bible; Character Bible; World Bible; Location Bible; Prop Bible; Style Bible; Audio Bible; Continuity Graph | | |
| DOS-2.3 | 2. The four-layer model | Layer C — Production — Scene Planner; Shot Planner; Prompt Compiler; Asset Planner; Generation Scheduler; Timeline Builder | | |
| DOS-2.4 | 2. The four-layer model | Layer D — Media Engine — Image generation; Video generation; Audio generation; TTS; Music; SFX; Lip sync; Upscaling; Interpolation; Compositing; FFmpeg; Mastering | | |
| DOS-2.5 | 2. The four-layer model | This separation is extremely important — --- | | |
| DOS-3.1 | 3. Film Bible | The single source of truth for the movie | | |
| DOS-3.2 | 3. Film Bible | Location in the codebase — cineforge/; movie/; intelligence/; canon/; film-bible/ | | |
| DOS-3.3 | 3. Film Bible | The Film Bible contains — Title; Genre; Logline; Premise; Themes; Tone; Audience; Rating; Era; Geography; Visual language; Narrative structure … | | |
| DOS-4.1 | 4. Character Bible | Every character becomes a persistent entity. Example — "characterId": "char_maya"; "name": "Maya"; "age": 34; "role": "protagonist"; "appearance": {}; "faceIdentity": {}; "bodyIdentity": {}; "hair": {}; "voice": {}; "personality": {}; "ward | | |
| DOS-4.2 | 4. Character Bible | The crucial point: every subsequent scene references the character | | |
| DOS-4.3 | 4. Character Bible | The generation system then retrieves Maya's canonical identity | | |
| DOS-5.1 | 5. Character state | Do not only store — Maya looks like this. | | |
| DOS-5.2 | 5. Character state | After a major event — Maya gets injured. | | |
| DOS-5.3 | 5. Character state | This prevents: Maya gets shot in Scene 17 → magically has no injury in | | |
| DOS-6.1 | 6. World Bible | The same principle applies to the environment. Example — Location:; Lagos Central Station; Architecture:; 1920s colonial station; Time:; 2038; Weather:; heavy rain; Lighting:; cold fluorescent + sodium exterior; Floor:; wet marble … | | |
| DOS-6.2 | 6. World Bible | Every shot referencing the station receives the same world state | | |
| DOS-7.1 | 7. Prop Bible | Every important object gets an identity. Example — PROP-017; Silver pocket watch; Owned by Daniel; Scratched glass; Stopped at 02:17; Inherited from father | | |
| DOS-7.2 | 7. Prop Bible | If it becomes important later — Scene 4:; Daniel possesses watch.; Scene 17:; Daniel loses watch.; Scene 22:; Maya discovers watch.; Scene 31:; watch identifies Daniel's location. | | |
| DOS-7.3 | 7. Prop Bible | Now the object participates in the story graph. That is much more | | |
| DOS-8.1 | 8. Story graph | Instead of storing the movie as a long block of text, build a graph — ACT I; │; ├── SCENE 01; │; ├── SCENE 02; │; └── SCENE 03; │; ▼; ACT II; │; ├── SCENE 04 … | | |
| DOS-8.2 | 8. Story graph | Each scene has relationships — scene_17; ├── follows scene_16; ├── continues location_03; ├── contains char_maya; ├── references prop_017; ├── resolves plot_thread_04; ├── advances character_arc_maya; └── creates plot_thread_09 | | |
| DOS-9.1 | 9. Scene graph | A scene contains much more than dialogue. Example — "sceneId": "scene_017"; "purpose": "Reveal the betrayal"; "locationId": "loc_03"; "time": "night"; "durationSeconds": 94; "characters": [; "char_maya"; "char_daniel"; "props": [; "prop_017 | | |
| DOS-10.1 | 10. Shot Architect | This is where CineForge becomes a real filmmaking system rather than | | |
| DOS-10.2 | 10. Shot Architect | Each shot has — duration; camera; lens; movement; composition; subject; action; location; lighting; depth of field; focus; emotion … | | |
| DOS-11.1 | 11. Cinematography Engine | The Director has a separate cinematography intelligence layer. It | | |
| DOS-11.2 | 11. Cinematography Engine | Importantly, it should understand visual grammar. For example — establishing shot; → medium shot; → close-up; → reaction; → insert; → reverse shot; → wide release | | |
| DOS-12.1 | 12. The Prompt Compiler | Do not let GPT directly generate a final image prompt from scratch | | |
| DOS-12.2 | 12. The Prompt Compiler | (author's note) OpenAI's current image-generation guidance similarly | | |
| DOS-13.1 | 13. Model-specific prompt compilers | Do not have one universal prompt. Create adapters — PromptCompiler; │; ├── OpenAIImageCompiler; ├── FluxCompiler; ├── SDXLCompiler; ├── WanCompiler; ├── ComfyUICompiler; ├── TTSCompiler; ├── MusicCompiler; └── SFXCompiler | | |
| DOS-13.2 | 13. Model-specific prompt compilers | The Director describes the desired result in a canonical | | |
| DOS-14.1 | 14. Canonical media request | Internally, CineForge has something like — "shotId": "scene017_shot04"; "visualIntent": {; "subject": "Maya"; "action": "realizes betrayal"; "emotion": "controlled disbelief"; "camera": {; "shot": "medium_close_up"; "lens": "50mm"; "movemen | | |
| DOS-14.2 | 14. Canonical media request | The model-specific compiler then turns this into whatever the | | |
| DOS-15.1 | 15. Image generation | Your own image system becomes an execution backend | | |
| DOS-15.2 | 15. Image generation | Don't immediately accept the first image. Generate — candidate A; candidate B; candidate C | | |
| DOS-16.1 | 16. Image Director / Visual Reviewer | Use a multimodal model to evaluate generated images against — character identity; composition; camera; lighting; wardrobe; location; props; emotion; continuity; prompt adherence | | |
| DOS-16.2 | 16. Image Director / Visual Reviewer | Score — Identity: 94; Composition: 91; Continuity: 98; Lighting: 87; Prompt adherence: 93 | | |
| DOS-16.3 | 16. Image Director / Visual Reviewer | This creates a generate → evaluate → revise loop | | |
| DOS-17.1 | 17. The same for video | Do not trust the generated video merely because it rendered | | |
| DOS-17.2 | 17. The same for video | Check — face consistency; hands; objects; camera movement; motion; lighting; background; character position; wardrobe; continuity | | |
| DOS-18.1 | 18. Audio architecture | Audio is planned at the shot level, not added at the end. For | | |
| DOS-18.2 | 18. Audio architecture | Then your own audio engine generates the appropriate components | | |
| DOS-19.1 | 19. Voice identity | Every character gets — voiceId | | |
| DOS-19.2 | 19. Voice identity | The system must maintain — pitch; age; accent; speech rate; emotional range; loudness | | |
| DOS-19.3 | 19. Voice identity | Dialogue generation then becomes — character → voice identity → audio generation | | |
| DOS-20.1 | 20. Audio continuity | The existing audio engineering work becomes part of the Movie | | |
| DOS-20.2 | 20. Audio continuity | The Movie Layer decides what should be heard. The Media Engine | | |
| DOS-21.1 | 21. Editor Agent | After scenes are generated, create Editorial Intelligence. It | | |
| DOS-21.2 | 21. Editor Agent | It can then propose — CUT SHOT 34; EXTEND SHOT 42; MOVE SCENE 17; SHORTEN SCENE 22; ADD INSERT; REMOVE REPETITION | | |
| DOS-21.3 | 21. Editor Agent | These become structured edit operations, not free-form | | |
| DOS-22.1 | 22. The movie as a compilable object | The user creates — Movie Source | | |
| DOS-23.1 | 23. CineForge Film IR | Create — src/movie-ir/ | | |
| DOS-23.2 | 23. CineForge Film IR | The LLM never directly controls the final renderer. It produces Film | | |
| DOS-24.1 | 24. Validator | Every AI output goes through — AI; ↓; Schema validation; ↓; Canon validation; ↓; Continuity validation; ↓; Production validation; ↓; Budget validation; ↓ … | | |
| DOS-24.2 | 24. Validator | (author's note) OpenAI's Structured Outputs are particularly useful | | |
| DOS-25.1 | 25. Never let GPT return "just text" | For production operations, require structured output. For example — generate_scene() | | |
| DOS-25.2 | 25. Never let GPT return "just text" | That difference will dramatically improve reliability | | |
| DOS-26.1 | 26. Multi-agent directorial system | Specialised AI roles — MASTER DIRECTOR; │; ┌──────────────┼──────────────┐; │              │              │; STORY AGENT    CINEMA AGENT    AUDIO AGENT; │              │              │; SCRIPT AGENT    SHOT AGENT     MUSIC AGENT; │          | | |
| DOS-26.2 | 26. Multi-agent directorial system | (author's note) Current OpenAI APIs even provide a multi-agent | | |
| DOS-27.1 | 27. But don't create 20 agents just because you can | Too many agents create — conflicting decisions; context explosion; higher cost; unpredictability | | |
| DOS-27.2 | 27. But don't create 20 agents just because you can | Start with — 1. Director | | |
| DOS-28.1 | 28. The Director should control them | The user shouldn't have to manage agents. The user says | | |
| DOS-29.1 | 29. The user can interrupt at any level | The user could say — > "Change Maya's jacket to red." | | |
| DOS-29.2 | 29. The user can interrupt at any level | CineForge shouldn't regenerate the entire film. Instead — Film Bible; ↓; Character Bible; ↓; Maya wardrobe state; ↓; affected shots identified; ↓; only affected assets regenerated | | |
| DOS-30.1 | 30. Dependency graph | Every asset knows what depends on it. Example — Maya; │; ├── Scene 03; │    ├── Shot 12; │    └── Shot 13; │; ├── Scene 07; │    ├── Shot 31; │    └── Shot 32; │; └── Scene 11; └── Shot 58 | | |
| DOS-30.2 | 30. Dependency graph | Change Maya's appearance — Maya changed; ↓; dependency graph; ↓; affected shots; ↓; regenerate only affected shots | | |
| DOS-31.1 | 31. Version everything | Use — Film v1; Film v2; Film v3 | | |
| DOS-31.2 | 31. Version everything | Never destroy the previous version — --- | | |
| DOS-32.1 | 32. Continuity Engine | One of CineForge's signature technologies. It checks | | |
| DOS-32.2 | 32. Continuity Engine | Character — face; hair; age; clothes; injuries; position; emotional state | | |
| DOS-32.3 | 32. Continuity Engine | Environment — weather; time; lighting; architecture; objects | | |
| DOS-32.4 | 32. Continuity Engine | Story — knowledge; relationships; plot state; dead/alive state; location; timeline | | |
| DOS-32.5 | 32. Continuity Engine | Cinematography — screen direction; eyeline; camera axis; shot progression | | |
| DOS-32.6 | 32. Continuity Engine | Audio — voice; room; ambience; music; sound continuity | | |
| DOS-33.1 | 33. Temporal continuity | The system understands — Scene 10 happens at 14:00.; Scene 11 happens 3 minutes later.; Scene 12 happens next morning. | | |
| DOS-33.2 | 33. Temporal continuity | Therefore — weather; sun; clothing; injuries; objects; character knowledge | | |
| DOS-34.1 | 34. Visual memory | Store references for every important entity — character reference; location reference; prop reference; costume reference; vehicle reference; architecture reference; style reference | | |
| DOS-34.2 | 34. Visual memory | The image generator receives the appropriate references for each | | |
| DOS-35.1 | 35. Reference pack | For every scene, CineForge automatically assembles — SCENE REFERENCE PACK; --------------------; Character references; Location references; Prop references; Costume references; Previous shot; Previous scene; Style reference; Camera referenc | | |
| DOS-35.2 | 35. Reference pack | The generation engine then receives only the relevant context. This | | |
| DOS-36.1 | 36. Shot-to-shot visual memory | A generated shot becomes an input reference for the next shot when | | |
| DOS-36.2 | 36. Shot-to-shot visual memory | The next generation knows — where the character ended; where the camera ended; where objects were; what lighting looked like | | |
| DOS-37.1 | 37. Scene lock | Once a scene is approved — SCENE LOCKED | | |
| DOS-37.2 | 37. Scene lock | The system preserves — character identity; location; wardrobe; lighting; visual style; approved references | | |
| DOS-38.1 | 38. Film lock | At the end — FILM LOCK | | |
| DOS-38.2 | 38. Film lock | Then the system produces the final master | | |
| DOS-39.1 | 39. Quality gates | Before a scene becomes final — STORY PASS; ↓; VISUAL PASS; ↓; CONTINUITY PASS; ↓; AUDIO PASS; ↓; TECHNICAL PASS; ↓; EDITORIAL PASS | | |
| DOS-39.2 | 39. Quality gates | If one fails — REVISE | | |
| DOS-40.1 | 40. Technical QC | The existing CineForge media engine checks — resolution; fps; codec; frame rate; duration; audio sample rate; channels; loudness; black frames; dropped frames; corrupt frames; audio/video sync | | |
| DOS-40.2 | 40. Technical QC | The previous film-mux issue is exactly the kind of thing this layer | | |
| DOS-40.3 | 40. Technical QC | The timeline explicitly determines — picture duration; audio duration; padding; ducking; extension; fade | | |
| DOS-41.1 | 41. Movie cost optimization | Because CineForge is building its own GPU infrastructure, the Movie | | |
| DOS-41.2 | 41. Movie cost optimization | Don't spend expensive GPU time generating video for an unapproved | | |
| DOS-42.1 | 42. Two-pass production | PASS 1 — PREVIS. Cheap — script; storyboard; rough images; rough voice; rough timing | | |
| DOS-42.2 | 42. Two-pass production | PASS 2 — FINAL. Expensive — high-quality images; video; voice; music; SFX; upscaling; master | | |
| DOS-43.1 | 43. Three-pass would be even better | PASS 1 — STORY — screenplay; structure; characters; scenes | | |
| DOS-43.2 | 43. Three-pass would be even better | PASS 2 — PREVIS — storyboard; rough voices; camera; timing | | |
| DOS-43.3 | 43. Three-pass would be even better | PASS 3 — FINAL — image; video; audio; editing; mastering | | |
| DOS-43.4 | 43. Three-pass would be even better | This should become the CineForge standard | | |
| DOS-44.1 | 44. The user interface | The Movie layer is not just another chat window. Use — ┌─────────────────────────────────────────────┐; │                 CINEFORGE                   │; ├───────────┬─────────────────────┬───────────┤; │ FILM      │                     │ DI | | |
| DOS-45.1 | 45. Director chat | The user can say — > "Make Scene 7 darker and more psychologically disturbing." | | |
| DOS-45.2 | 45. Director chat | The Director interprets this as — change scene tone; ↓; cinematography revision; ↓; lighting revision; ↓; music revision; ↓; possibly dialogue revision; ↓; affected shots identified | | |
| DOS-46.1 | 46. Natural-language editing | The user should be able to say — > "Make the opening 15 seconds faster." | | |
| DOS-46.2 | 46. Natural-language editing | CineForge determines — timeline dependencies | | |
| DOS-46.3 | 46. Natural-language editing | The user doesn't need to understand the timeline representation | | |
| DOS-47.1 | 47. "Why" explanation | Every major AI decision has an internal explanation record. For | | |
| DOS-47.2 | 47. "Why" explanation | This makes CineForge much easier to debug | | |
| DOS-48.1 | 48. AI decision log | Store — agent; model; prompt version; input context; output schema; decision; timestamp; cost | | |
| DOS-48.2 | 48. AI decision log | This creates an audit trail — --- | | |
| DOS-49.1 | 49. Prompt versioning | Do not hard-code giant prompts throughout the application. Create — prompts/; director/; screenplay/; scene/; cinematography/; image/; video/; audio/; continuity/; editor/ | | |
| DOS-49.2 | 49. Prompt versioning | Each prompt has — version; purpose; model; schema; evaluation score | | |
| DOS-49.3 | 49. Prompt versioning | Then CineForge can be improved without rewriting the engine | | |
| DOS-50.1 | 50. Evaluation system | Build an internal benchmark. For example — 100 test scenes; 50 characters; 30 locations; 20 continuity tests; 20 dialogue tests; 20 cinematography tests | | |
| DOS-50.2 | 50. Evaluation system | Every new prompt/model change runs the benchmark. Measure — character consistency; story consistency; prompt adherence; continuity; visual quality; audio quality; cost; latency | | |
| DOS-50.3 | 50. Evaluation system | Do not rely on "It looks better to me." Use measurable evaluation | | |
| DOS-50.4 | 50. Evaluation system | (author's note) OpenAI's Structured Outputs guidance also explicitly | | |
| DOS-51.1 | 51. Model router | Don't permanently tie CineForge to OpenAI. Create an AI Provider | | |
| DOS-51.2 | 51. Model router | Then — Director → best reasoning model; Image → best image model; Video → best video model; Voice → best voice model; Music → best music model | | |
| DOS-52.1 | 52. ChatGPT should not be the only intelligence | Important for long-term strategy. Use OpenAI as one of the strongest | | |
| DOS-52.2 | 52. ChatGPT should not be the only intelligence | Then providers can change as models improve | | |
| DOS-53.1 | 53. The "DirectorOS" | Give this subsystem its own name: CineForge DirectorOS. It is the | | |
| DOS-54.1 | 54. The really advanced part | To be ahead of today's video generators, don't think of CineForge as | | |
| DOS-54.2 | 54. The really advanced part | The system remembers — WHO; WHERE; WHEN; WHY; WHAT HAPPENED; WHAT CHANGED; WHAT THE CAMERA SAW; WHAT THE AUDIENCE KNOWS; WHAT THE CHARACTER KNOWS; WHAT OBJECTS EXIST; WHAT SOUNDS EXIST; WHAT MUST REMAIN CONSISTENT | | |
| DOS-55.1 | 55. World State Engine | At every point in the film a WORLD STATE exists. Example — "storyTime": "2038-10-17T23:14"; "locations": {; "warehouse": {; "weather": "rain"; "power": "partial"; "doors": {; "east": "open"; "characters": {; "maya": {; "location": "warehous | | |
| DOS-55.2 | 55. World State Engine | Every shot is generated against this world state. Far more robust | | |
| DOS-56.1 | 56. Story knowledge vs character knowledge | The Director knows the whole story. Maya does not. So — Director Knowledge:; Daniel is secretly alive.; Maya Knowledge:; Daniel is dead. | | |
| DOS-56.2 | 56. Story knowledge vs character knowledge | The system must not accidentally make Maya say "I know Daniel is | | |
| DOS-56.3 | 56. Story knowledge vs character knowledge | This gives proper dramatic storytelling — --- | | |
| DOS-57.1 | 57. Audience knowledge | One step further: track WHAT THE AUDIENCE KNOWS | | |
| DOS-57.2 | 57. Audience knowledge | This allows CineForge to deliberately create — dramatic irony; mystery; revelation; foreshadowing; misdirection; surprise | | |
| DOS-57.3 | 57. Audience knowledge | Something ordinary image-to-video pipelines don't really model | | |
| DOS-58.1 | 58. Foreshadowing graph | The story engine maintains — Plant → Development → Payoff | | |
| DOS-58.2 | 58. Foreshadowing graph | The system can automatically check: did the film actually establish | | |
| DOS-59.1 | 59. The Movie Compiler | Ultimately — USER IDEA; ↓; DIRECTOROS; ↓; FILM BIBLE; ↓; WORLD MODEL; ↓; STORY GRAPH; ↓; SCENE GRAPH; ↓ … | | |
| DOS-59.2 | 59. The Movie Compiler | The existing elastic GPU architecture sits underneath — DIRECTOROS; │; ▼; PRODUCTION JOBS; │; ▼; CINEFORGE QUEUE; │; ▼; GPU SCHEDULER; │; ┌──────────────┼──────────────┐ … | | |

## Part 2 — Engineering & Verification Contract, Intelligence Layer, own image layer

| ID | Section | Requirement (pointer; the full text is in the part file) | Cineforge status | Where / notes |
|---|---|---|---|---|
| DOS-60.1 | 60. The critical issue to correct before giving Claude the architecture | The Part 1 architecture is conceptually strong but not yet strict enough to guarantee a high-quality | | |
| DOS-60.2 | 60. The critical issue to correct before giving Claude the architecture | The real problem: three different levels to distinguish — | | |
| DOS-60.3 | 60. The critical issue to correct before giving Claude the architecture | The previous architecture was mostly Level 1, with some Level 2. It must be taken to Level 3. | | |
| DOS-61.1 | 61. The CineForge DirectorOS Implementation Contract | Create a CineForge DirectorOS Implementation Contract, not merely an architecture document. | | |
| DOS-61.2 | 61. The CineForge DirectorOS Implementation Contract | Every job description must have: | | |
| DOS-62.1 | 62. Example — Character Continuity Engine | The weak specification would be: — | | |
| DOS-62.2 | 62. Example — Character Continuity Engine | The specification should instead say: — | | |
| DOS-62.3 | 62. Example — Character Continuity Engine | Responsibility — The engine must maintain canonical character state across the entire Film IR and prevent downstream | | |
| DOS-62.4 | 62. Example — Character Continuity Engine | Required inputs — | | |
| DOS-62.5 | 62. Example — Character Continuity Engine | Required checks — The engine MUST compare: | | |
| DOS-62.6 | 62. Example — Character Continuity Engine | Required output — | | |
| DOS-62.7 | 62. Example — Character Continuity Engine | Forbidden — The engine must never return: | | |
| DOS-62.8 | 62. Example — Character Continuity Engine | Acceptance test — Given: | | |
| DOS-62.9 | 62. Example — Character Continuity Engine | Integration test — Change Maya's canonical wardrobe. Then verify: | | |
| DOS-62.10 | 62. Example — Character Continuity Engine | If that doesn't happen, the feature is NOT IMPLEMENTED. That is the level of specification Claude ne | | |
| DOS-63.1 | 63. This applies to EVERY major subsystem | DirectorOS should not merely contain: | | |
| DOS-64.1 | 64. The Director — contract | Not "The Director creates the movie." Instead: | | |
| DOS-65.1 | 65. Story Engine — proof | It needs to prove: | | |
| DOS-66.1 | 66. Scene Architect — proof | Must prove: | | |
| DOS-66.2 | 66. Scene Architect — proof | And: | | |
| DOS-67.1 | 67. Shot Architect — proof | Must prove: | | |
| DOS-67.2 | 67. Shot Architect — proof | Then: | | |
| DOS-67.3 | 67. Shot Architect — proof | This connects directly to the Master Production Clock work already identified in the existing media- | | |
| DOS-68.1 | 68. Prompt Compiler — strict protection | This one especially needs strict protection. Claude could easily implement: | | |
| DOS-68.2 | 68. Prompt Compiler — strict protection | Instead: | | |
| DOS-68.3 | 68. Prompt Compiler — strict protection | And it needs tests. For example: if Maya is wearing a red coat in the canonical state, the compiled | | |
| DOS-68.4 | 68. Prompt Compiler — strict protection | Not necessarily literally the words "red coat", because the actual model adapter may use reference i | | |
| DOS-69.1 | 69. The Image Engine — contract | This is where "wired but not functional" becomes particularly dangerous. The job description cannot | | |
| DOS-69.2 | 69. The Image Engine — contract | Then test: | | |
| DOS-69.3 | 69. The Image Engine — contract | If Claude mocks the generation response: | | |
| DOS-70.1 | 70. The critical principle — never self-certify | Never allow a component to prove itself by returning its own claimed status. | | |
| DOS-70.2 | 70. The critical principle — never self-certify | Bad: | | |
| DOS-70.3 | 70. The critical principle — never self-certify | Better: | | |
| DOS-71.1 | 71. The same applies to Audio | The existing audio requirements become machine-enforced acceptance criteria, not documentation. For | | |
| DOS-71.2 | 71. The same applies to Audio | The previous bug demonstrated why this matters: the film mux and dubbing pipeline must measure pictu | | |
| DOS-71.3 | 71. The same applies to Audio | That should be an automated regression test forever. | | |
| DOS-72.1 | 72. DirectorOS needs the same philosophy — zero hidden TODO functionality | The Movie Layer should have zero "TODO" functionality hidden behind interfaces. Claude should not be | | |
| DOS-72.2 | 72. DirectorOS needs the same philosophy — zero hidden TODO functionality | Those should cause the build/verification process to fail. | | |
| DOS-73.1 | 73. The REALITY GATE | Every CineForge subsystem has a status: | | |
| DOS-73.2 | 73. The REALITY GATE | Claude must never call something "complete" merely because it is wired. For example: | | |
| DOS-74.1 | 74. The "No Fake Completion" rule | At the top of Claude's implementation instructions: | | |
| DOS-75.1 | 75. The "No Silent Degradation" rule | If a required capability is unavailable, the system must report NOT_IMPLEMENTED, UNAVAILABLE, or FAI | | |
| DOS-75.2 | 75. The "No Silent Degradation" rule | Especially important for: | | |
| DOS-76.1 | 76. REAL provider tests | If CineForge says: | | |
| DOS-76.2 | 76. REAL provider tests | ComfyUI should remain the generation engine rather than Claude recreating it. That should remain a h | | |
| DOS-76.3 | 76. REAL provider tests | Likewise Wan must actually generate. Not: | | |
| DOS-77.1 | 77. The Capability Registry | Every subsystem must declare what is actually operational. For example: | | |
| DOS-77.2 | 77. The Capability Registry | That is much safer than pretending everything exposed in the UI is functional. The existing architec | | |
| DOS-78.1 | 78. The UI obeys the Capability Registry | If: | | |
| DOS-79.1 | 79. How to make Claude work differently | Don't tell Claude "Build DirectorOS." Tell it: | | |
| DOS-80.1 | 80. Claude works in phases | Not "Build everything." That is where quality collapses. Instead: | | |
| DOS-80.2 | 80. Claude works in phases | PHASE 0 — AUDIT — Claude examines the existing repository. No implementation. Produces: | | |
| DOS-80.3 | 80. Claude works in phases | PHASE 1 — CONTRACT — Define: | | |
| DOS-80.4 | 80. Claude works in phases | PHASE 2 — CANON — Implement: | | |
| DOS-80.5 | 80. Claude works in phases | PHASE 3 — STORY — Implement: | | |
| DOS-80.6 | 80. Claude works in phases | PHASE 4 — MEDIA — Wire: | | |
| DOS-80.7 | 80. Claude works in phases | PHASE 5 — QC — Implement: | | |
| DOS-80.8 | 80. Claude works in phases | PHASE 6 — COMPILER — | | |
| DOS-80.9 | 80. Claude works in phases | PHASE 7 — ELASTIC GPU — Then connect the architecture designed earlier: | | |
| DOS-80.10 | 80. Claude works in phases | PHASE 8 — END-TO-END — One complete movie. Not 100 mocked scenes. One actual short film from prompt → final MP4. That becom | | |
| DOS-81.1 | 81. The ultimate acceptance test | Claude receives: | | |
| DOS-81.2 | 81. The ultimate acceptance test | Then automatically verify: | | |
| DOS-81.3 | 81. The ultimate acceptance test | Only then can Claude report: | | |
| DOS-82.1 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | The previous architecture + job descriptions are not yet the final implementation specification. The | | |
| DOS-82.2 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | A second document sits underneath the architecture: CineForge DirectorOS — Engineering & Verificatio | | |
| DOS-82.3 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | Add a Claude Execution Protocol that explicitly prevents: | | |
| DOS-82.4 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | We shouldn't merely tell Claude what CineForge should be. Write the specification so that Claude has | | |
| DOS-82.5 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | Apply exactly the same discipline to the existing docs/38-media-engine-architecture.md and its v2.4/ | | |
| DOS-83.1 | 83. The author's question | Verbatim: | | |
| DOS-83.2 | 83. The author's question | Answer: yes, and this is a better architecture than DirectorOS making many separate ChatGPT/Claude c | | |
| DOS-83.3 | 83. The author's question | Important distinction — We can minimise reasoning-model calls dramatically, but one ChatGPT call cannot literally generate 4 | | |
| DOS-83.4 | 83. The author's question | (author's note) — OpenAI's current Responses API is well suited to this because a single response can produce structur | | |
| DOS-84.1 | 84. Conventional vs recommended call pattern | Instead of — this (expensive, slow, potentially inconsistent): | | |
| DOS-84.2 | 84. Conventional vs recommended call pattern | Recommended: — | | |
| DOS-85.1 | 85. The key innovation — CineForge AI Production Compiler | A component called CineForge AI Production Compiler, distinct from the Director: | | |
| DOS-85.2 | 85. The key innovation — CineForge AI Production Compiler | Example — The user says: | | |
| DOS-85.3 | 85. The key innovation — CineForge AI Production Compiler | The model returns a structured Film Production Package: | | |
| DOS-85.4 | 85. The key innovation — CineForge AI Production Compiler | This is extremely important: the LLM isn't producing "a screenplay". It is producing an executable p | | |
| DOS-86.1 | 86. Then CineForge takes over | Suppose GPT produces: | | |
| DOS-86.2 | 86. Then CineForge takes over | This dramatically reduces API calls — The conventional approach: | | |
| DOS-87.1 | 87. Film IR as the contract between AI and CineForge | The master call should not simply return huge raw JSON. It produces Film IR (Film Intermediate Repre | | |
| DOS-87.2 | 87. Film IR as the contract between AI and CineForge | Compiler analogy (to help Claude understand) — A programmer writes: | | |
| DOS-87.3 | 87. Film IR as the contract between AI and CineForge |  | | |
| DOS-87.4 | 87. Film IR as the contract between AI and CineForge | This also solves the "Claude is average" problem — Claude doesn't get to decide "I'll implement whatever seems reasonable." Claude has to implement the | | |
| DOS-88.1 | 88. Provider-neutral Intelligence Layer and model router | Do not call it ChatGPT Layer. Call it CineForge Intelligence Layer: | | |
| DOS-88.2 | 88. Provider-neutral Intelligence Layer and model router | Model Router — (AI Router): | | |
| DOS-88.3 | 88. Provider-neutral Intelligence Layer and model router | Do not pay GPT to do work CineForge's own infrastructure can already do. | | |
| DOS-89.1 | 89. Don't ask GPT to create actual images if the own engine is better | The LLM decides: | | |
| DOS-90.1 | 90. The LLM is the "brain"; the infrastructure is the "hands" |  | | |
| DOS-91.1 | 91. Changes don't regenerate everything (and don't re-call the AI) | The user says "Make the station much darker." CineForge checks the dependency graph: | | |
| DOS-91.2 | 91. Changes don't regenerate everything (and don't re-call the AI) | The user says "Make Maya's hair shorter." CineForge: | | |
| DOS-92.1 | 92. Film State — the database is the source of truth | The AI layer maintains FILM STATE, containing: | | |
| DOS-92.2 | 92. Film State — the database is the source of truth | The next AI request receives only the relevant state, not the entire history. That saves tokens and | | |
| DOS-92.3 | 92. Film State — the database is the source of truth | No permanent giant ChatGPT conversation. Instead: | | |
| DOS-93.1 | 93. One Master Call + Surgical Calls | Initial creation: — 1 MASTER LLM CALL generates: | | |
| DOS-93.2 | 93. One Master Call + Surgical Calls | Later, only if necessary: — a TARGETED LLM CALL. Examples: | | |
| DOS-93.3 | 93. One Master Call + Surgical Calls | So instead of LLM call, LLM call, LLM call, … you get: | | |
| DOS-94.1 | 94. Tool definitions — proposed, validated, then executed | The master AI request can include tool definitions. For example the Director has access to: | | |
| DOS-94.2 | 94. Tool definitions — proposed, validated, then executed | (author's note) — OpenAI's current Responses API supports function calling for connecting the model to application fun | | |
| DOS-94.3 | 94. Tool definitions — proposed, validated, then executed | But do not let the model freely execute arbitrary functions. Instead: | | |
| DOS-95.1 | 95. Images are a special case | (author's note) — With OpenAI's current Responses API, a model can use an image-generation tool as part of a response, | | |
| DOS-95.2 | 95. Images are a special case | But the image engine stays provider-neutral, because these must all be interchangeable: | | |
| DOS-95.3 | 95. Images are a special case | DirectorOS says: | | |
| DOS-96.1 | 96. The revised architecture | The previous architecture is modified to: | | |
| DOS-97.1 | 97. The most important rule — call AI only when reasoning is required | The AI should not be called because a piece of the pipeline exists. It should be called because reas | | |
| DOS-97.2 | 97. The most important rule — call AI only when reasoning is required | No AI call needed — (deterministic): | | |
| DOS-97.3 | 97. The most important rule — call AI only when reasoning is required | AI call needed: — | | |
| DOS-98.1 | 98. Batch reasoning | Suppose there are 30 shots. Don't do 30 GPT calls. Give the model the entire scene/sequence and requ | | |
| DOS-98.2 | 98. Batch reasoning | (author's note) — Structured Outputs are designed specifically to make this kind of machine-consumable response reliab | | |
| DOS-99.1 | 99. Name — CineForge One-Pass Intelligence / Multi-Pass Execution | Not literally one API call for the entire movie in every situation, because very large films eventua | | |
| DOS-100.1 | 100. Specification text to add for Claude (verbatim) |  | | |
| DOS-100.2 | 100. Specification text to add for Claude (verbatim) |  | | |
| DOS-100.3 | 100. Specification text to add for Claude (verbatim) |  | | |
| DOS-100.4 | 100. Specification text to add for Claude (verbatim) |  | | |
| DOS-100.5 | 100. Specification text to add for Claude (verbatim) |  | | |
| DOS-100.6 | 100. Specification text to add for Claude (verbatim) |  | | |
| DOS-100.7 | 100. Specification text to add for Claude (verbatim) |  | | |
| DOS-100.8 | 100. Specification text to add for Claude (verbatim) | In one sentence: — | | |
| DOS-101.1 | 101. The author's question and the answer | Verbatim: | | |
| DOS-101.2 | 101. The author's question and the answer | No. OpenAI Image Generation is not needed when CineForge builds its own image-generation layer. Open | | |
| DOS-101.3 | 101. The author's question and the answer | Recommended architecture: — | | |
| DOS-101.4 | 101. The author's question and the answer | OpenAI does not have to generate the image. It can determine "This is what the image needs to be." T | | |
| DOS-102.1 | 102. Owning the image pipeline gives more control | DirectorOS could produce: | | |
| DOS-102.2 | 102. Owning the image pipeline gives more control | CineForge's Prompt Compiler converts that into the exact format the image engine needs: | | |
| DOS-103.1 | 103. ComfyUI is the execution/generation graph underneath CineForge | This is exactly where ComfyUI belongs. Don't have Claude rebuild ComfyUI. Use ComfyUI as the executi | | |
| DOS-103.2 | 103. ComfyUI is the execution/generation graph underneath CineForge | CineForge decides: | | |
| DOS-103.3 | 103. ComfyUI is the execution/generation graph underneath CineForge |  | | |
| DOS-103.4 | 103. ComfyUI is the execution/generation graph underneath CineForge | New models can be added later without changing DirectorOS. | | |
| DOS-104.1 | 104. What OpenAI/Claude should actually do (and not do) | Spend the API money on: | | |
| DOS-104.2 | 104. What OpenAI/Claude should actually do (and not do) | But not: | | |
| DOS-105.1 | 105. Provider interface — no lock-in |  | | |
| DOS-105.2 | 105. Provider interface — no lock-in | DirectorOS doesn't care. It produces ImageGenerationRequest; the provider adapter handles the actual | | |
| DOS-106.1 | 106. OpenAI image generation is optional, not foundational | Capability registry example: | | |
| DOS-106.2 | 106. OpenAI image generation is optional, not foundational | The system can then choose: | | |
| DOS-106.3 | 106. OpenAI image generation is optional, not foundational | OpenAI can be activated later as one additional provider. | | |
| DOS-107.1 | 107. The important distinction — intelligence vs media generation | Don't confuse AI intelligence with AI media generation. They are two different things. | | |
| DOS-107.2 | 107. The important distinction — intelligence vs media generation | The goal: | | |
| DOS-107.3 | 107. The important distinction — intelligence vs media generation | That gives a much stronger product architecture than making CineForge dependent on OpenAI's image ge | | |

## Part 3 — Voice Clone Talker, Voice Engine and Voice Studio

| ID | Section | Requirement (pointer; the full text is in the part file) | Cineforge status | Where / notes |
|---|---|---|---|---|
| DOS-108.1 | 108. Two different things to distinguish | If "Voice Clone Talker" means the newer voice-clone "talker" architecture, that is very relevant to | | |
| DOS-108.2 | 108. Two different things to distinguish | Voice cloning — This is: | | |
| DOS-108.3 | 108. Two different things to distinguish | A Voice Clone Talker — A talker model is the actual neural generation component that takes the text plus a voice reference/ | | |
| DOS-108.4 | 108. Two different things to distinguish | For example, the newer Qwen3-TTS ecosystem has a specific voice_clone talker model set, including co | | |
| DOS-109.1 | 109. Building it into CineForge — the Voice Engine beside Image and Video | Yes, this can be built into the author's own system. Structure the CineForge architecture like this: | | |
| DOS-109.2 | 109. Building it into CineForge — the Voice Engine beside Image and Video | The Clone Talker becomes one of CineForge's own GPU workers. | | |
| DOS-110.1 | 110. Reusable voice profiles — enroll once | This is where it becomes powerful. A user uploads 30–60 seconds of their voice. The system creates: | | |
| DOS-110.2 | 110. Reusable voice profiles — enroll once | The reusable voice profile is stored. | | |
| DOS-110.3 | 110. Reusable voice profiles — enroll once | Every subsequent CineForge project can then say: | | |
| DOS-110.4 | 110. Reusable voice profiles — enroll once | The GPU worker generates the speech. The user doesn't need to upload their voice again. | | |
| DOS-111.1 | 111. Combining with the TALKER / video system | This is where it gets particularly interesting for BalanceVid: | | |
| DOS-111.2 | 111. Combining with the TALKER / video system | So the pipeline becomes: | | |
| DOS-111.3 | 111. Combining with the TALKER / video system | Projects such as Linly-Talker demonstrate this general architecture by combining LLM, ASR, TTS, voic | | |
| DOS-112.1 | 112. What to use — not one model responsible for everything | Do not make one model responsible for everything. Instead, the Voice Engine: | | |
| DOS-112.2 | 112. What to use — not one model responsible for everything | Underneath that, experiment with models such as: | | |
| DOS-112.3 | 112. What to use — not one model responsible for everything | Qwen3-TTS implementations, for example, already expose a dedicated voice-cloning generation path usi | | |
| DOS-113.1 | 113. Recommendation — a Voice Engine that swaps models underneath | Don't build a "Qwen3-TTS clone." Build a CineForge Voice Engine that can swap models underneath: | | |
| DOS-113.2 | 113. Recommendation — a Voice Engine that swaps models underneath | Then the API, database, voice profiles, job system, billing, permissions, audio processing and UI re | | |
| DOS-113.3 | 113. Recommendation — a Voice Engine that swaps models underneath | That gives something much more valuable than simply having a voice-cloning model: your own voice-gen | | |
| DOS-114.1 | 114. Commercial licensing check before choosing the production model | Check commercial licensing carefully before selecting the production model: an open-source model bei | | |
| DOS-114.2 | 114. Commercial licensing check before choosing the production model | Linly-Talker itself explicitly warns that its referenced models have their own licensing requirement | | |
| DOS-115.1 | 115. Clone your own voice and read any script | That is absolutely possible. Provide a recording of your own voice once, create your voice profile, | | |
| DOS-116.1 | 116. More than reading text — the script controls | Give the system a script, for example: | | |
| DOS-116.2 | 116. More than reading text — the script controls | And select: | | |
| DOS-116.3 | 116. More than reading text — the script controls | The Clone Talker generates the corresponding audio, which is fed directly into the existing CineForg | | |
| DOS-117.1 | 117. Modes | Narrator — | | |
| DOS-117.2 | 117. Modes | Presenter — | | |
| DOS-117.3 | 117. Modes | Dubbing — | | |
| DOS-117.4 | 117. Modes | Conversation — | | |
| DOS-117.5 | 117. Modes | So you could effectively create a digital version of yourself that can read scripts, narrate films, | | |
| DOS-118.1 | 118. Private voice identity, no external voice provider per request | Because the author is building their own infrastructure, the goal could be: | | |
| DOS-119.1 | 119. CineForge Voice Studio | Call this CineForge Voice Studio rather than just "voice cloning." It could become a complete produc | | |
| DOS-120.1 | 120. Why people say it is hard | It is called hard because people often mean training a voice-cloning model from scratch. That is gen | | |
| DOS-120.2 | 120. Why people say it is hard | Building a production system that uses an existing voice-cloning/talker architecture is much more ac | | |
| DOS-121.1 | 121. The architecture — clone from a short reference, read arbitrary scripts | The architecture that clones a voice from a short reference recording and then reads arbitrary scrip | | |
| DOS-122.1 | 122. The Talker is the difficult neural component | The Talker has to learn things such as: | | |
| DOS-122.2 | 122. The Talker is the difficult neural component | That is why building the model itself from scratch is hard. But you don't necessarily need to train | | |
| DOS-123.1 | 123. The newer, more sophisticated architecture | A modern system can look more like: | | |
| DOS-123.2 | 123. The newer, more sophisticated architecture | This is fundamentally different from old systems where a separate TTS model had to be trained for ev | | |
| DOS-123.3 | 123. The newer, more sophisticated architecture | The speaker embedding allows the system to preserve the identity of the reference speaker. | | |
| DOS-124.1 | 124. Why it fits the project — the infrastructure already exists | CineForge already has the infrastructure needed for the difficult engineering part: | | |
| DOS-125.1 | 125. The voice-worker | The Voice Worker could therefore be: | | |
| DOS-126.1 | 126. The API | CineForge simply calls: | | |
| DOS-127.1 | 127. Where it becomes genuinely hard — three levels | Level 1 — Use an existing model. Difficulty: manageable — Install an existing voice-cloning model and build the API, GPU worker, storage, UI and job | | |
| DOS-127.2 | 127. Where it becomes genuinely hard — three levels | Level 2 — Fine-tune/adapt the model. Difficulty: advanced — Collect your own voice dataset and adapt the model to improve: | | |
| DOS-127.3 | 127. Where it becomes genuinely hard — three levels | Level 3 — Create your own Talker model. Difficulty: very high — Now this is actual ML research: | | |
| DOS-127.4 | 127. Where it becomes genuinely hard — three levels | You don't need Level 3 to build your own commercial Voice Engine. | | |
| DOS-128.1 | 128. The strategy for CineForge | Don't make the mistake of thinking: "I need to build a voice-cloning AI from zero." Instead: build t | | |
| DOS-128.2 | 128. The strategy for CineForge | The architecture becomes: | | |
| DOS-128.3 | 128. The strategy for CineForge | That means the architecture is yours even if the underlying Talker model changes. | | |
| DOS-129.1 | 129. Selecting the Talker | This matters particularly because the author has already been dealing with model licensing issues in | | |
| DOS-129.2 | 129. Selecting the Talker | Offered next step (not yet taken): map out the exact Voice Engine architecture for CineForge, includ | | |

## Part 4 — Voice Engine: models, licensing, architecture, implementation spec

| ID | Section | Requirement (pointer; the full text is in the part file) | Cineforge status | Where / notes |
|---|---|---|---|---|
| DOS-130.1 | 130. The shortlist — licensing differs substantially | There are quite a few, and the choice matters a lot for CineForge because licensing differs substant | | |
| DOS-130.2 | 130. The shortlist — licensing differs substantially | \For a commercial CineForge service, don't treat the table as legal clearance; you need to verify th | | |
| DOS-131.1 | 131. Qwen3-TTS — the one to investigate first | This is particularly interesting for the architecture. It has a voice-cloning mode rather than requi | | |
| DOS-131.2 | 131. Qwen3-TTS — the one to investigate first | For the system: | | |
| DOS-131.3 | 131. Qwen3-TTS — the one to investigate first | There are also different model sizes, so you can potentially have a smaller/cheaper worker and a hig | | |
| DOS-132.1 | 132. CosyVoice 3 | Another one to take very seriously. The CosyVoice project currently recommends Fun-CosyVoice3-0.5B, | | |
| DOS-132.2 | 132. CosyVoice 3 | For CineForge: | | |
| DOS-132.3 | 132. CosyVoice 3 | The relatively small 0.5B model is particularly interesting because you don't necessarily need an en | | |
| DOS-133.1 | 133. Fish Speech / Fish Audio S2 | Fish Speech is technically very impressive. The current S2 Pro is described as a 4B-parameter multil | | |
| DOS-133.2 | 133. Fish Speech / Fish Audio S2 | Be cautious for the commercial architecture because of licensing. The current Fish Speech repository | | |
| DOS-134.1 | 134. GPT-SoVITS | One of the better-known voice-cloning architectures. Its approach separates parts of the speech-gene | | |
| DOS-134.2 | 134. GPT-SoVITS | It can work with relatively small amounts of reference/training data and has a large ecosystem. Curr | | |
| DOS-135.1 | 135. F5-TTS | F5-TTS is technically excellent and uses a flow-matching approach. Its code is MIT licensed. GitHub | | |
| DOS-135.2 | 135. F5-TTS | But the publicly released pretrained weights are currently CC-BY-NC, meaning non-commercial. GitHub | | |
| DOS-136.1 | 136. What to actually do — pluggable models, benchmark with your own voice | Don't pick one model immediately. Build the architecture so that models are pluggable: | | |
| DOS-136.2 | 136. What to actually do — pluggable models, benchmark with your own voice | Then benchmark them using your actual voice. Test the same: | | |
| DOS-136.3 | 136. What to actually do — pluggable models, benchmark with your own voice | And measure: | | |
| DOS-137.1 | 137. Initial shortlist | If the goal is specifically: | | |
| DOS-137.2 | 137. Initial shortlist | Do not make F5-TTS the commercial production choice using its standard public weights, because of th | | |
| DOS-137.3 | 137. Initial shortlist | This is where the idea becomes much less "hard" than the author was originally told: we don't need t | | |
| DOS-138.1 | 138. Free to run vs free for commercial use | Yes — many of the models are free to download and run, but "free" and "free for commercial use" are | | |
| DOS-139.1 | 139. The licensing findings | The current licensing was checked rather than relying on older information. | | |
| DOS-139.2 | 139. The licensing findings | GPT-SoVITS's software repository is MIT licensed, which permits commercial use, modification, distri | | |
| DOS-139.3 | 139. The licensing findings | Fish Speech is different. Its current Research License explicitly says research/non-commercial use i | | |
| DOS-139.4 | 139. The licensing findings | Qwen3-TTS is particularly interesting because its Qwen TTS package is Apache-2.0 licensed. Hugging F | | |
| DOS-140.1 | 140. Start order and the abstraction | Start with: | | |
| DOS-140.2 | 140. Start order and the abstraction | Then build your own abstraction: | | |
| DOS-140.3 | 140. Start order and the abstraction | That means you don't pay per generated minute to ElevenLabs or another hosted voice provider. You pa | | |
| DOS-140.4 | 140. Start order and the abstraction | And you can clone your own voice, save your speaker profile, and then generate unlimited scripts sub | | |
| DOS-141.1 | 141. The caveat, and where to focus evaluation | Even when the model license permits commercial use, you still need to check the exact model checkpoi | | |
| DOS-141.2 | 141. The caveat, and where to focus evaluation | If the objective is "I want the best free/open model that I can legally put inside CineForge and use | | |
| DOS-142.1 | 142. The direction is set | For CineForge, make Qwen3-TTS the first model to benchmark, with CosyVoice 3 and GPT-SoVITS as fallb | | |
| DOS-142.2 | 142. The direction is set | The next sensible step is to design the CineForge Voice Engine architecture around a model-independe | | |
| DOS-142.3 | 142. The direction is set | Clear direction: CineForge Voice Engine, with Qwen3-TTS as the first implementation and a pluggable | | |
| DOS-143.0 | D. Model-independent architecture (preamble) | Design it so CineForge never knows whether the speech was generated by Qwen3-TTS, CosyVoice, GPT-SoV | | |
| DOS-143.1 | 143. (D1) The recommended architecture |  | | |
| DOS-143.2 | 143. (D1) The recommended architecture | This is the key architectural decision: the adapters change. The API does not. | | |
| DOS-144.1 | 144. (D2) Five major subsystems |  | | |
| DOS-145.1 | 145. (D3) The API is the permanent interface — register a voice |  | | |
| DOS-145.2 | 145. (D3) The API is the permanent interface — register a voice | The database knows that voice_8f31c belongs to the user's voice. | | |
| DOS-146.1 | 146. (D4) Generate speech | CineForge doesn't call Qwen directly. It calls: | | |
| DOS-146.2 | 146. (D4) Generate speech | The Voice Engine decides which model should handle it. | | |
| DOS-147.1 | 147. (D5) The model adapter — a common interface |  | | |
| DOS-147.2 | 147. (D5) The model adapter — a common interface | Qwen3 might internally call its generate_voice_clone() functionality, while CineForge remains comple | | |
| DOS-147.3 | 147. (D5) The model adapter — a common interface | CosyVoice has a considerably different internal architecture — its current implementation combines a | | |
| DOS-148.1 | 148. (D6) The really important part: Voice Profiles | Don't store only the original WAV. Store a proper voice profile: | | |
| DOS-148.2 | 148. (D6) The really important part: Voice Profiles | For example: | | |
| DOS-148.3 | 148. (D6) The really important part: Voice Profiles | Qwen3-TTS supports an x-vector speaker representation and also an ICL-style reference path, which me | | |
| DOS-149.1 | 149. (D7) Don't generate an entire movie's narration in one request | Instead: | | |
| DOS-149.2 | 149. (D7) Don't generate an entire movie's narration in one request | Each chunk becomes: | | |
| DOS-149.3 | 149. (D7) Don't generate an entire movie's narration in one request | That gives: | | |
| DOS-150.1 | 150. (D8) The existing audio pipeline takes over | This connects directly with the audio work already done: | | |
| DOS-150.2 | 150. (D8) The existing audio pipeline takes over | The AI model does not own mastering. That remains the audio engine's responsibility. | | |
| DOS-151.1 | 151. (D9) Model routing | Initially: | | |
| DOS-151.2 | 151. (D9) Model routing | Later: | | |
| DOS-151.3 | 151. (D9) Model routing | Eventually the router could choose based on: | | |
| DOS-151.4 | 151. (D9) Model routing | For example: | | |
| DOS-152.1 | 152. (D10) GPU infrastructure — separate workers | Do not put the model directly into the main CineForge application container. Use separate workers: | | |
| DOS-152.2 | 152. (D10) GPU infrastructure — separate workers | A worker can start, load the model, process jobs, and remain warm. | | |
| DOS-153.1 | 153. (D11) Cloud and self-hosted | Cloud: | | |
| DOS-153.2 | 153. (D11) Cloud and self-hosted | Self-hosted: | | |
| DOS-153.3 | 153. (D11) Cloud and self-hosted | Same API. Same CineForge application. Different deployment. | | |
| DOS-154.1 | 154. (D12) Voice caching | If "Welcome to BalanceVid." is generated and later the exact same sentence is requested, don't gener | | |
| DOS-154.2 | 154. (D12) Voice caching | This can save enormous GPU time. | | |
| DOS-155.1 | 155. (D13) Batch generation | For a movie with 100 narration segments, don't send 100 independent HTTP requests from CineForge. Us | | |
| DOS-155.2 | 155. (D13) Batch generation | The worker can optimize model loading and GPU utilization. | | |
| DOS-156.1 | 156. (D14) The architecture to freeze for CineForge |  | | |
| DOS-156.2 | 156. (D14) The architecture to freeze for CineForge | The crucial design decision — Do not let CineForge depend on Qwen3-TTS. Let CineForge depend on: | | |
| DOS-156.3 | 156. (D14) The architecture to freeze for CineForge | This isn't theoretical: Qwen3-TTS already exposes the underlying voice-cloning primitives needed for | | |
| DOS-156.4 | 156. (D14) The architecture to freeze for CineForge | Freeze this architecture before Claude starts coding it. The next implementation step is to define t | | |
| DOS-157.0 | E. Implementation specification (preamble) | This is the next layer to give to Claude. The objective is to build the Voice Engine as an independe | | |
| DOS-157.1 | 157. (E1) Repository structure |  | | |
| DOS-157.2 | 157. (E1) Repository structure | The most important boundary is packages/core/voice-engine.ts. That becomes the contract every model | | |
| DOS-158.1 | 158. (E2) Model-independent interface |  | | |
| DOS-158.2 | 158. (E2) Model-independent interface | Qwen3 implements it. CosyVoice implements it. GPT-SoVITS implements it. CineForge never calls their | | |
| DOS-159.1 | 159. (E3) Voice enrollment | The user experience: | | |
| DOS-159.2 | 159. (E3) Voice enrollment | API: | | |
| DOS-159.3 | 159. (E3) Voice enrollment | The API should return immediately. The GPU work happens asynchronously. | | |
| DOS-160.1 | 160. (E4) Voice quality analysis | Before creating the voice profile, analyze the recording. Check: | | |
| DOS-160.2 | 160. (E4) Voice quality analysis | For example: | | |
| DOS-160.3 | 160. (E4) Voice quality analysis | If the recording is poor: | | |
| DOS-160.4 | 160. (E4) Voice quality analysis | This is important because garbage reference audio produces poor voice cloning. | | |
| DOS-161.1 | 161. (E5) Voice profile — and engine-specific artifacts | Database voice_profiles, recommended fields: | | |
| DOS-161.2 | 161. (E5) Voice profile — and engine-specific artifacts | But don't assume every model has the same representation. Therefore voice_engine_artifacts holds eng | | |
| DOS-161.3 | 161. (E5) Voice profile — and engine-specific artifacts | For Qwen: artifact_type = qwen_voice_clone_prompt. For another engine: artifact_type = speaker_embed | | |
| DOS-162.1 | 162. (E6) Synthesis API | CineForge calls: | | |
| DOS-162.2 | 162. (E6) Synthesis API | Don't make the HTTP request wait for GPU inference. | | |
| DOS-163.1 | 163. (E7) Job architecture | Use the existing queue philosophy: | | |
| DOS-163.2 | 163. (E7) Job architecture | Job: | | |
| DOS-164.1 | 164. (E8) Job states |  | | |
| DOS-164.2 | 164. (E8) Job states | This gives CineForge reliable progress tracking. | | |
| DOS-165.1 | 165. (E9) Long scripts | Don't send a 30-minute script directly into the model. Pipeline: | | |
| DOS-165.2 | 165. (E9) Long scripts | Each segment gets: | | |
| DOS-166.1 | 166. (E10) Audio mastering belongs outside the model | This is critical. Do not ask the TTS model to be your mastering system. Architecture: | | |
| DOS-166.2 | 166. (E10) Audio mastering belongs outside the model | That integrates with the audio requirements already established for CineForge. | | |
| DOS-167.1 | 167. (E11) Model router | The router receives: | | |
| DOS-167.2 | 167. (E11) Model router | The decision should not be hardcoded into CineForge. Use configuration: | | |
| DOS-167.3 | 167. (E11) Model router | Routing can then change later without rebuilding CineForge. | | |
| DOS-168.1 | 168. (E12) Model capabilities | Every adapter reports what it supports. For example: | | |
| DOS-168.2 | 168. (E12) Model capabilities | Then the router knows what it can safely request. | | |
| DOS-169.1 | 169. (E13) Storage | Don't put generated audio inside PostgreSQL. Use object storage: | | |
| DOS-169.2 | 169. (E13) Storage | PostgreSQL stores metadata. Object storage stores media. | | |
| DOS-170.1 | 170. (E14) Security | Voice profiles are sensitive. At minimum: | | |
| DOS-170.2 | 170. (E14) Security | Never allow POST /v1/speech with someone else's voice_id. Database policy user_id → voice_id must al | | |
| DOS-170.3 | 170. (E14) Security | For voice enrollment, consent_confirmed = true should be required. | | |
| DOS-171.1 | 171. (E15) Docker architecture — separate CPU and GPU services |  | | |
| DOS-171.2 | 171. (E15) Docker architecture — separate CPU and GPU services | So you don't have to install every model on every GPU machine. | | |
| DOS-172.1 | 172. (E16) Deployment |  | | |
| DOS-172.2 | 172. (E16) Deployment | If Render is later stopped, the Voice Engine doesn't care. | | |
| DOS-173.1 | 173. (E17) The most important API boundary — freeze now | CineForge should only know this: | | |
| DOS-173.2 | 173. (E17) The most important API boundary — freeze now | Everything underneath is the implementation. That is the part to freeze now. | | |
| DOS-174.1 | 174. (E18) What Claude should NOT do | Tell Claude explicitly: | | |
| DOS-174.2 | 174. (E18) What Claude should NOT do | Do not embed Qwen3-TTS directly into CineForge. - DOS-174.3 Do not make CineForge import Qwen3 libra | | |
| DOS-174.3 | 174. (E18) What Claude should NOT do | Do not make CineForge import Qwen3 libraries. - DOS-174.4 Do not make the frontend know which TTS mo | | |
| DOS-174.4 | 174. (E18) What Claude should NOT do | Do not make the frontend know which TTS model is being used. - DOS-174.5 Do not store model-specific | | |
| DOS-174.5 | 174. (E18) What Claude should NOT do | Do not store model-specific assumptions in CineForge's database schema. - DOS-174.6 Do not make synt | | |
| DOS-174.6 | 174. (E18) What Claude should NOT do | Do not make synthesis requests synchronous. - DOS-174.7 Do not couple audio mastering to the TTS mod | | |
| DOS-174.7 | 174. (E18) What Claude should NOT do | Do not couple audio mastering to the TTS model. - DOS-174.8 Do not make voice profiles dependent on | | |
| DOS-174.8 | 174. (E18) What Claude should NOT do | Do not make voice profiles dependent on one specific model's internal representation. | | |
| DOS-174.9 | 174. (E18) What Claude should NOT do | Instead: Build a model-independent Voice Engine service with an adapter interface. | | |
| DOS-175.1 | 175. (E19) The development sequence | Have Claude build it in this order: | | |
| DOS-176.1 | 176. The end result | A CineForge user will eventually see something as simple as: | | |
| DOS-176.2 | 176. The end result | Underneath that simple UI is the complete infrastructure: | | |
| DOS-176.3 | 176. The end result | That is the architecture to use rather than making CineForge itself a voice-cloning application. It | | |
