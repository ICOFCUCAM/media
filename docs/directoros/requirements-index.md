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
