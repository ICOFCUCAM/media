# DirectorOS requirements index

One row per requirement ID in the source record. Status and workstream (W0–W11) come from the gap analysis: [gap-analysis.md](gap-analysis.md), dated 2026-10-08 against merge `9c957bf`. A status is a section-level judgement unless the row says otherwise; the evidence is in the gap analysis.

**Status values:** `built` · `shallow` · `poorly built` · `not built` · `n/a` (author's note or recommendation, not a requirement).

## Part 1 — Movie Intelligence Architecture

| ID | Section | Requirement (pointer; the full text is in the part file) | Cineforge status | Where / notes |
|---|---|---|---|---|
| DOS-0.1 | 0. Preamble — the stance | The key architectural idea — > The AI decides what the film should be. CineForge converts that decision into a | shallow | W2 — Plan→flow exists; no Intelligence/Canon/QC stages (film.processor.ts:244, video.processor.ts:323) |
| DOS-0.2 | 0. Preamble — the stance | Author's provider note : OpenAI's current Responses API is | n/a | W2 — Provider note: Director runs on Claude today; decide in the provider router (W2) |
| DOS-0.3 | 0. Preamble — the stance | ### CINEFORGE MOVIE INTELLIGENCE ARCHITECTURE | shallow | W2 — Plan→flow exists; no Intelligence/Canon/QC stages (film.processor.ts:244, video.processor.ts:323) |
| DOS-1.1 | 1. The most important change | Do not make the LLM the video-production engine. Make it the CineForge Director. | built | LLM only plans; ffmpeg/GPU/scheduling deterministic (director/llm.ts, ffmpeg/, orchestration/) |
| DOS-1.2 | 1. The most important change | The Director decides — What happens?; Who is present?; Why does it happen?; Where does it happen?; What should the audience see?; What should the audience hear?; What should the audience feel?; What should happen next? | built | LLM only plans; ffmpeg/GPU/scheduling deterministic (director/llm.ts, ffmpeg/, orchestration/) |
| DOS-1.3 | 1. The most important change | But it does not directly decide — FFmpeg commands; GPU allocation; video encoding; frame interpolation; audio normalization; storage; render scheduling | built | LLM never touches ffmpeg/GPU/storage |
| DOS-2.1 | 2. The four-layer model | Layer A — Intelligence — Director; Story Architect; Screenwriter; Cinematographer; Production Designer; Composer; Sound Director; Continuity Director; Editor; Quality Director | poorly built | W2 — Layers mixed in director.service.ts; split intelligence/canon/production |
| DOS-2.2 | 2. The four-layer model | Layer B — Canon — Film Bible; Character Bible; World Bible; Location Bible; Prop Bible; Style Bible; Audio Bible; Continuity Graph | poorly built | W2 — Layers mixed in director.service.ts; split intelligence/canon/production |
| DOS-2.3 | 2. The four-layer model | Layer C — Production — Scene Planner; Shot Planner; Prompt Compiler; Asset Planner; Generation Scheduler; Timeline Builder | poorly built | W2 — Layers mixed in director.service.ts; split intelligence/canon/production |
| DOS-2.4 | 2. The four-layer model | Layer D — Media Engine — Image generation; Video generation; Audio generation; TTS; Music; SFX; Lip sync; Upscaling; Interpolation; Compositing; FFmpeg; Mastering | built | Execution layer exists (video, image, TTS, music, ffmpeg, LoRA); SFX/foley missing → W7 |
| DOS-2.5 | 2. The four-layer model | This separation is extremely important — --- | poorly built | W2 — Layers mixed in director.service.ts; split intelligence/canon/production |
| DOS-3.1 | 3. Film Bible | The single source of truth for the movie | shallow | W3 — Screenplay = logline/synopsis/acts Json; acts hard-coded to 1 (director.service.ts:80) |
| DOS-3.2 | 3. Film Bible | Location in the codebase — cineforge/; movie/; intelligence/; canon/; film-bible/ | shallow | W3 — Screenplay = logline/synopsis/acts Json; acts hard-coded to 1 (director.service.ts:80) |
| DOS-3.3 | 3. Film Bible | The Film Bible contains — Title; Genre; Logline; Premise; Themes; Tone; Audience; Rating; Era; Geography; Visual language; Narrative structure … | shallow | W3 — Screenplay = logline/synopsis/acts Json; acts hard-coded to 1 (director.service.ts:80) |
| DOS-4.1 | 4. Character Bible | Every character becomes a persistent entity. Example — "characterId": "char_maya"; "name": "Maya"; "age": 34; "role": "protagonist"; "appearance": {}; "faceIdentity": {}; "bodyIdentity": {}; "hair": {}; "voice": {}; "personality": {}; "ward | shallow | W3 — Character free-text appearance; Director makes exactly one protagonist (llm.ts:243) |
| DOS-4.2 | 4. Character Bible | The crucial point: every subsequent scene references the character | shallow | W3 — Character free-text appearance; Director makes exactly one protagonist (llm.ts:243) |
| DOS-4.3 | 4. Character Bible | The generation system then retrieves Maya's canonical identity | shallow | W3 — ID→referenceUrls+LoRA+sha256 retrieval is real (video.processor.ts:142-155) |
| DOS-5.1 | 5. Character state | Do not only store — Maya looks like this. | poorly built | W3 — Name-keyed string state, regex-inferred (shared/continuity.ts:29-350); ContinuityState unused |
| DOS-5.2 | 5. Character state | After a major event — Maya gets injured. | poorly built | W3 — Name-keyed string state, regex-inferred (shared/continuity.ts:29-350); ContinuityState unused |
| DOS-5.3 | 5. Character state | This prevents: Maya gets shot in Scene 17 → magically has no injury in | poorly built | W3 — Name-keyed string state, regex-inferred (shared/continuity.ts:29-350); ContinuityState unused |
| DOS-6.1 | 6. World Bible | The same principle applies to the environment. Example — Location:; Lagos Central Station; Architecture:; 1920s colonial station; Time:; 2038; Weather:; heavy rain; Lighting:; cold fluorescent + sodium exterior; Floor:; wet marble … | shallow | W3 — Location name/kind/description; one location per film |
| DOS-6.2 | 6. World Bible | Every shot referencing the station receives the same world state | shallow | W3 — Location name/kind/description; one location per film |
| DOS-7.1 | 7. Prop Bible | Every important object gets an identity. Example — PROP-017; Silver pocket watch; Owned by Daniel; Scratched glass; Stopped at 02:17; Inherited from father | shallow | W3 — WorldObject written by web only; never read by worker |
| DOS-7.2 | 7. Prop Bible | If it becomes important later — Scene 4:; Daniel possesses watch.; Scene 17:; Daniel loses watch.; Scene 22:; Maya discovers watch.; Scene 31:; watch identifies Daniel's location. | shallow | W3 — WorldObject written by web only; never read by worker |
| DOS-7.3 | 7. Prop Bible | Now the object participates in the story graph. That is much more | shallow | W3 — WorldObject written by web only; never read by worker |
| DOS-8.1 | 8. Story graph | Instead of storing the movie as a long block of text, build a graph — ACT I; │; ├── SCENE 01; │; ├── SCENE 02; │; └── SCENE 03; │; ▼; ACT II; │; ├── SCENE 04 … | not built | W3 — Linear scene index; dependsOn always [i-1]; StoryEvent/Relationship unused |
| DOS-8.2 | 8. Story graph | Each scene has relationships — scene_17; ├── follows scene_16; ├── continues location_03; ├── contains char_maya; ├── references prop_017; ├── resolves plot_thread_04; ├── advances character_arc_maya; └── creates plot_thread_09 | not built | W3 — Linear scene index; dependsOn always [i-1]; StoryEvent/Relationship unused |
| DOS-9.1 | 9. Scene graph | A scene contains much more than dialogue. Example — "sceneId": "scene_017"; "purpose": "Reveal the betrayal"; "locationId": "loc_03"; "time": "night"; "durationSeconds": 94; "characters": [; "char_maya"; "char_daniel"; "props": [; "prop_017 | poorly built | W3 — Scene camera/mood/dialogue free text; DialogueLine never written |
| DOS-10.1 | 10. Shot Architect | This is where CineForge becomes a real filmmaking system rather than | not built | W4 — Shot count by formula (planning.ts:13); cameraPlan never written |
| DOS-10.2 | 10. Shot Architect | Each shot has — duration; camera; lens; movement; composition; subject; action; location; lighting; depth of field; focus; emotion … | not built | W4 — Shot count by formula (planning.ts:13); cameraPlan never written |
| DOS-11.1 | 11. Cinematography Engine | The Director has a separate cinematography intelligence layer. It | not built | W4 — Shot size = i%4 cycle (director.service.ts:189); GPU ignores camera |
| DOS-11.2 | 11. Cinematography Engine | Importantly, it should understand visual grammar. For example — establishing shot; → medium shot; → close-up; → reaction; → insert; → reverse shot; → wide release | not built | W4 — Shot size = i%4 cycle (director.service.ts:189); GPU ignores camera |
| DOS-12.1 | 12. The Prompt Compiler | Do not let GPT directly generate a final image prompt from scratch | shallow | W4 — String concatenation (director.service.ts:188, video.processor.ts:176) |
| DOS-12.2 | 12. The Prompt Compiler | (author's note) OpenAI's current image-generation guidance similarly | shallow | W4 — String concatenation (director.service.ts:188, video.processor.ts:176) |
| DOS-13.1 | 13. Model-specific prompt compilers | Do not have one universal prompt. Create adapters — PromptCompiler; │; ├── OpenAIImageCompiler; ├── FluxCompiler; ├── SDXLCompiler; ├── WanCompiler; ├── ComfyUICompiler; ├── TTSCompiler; ├── MusicCompiler; └── SFXCompiler | not built | W4 — Adapters pass prompt verbatim (wan/hunyuan/fal adapters) |
| DOS-13.2 | 13. Model-specific prompt compilers | The Director describes the desired result in a canonical | not built | W4 — Adapters pass prompt verbatim (wan/hunyuan/fal adapters) |
| DOS-14.1 | 14. Canonical media request | Internally, CineForge has something like — "shotId": "scene017_shot04"; "visualIntent": {; "subject": "Maya"; "action": "realizes betrayal"; "emotion": "controlled disbelief"; "camera": {; "shot": "medium_close_up"; "lens": "50mm"; "movemen | shallow | W4 — ShotRequest is the closest analogue (model-adapters/types.ts:25) |
| DOS-14.2 | 14. Canonical media request | The model-specific compiler then turns this into whatever the | shallow | W4 — ShotRequest is the closest analogue (model-adapters/types.ts:25) |
| DOS-15.1 | 15. Image generation | Your own image system becomes an execution backend | shallow | W6 — One gpt-image-1 seed per shot, n:1, no candidates |
| DOS-15.2 | 15. Image generation | Don't immediately accept the first image. Generate — candidate A; candidate B; candidate C | shallow | W6 — One gpt-image-1 seed per shot, n:1, no candidates |
| DOS-16.1 | 16. Image Director / Visual Reviewer | Use a multimodal model to evaluate generated images against — character identity; composition; camera; lighting; wardrobe; location; props; emotion; continuity; prompt adherence | not built | W5 — Shot.qcScore never set; QC_PASS/QC_FAIL unused |
| DOS-16.2 | 16. Image Director / Visual Reviewer | Score — Identity: 94; Composition: 91; Continuity: 98; Lighting: 87; Prompt adherence: 93 | not built | W5 — Shot.qcScore never set; QC_PASS/QC_FAIL unused |
| DOS-16.3 | 16. Image Director / Visual Reviewer | This creates a generate → evaluate → revise loop | not built | W5 — Shot.qcScore never set; QC_PASS/QC_FAIL unused |
| DOS-17.1 | 17. The same for video | Do not trust the generated video merely because it rendered | shallow | W5 — Timing gate + black/freeze validator only; avsync CLI-only |
| DOS-17.2 | 17. The same for video | Check — face consistency; hands; objects; camera movement; motion; lighting; background; character position; wardrobe; continuity | shallow | W5 — Timing gate + black/freeze validator only; avsync CLI-only |
| DOS-18.1 | 18. Audio architecture | Audio is planned at the shot level, not added at the end. For | shallow | W7 — Audio per scene; one music bed; SFX never generated |
| DOS-18.2 | 18. Audio architecture | Then your own audio engine generates the appropriate components | shallow | W7 — Audio per scene; one music bed; SFX never generated |
| DOS-19.1 | 19. Voice identity | Every character gets — voiceId | not built | W7 — Character.voiceProfile unused; all speech one 'onyx' voice |
| DOS-19.2 | 19. Voice identity | The system must maintain — pitch; age; accent; speech rate; emotional range; loudness | not built | W7 — Character.voiceProfile unused; all speech one 'onyx' voice |
| DOS-19.3 | 19. Voice identity | Dialogue generation then becomes — character → voice identity → audio generation | not built | W7 — Character.voiceProfile unused; all speech one 'onyx' voice |
| DOS-20.1 | 20. Audio continuity | The existing audio engineering work becomes part of the Movie | shallow | W7 — Ducking + loudnorm -16 hard-coded; ignores SyncPolicy; no per-speaker/declick/room tone |
| DOS-20.2 | 20. Audio continuity | The Movie Layer decides what should be heard. The Media Engine | built | Movie layer holds no mastering logic |
| DOS-21.1 | 21. Editor Agent | After scenes are generated, create Editorial Intelligence. It | not built | W5 — No editorial agent; RepairAction is the nearest typed op set |
| DOS-21.2 | 21. Editor Agent | It can then propose — CUT SHOT 34; EXTEND SHOT 42; MOVE SCENE 17; SHORTEN SCENE 22; ADD INSERT; REMOVE REPETITION | not built | W5 — No editorial agent; RepairAction is the nearest typed op set |
| DOS-21.3 | 21. Editor Agent | These become structured edit operations, not free-form | not built | W5 — No editorial agent; RepairAction is the nearest typed op set |
| DOS-22.1 | 22. The movie as a compilable object | The user creates — Movie Source | shallow | W2 — Pipeline real; timeline IR CLI-only (worker/src/timeline/cli.ts) |
| DOS-23.1 | 23. CineForge Film IR | Create — src/movie-ir/ | not built | W2 — No Film IR; FilmDraft is thin (llm.ts:19-39) |
| DOS-23.2 | 23. CineForge Film IR | The LLM never directly controls the final renderer. It produces Film | shallow | W2 — LLM output turned into rows by code, but unvalidated |
| DOS-24.1 | 24. Validator | Every AI output goes through — AI; ↓; Schema validation; ↓; Canon validation; ↓; Continuity validation; ↓; Production validation; ↓; Budget validation; ↓ … | shallow | W2 — Tool input_schema + lenient coerceDraft defaults (llm.ts:203-235) |
| DOS-24.2 | 24. Validator | (author's note) OpenAI's Structured Outputs are particularly useful | shallow | W2 — Tool input_schema + lenient coerceDraft defaults (llm.ts:203-235) |
| DOS-25.1 | 25. Never let GPT return "just text" | For production operations, require structured output. For example — generate_scene() | shallow | W2 — Built for the Director plan only |
| DOS-25.2 | 25. Never let GPT return "just text" | That difference will dramatically improve reliability | shallow | W2 — Director forced tool; JSON-scrape + stub fallback; translate/social free text |
| DOS-26.1 | 26. Multi-agent directorial system | Specialised AI roles — MASTER DIRECTOR; │; ┌──────────────┼──────────────┐; │              │              │; STORY AGENT    CINEMA AGENT    AUDIO AGENT; │              │              │; SCRIPT AGENT    SHOT AGENT     MUSIC AGENT; │          | not built | W2 — One monolithic prompt (llm.ts:41) |
| DOS-26.2 | 26. Multi-agent directorial system | (author's note) Current OpenAI APIs even provide a multi-agent | not built | W2 — One monolithic prompt (llm.ts:41) |
| DOS-27.1 | 27. But don't create 20 agents just because you can | Too many agents create — conflicting decisions; context explosion; higher cost; unpredictability | not built | W2 — One monolithic prompt (llm.ts:41) |
| DOS-27.2 | 27. But don't create 20 agents just because you can | Start with — 1. Director | not built | W2 — One monolithic prompt (llm.ts:41) |
| DOS-28.1 | 28. The Director should control them | The user shouldn't have to manage agents. The user says | shallow | W2 — brief→plan→shots→media→render only |
| DOS-29.1 | 29. The user can interrupt at any level | The user could say — > "Change Maya's jacket to red." | not built | W8 — Only re-plan (deletes scenes) or per-scene storyboard regenerate |
| DOS-29.2 | 29. The user can interrupt at any level | CineForge shouldn't regenerate the entire film. Instead — Film Bible; ↓; Character Bible; ↓; Maya wardrobe state; ↓; affected shots identified; ↓; only affected assets regenerated | not built | W8 — Only re-plan (deletes scenes) or per-scene storyboard regenerate |
| DOS-30.1 | 30. Dependency graph | Every asset knows what depends on it. Example — Maya; │; ├── Scene 03; │    ├── Shot 12; │    └── Shot 13; │; ├── Scene 07; │    ├── Shot 31; │    └── Shot 32; │; └── Scene 11; └── Shot 58 | shallow | W8 — dependsOn [i-1]; cacheKey only reuse primitive; affects UI-only |
| DOS-30.2 | 30. Dependency graph | Change Maya's appearance — Maya changed; ↓; dependency graph; ↓; affected shots; ↓; regenerate only affected shots | shallow | W8 — dependsOn [i-1]; cacheKey only reuse primitive; affects UI-only |
| DOS-31.1 | 31. Version everything | Use — Film v1; Film v2; Film v3 | shallow | W8 — Timelines/media_versions immutable but processors overwrite shots/films in place |
| DOS-31.2 | 31. Version everything | Never destroy the previous version — --- | poorly built | W8 — Processors overwrite shots/films; re-plan hard-deletes scenes |
| DOS-32.1 | 32. Continuity Engine | One of CineForge's signature technologies. It checks | shallow | W3 — Presence heuristic + one regex contradiction (continuity.ts:153-190) |
| DOS-32.2 | 32. Continuity Engine | Character — face; hair; age; clothes; injuries; position; emotional state | shallow | W3 — Presence heuristic + one regex contradiction (continuity.ts:153-190) |
| DOS-32.3 | 32. Continuity Engine | Environment — weather; time; lighting; architecture; objects | shallow | W3 — Presence heuristic + one regex contradiction (continuity.ts:153-190) |
| DOS-32.4 | 32. Continuity Engine | Story — knowledge; relationships; plot state; dead/alive state; location; timeline | shallow | W3 — Presence heuristic + one regex contradiction (continuity.ts:153-190) |
| DOS-32.5 | 32. Continuity Engine | Cinematography — screen direction; eyeline; camera axis; shot progression | shallow | W3 — Presence heuristic + one regex contradiction (continuity.ts:153-190) |
| DOS-32.6 | 32. Continuity Engine | Audio — voice; room; ambience; music; sound continuity | shallow | W3 — Presence heuristic + one regex contradiction (continuity.ts:153-190) |
| DOS-33.1 | 33. Temporal continuity | The system understands — Scene 10 happens at 14:00.; Scene 11 happens 3 minutes later.; Scene 12 happens next morning. | not built | W3 — Only timeOfDay string |
| DOS-33.2 | 33. Temporal continuity | Therefore — weather; sun; clothing; injuries; objects; character knowledge | not built | W3 — Only timeOfDay string |
| DOS-34.1 | 34. Visual memory | Store references for every important entity — character reference; location reference; prop reference; costume reference; vehicle reference; architecture reference; style reference | shallow | W6 — referenceUrls exist; only character refs+LoRA reach generation |
| DOS-34.2 | 34. Visual memory | The image generator receives the appropriate references for each | shallow | W6 — referenceUrls exist; only character refs+LoRA reach generation |
| DOS-35.1 | 35. Reference pack | For every scene, CineForge automatically assembles — SCENE REFERENCE PACK; --------------------; Character references; Location references; Prop references; Costume references; Previous shot; Previous scene; Style reference; Camera referenc | not built | W6 — Refs capped at 4 character frames; no shot-to-shot conditioning; shots parallel |
| DOS-35.2 | 35. Reference pack | The generation engine then receives only the relevant context. This | not built | W6 — Refs capped at 4 character frames; no shot-to-shot conditioning; shots parallel |
| DOS-36.1 | 36. Shot-to-shot visual memory | A generated shot becomes an input reference for the next shot when | not built | W6 — Refs capped at 4 character frames; no shot-to-shot conditioning; shots parallel |
| DOS-36.2 | 36. Shot-to-shot visual memory | The next generation knows — where the character ended; where the camera ended; where objects were; what lighting looked like | not built | W6 — Refs capped at 4 character frames; no shot-to-shot conditioning; shots parallel |
| DOS-37.1 | 37. Scene lock | Once a scene is approved — SCENE LOCKED | not built | W8 — No APPROVED/LOCKED scene status |
| DOS-37.2 | 37. Scene lock | The system preserves — character identity; location; wardrobe; lighting; visual style; approved references | not built | W8 — No APPROVED/LOCKED scene status |
| DOS-38.1 | 38. Film lock | At the end — FILM LOCK | shallow | W8 — timeline status 'frozen' exists, no lock workflow |
| DOS-38.2 | 38. Film lock | Then the system produces the final master | shallow | W8 — timeline status 'frozen' exists, no lock workflow |
| DOS-39.1 | 39. Quality gates | Before a scene becomes final — STORY PASS; ↓; VISUAL PASS; ↓; CONTINUITY PASS; ↓; AUDIO PASS; ↓; TECHNICAL PASS; ↓; EDITORIAL PASS | not built | W5 — 'QC gate omitted' (video.processor.ts:323); scenes READY unconditionally |
| DOS-39.2 | 39. Quality gates | If one fails — REVISE | not built | W5 — 'QC gate omitted' (video.processor.ts:323); scenes READY unconditionally |
| DOS-40.1 | 40. Technical QC | The existing CineForge media engine checks — resolution; fps; codec; frame rate; duration; audio sample rate; channels; loudness; black frames; dropped frames; corrupt frames; audio/video sync | shallow | W5 — Strong primitives (narration fit, sync engine, analysis.ts) not in render path |
| DOS-40.2 | 40. Technical QC | The previous film-mux issue is exactly the kind of thing this layer | built | planNarrationFit / NarrationOverrunError refuse truncation |
| DOS-40.3 | 40. Technical QC | The timeline explicitly determines — picture duration; audio duration; padding; ducking; extension; fade | shallow | W5 — Strong primitives (narration fit, sync engine, analysis.ts) not in render path |
| DOS-41.1 | 41. Movie cost optimization | Because CineForge is building its own GPU infrastructure, the Movie | shallow | W8 — Estimate + budget pause + cache; auto mode skips storyboard approval |
| DOS-41.2 | 41. Movie cost optimization | Don't spend expensive GPU time generating video for an unapproved | shallow | W8 — Estimate + budget pause + cache; auto mode skips storyboard approval |
| DOS-42.1 | 42. Two-pass production | PASS 1 — PREVIS. Cheap — script; storyboard; rough images; rough voice; rough timing | not built | W8 — Auto mode single-pass |
| DOS-42.2 | 42. Two-pass production | PASS 2 — FINAL. Expensive — high-quality images; video; voice; music; SFX; upscaling; master | not built | W8 — Auto mode single-pass |
| DOS-43.1 | 43. Three-pass would be even better | PASS 1 — STORY — screenplay; structure; characters; scenes | not built | W8 — Auto mode single-pass |
| DOS-43.2 | 43. Three-pass would be even better | PASS 2 — PREVIS — storyboard; rough voices; camera; timing | not built | W8 — Auto mode single-pass |
| DOS-43.3 | 43. Three-pass would be even better | PASS 3 — FINAL — image; video; audio; editing; mastering | not built | W8 — Auto mode single-pass |
| DOS-43.4 | 43. Three-pass would be even better | This should become the CineForge standard | not built | W8 — Auto mode single-pass |
| DOS-44.1 | 44. The user interface | The Movie layer is not just another chat window. Use — ┌─────────────────────────────────────────────┐; │                 CINEFORGE                   │; ├───────────┬─────────────────────┬───────────┤; │ FILM      │                     │ DI | shallow | W9 — StoryboardStudio + RunPanel; no bible panel / decisions / timeline UI |
| DOS-45.1 | 45. Director chat | The user can say — > "Make Scene 7 darker and more psychologically disturbing." | not built | W9 — No director chat, NL edit, or rationale |
| DOS-45.2 | 45. Director chat | The Director interprets this as — change scene tone; ↓; cinematography revision; ↓; lighting revision; ↓; music revision; ↓; possibly dialogue revision; ↓; affected shots identified | not built | W9 — No director chat, NL edit, or rationale |
| DOS-46.1 | 46. Natural-language editing | The user should be able to say — > "Make the opening 15 seconds faster." | not built | W9 — No director chat, NL edit, or rationale |
| DOS-46.2 | 46. Natural-language editing | CineForge determines — timeline dependencies | not built | W9 — No director chat, NL edit, or rationale |
| DOS-46.3 | 46. Natural-language editing | The user doesn't need to understand the timeline representation | not built | W9 — No director chat, NL edit, or rationale |
| DOS-47.1 | 47. "Why" explanation | Every major AI decision has an internal explanation record. For | not built | W9 — No director chat, NL edit, or rationale |
| DOS-47.2 | 47. "Why" explanation | This makes CineForge much easier to debug | not built | W9 — No director chat, NL edit, or rationale |
| DOS-48.1 | 48. AI decision log | Store — agent; model; prompt version; input context; output schema; decision; timestamp; cost | shallow | W2 — video/audio generation ledgers exist; no LLM decision log |
| DOS-48.2 | 48. AI decision log | This creates an audit trail — --- | shallow | W2 — video/audio generation ledgers exist; no LLM decision log |
| DOS-49.1 | 49. Prompt versioning | Do not hard-code giant prompts throughout the application. Create — prompts/; director/; screenplay/; scene/; cinematography/; image/; video/; audio/; continuity/; editor/ | not built | W2 — Prompts hard-coded in llm.ts / director.service.ts |
| DOS-49.2 | 49. Prompt versioning | Each prompt has — version; purpose; model; schema; evaluation score | not built | W2 — Prompts hard-coded in llm.ts / director.service.ts |
| DOS-49.3 | 49. Prompt versioning | Then CineForge can be improved without rewriting the engine | not built | W2 — Prompts hard-coded in llm.ts / director.service.ts |
| DOS-50.1 | 50. Evaluation system | Build an internal benchmark. For example — 100 test scenes; 50 characters; 30 locations; 20 continuity tests; 20 dialogue tests; 20 cinematography tests | not built | W10 — Unit tests only; sync tolerances uncalibrated |
| DOS-50.2 | 50. Evaluation system | Every new prompt/model change runs the benchmark. Measure — character consistency; story consistency; prompt adherence; continuity; visual quality; audio quality; cost; latency | not built | W10 — Unit tests only; sync tolerances uncalibrated |
| DOS-50.3 | 50. Evaluation system | Do not rely on "It looks better to me." Use measurable evaluation | not built | W10 — Unit tests only; sync tolerances uncalibrated |
| DOS-50.4 | 50. Evaluation system | (author's note) OpenAI's Structured Outputs guidance also explicitly | not built | W10 — Unit tests only; sync tolerances uncalibrated |
| DOS-51.1 | 51. Model router | Don't permanently tie CineForge to OpenAI. Create an AI Provider | shallow | W2 — Media registry exists; LLM calls hard-wired to Anthropic |
| DOS-51.2 | 51. Model router | Then — Director → best reasoning model; Image → best image model; Video → best video model; Voice → best voice model; Music → best music model | shallow | W2 — Media registry exists; LLM calls hard-wired to Anthropic |
| DOS-52.1 | 52. ChatGPT should not be the only intelligence | Important for long-term strategy. Use OpenAI as one of the strongest | poorly built | W2 — Anthropic SDK called directly in 3 files |
| DOS-52.2 | 52. ChatGPT should not be the only intelligence | Then providers can change as models improve | poorly built | W2 — Anthropic SDK called directly in 3 files |
| DOS-53.1 | 53. The "DirectorOS" | Give this subsystem its own name: CineForge DirectorOS. It is the | not built | W2 — No DirectorOS package; director lives inside worker |
| DOS-54.1 | 54. The really advanced part | To be ahead of today's video generators, don't think of CineForge as | not built | W2 — No DirectorOS package; director lives inside worker |
| DOS-54.2 | 54. The really advanced part | The system remembers — WHO; WHERE; WHEN; WHY; WHAT HAPPENED; WHAT CHANGED; WHAT THE CAMERA SAW; WHAT THE AUDIENCE KNOWS; WHAT THE CHARACTER KNOWS; WHAT OBJECTS EXIST; WHAT SOUNDS EXIST; WHAT MUST REMAIN CONSISTENT | not built | W2 — No DirectorOS package; director lives inside worker |
| DOS-55.1 | 55. World State Engine | At every point in the film a WORLD STATE exists. Example — "storyTime": "2038-10-17T23:14"; "locations": {; "warehouse": {; "weather": "rain"; "power": "partial"; "doors": {; "east": "open"; "characters": {; "maya": {; "location": "warehous | shallow | W3 — ProjectState folded string maps; no typed world state |
| DOS-55.2 | 55. World State Engine | Every shot is generated against this world state. Far more robust | shallow | W3 — ProjectState folded string maps; no typed world state |
| DOS-56.1 | 56. Story knowledge vs character knowledge | The Director knows the whole story. Maya does not. So — Director Knowledge:; Daniel is secretly alive.; Maya Knowledge:; Daniel is dead. | not built | W3 — No knowledge tracking or foreshadowing graph |
| DOS-56.2 | 56. Story knowledge vs character knowledge | The system must not accidentally make Maya say "I know Daniel is | not built | W3 — No knowledge tracking or foreshadowing graph |
| DOS-56.3 | 56. Story knowledge vs character knowledge | This gives proper dramatic storytelling — --- | not built | W3 — No knowledge tracking or foreshadowing graph |
| DOS-57.1 | 57. Audience knowledge | One step further: track WHAT THE AUDIENCE KNOWS | not built | W3 — No knowledge tracking or foreshadowing graph |
| DOS-57.2 | 57. Audience knowledge | This allows CineForge to deliberately create — dramatic irony; mystery; revelation; foreshadowing; misdirection; surprise | not built | W3 — No knowledge tracking or foreshadowing graph |
| DOS-57.3 | 57. Audience knowledge | Something ordinary image-to-video pipelines don't really model | not built | W3 — No knowledge tracking or foreshadowing graph |
| DOS-58.1 | 58. Foreshadowing graph | The story engine maintains — Plant → Development → Payoff | not built | W3 — No knowledge tracking or foreshadowing graph |
| DOS-58.2 | 58. Foreshadowing graph | The system can automatically check: did the film actually establish | not built | W3 — No knowledge tracking or foreshadowing graph |
| DOS-59.1 | 59. The Movie Compiler | Ultimately — USER IDEA; ↓; DIRECTOROS; ↓; FILM BIBLE; ↓; WORLD MODEL; ↓; STORY GRAPH; ↓; SCENE GRAPH; ↓ … | shallow | W2 — Lower half (queue, GPU, media engine) exists; upper graphs missing |
| DOS-59.2 | 59. The Movie Compiler | The existing elastic GPU architecture sits underneath — DIRECTOROS; │; ▼; PRODUCTION JOBS; │; ▼; CINEFORGE QUEUE; │; ▼; GPU SCHEDULER; │; ┌──────────────┼──────────────┐ … | shallow | W2 — Lower half (queue, GPU, media engine) exists; upper graphs missing |

## Part 2 — Engineering & Verification Contract, Intelligence Layer, own image layer

| ID | Section | Requirement (pointer; the full text is in the part file) | Cineforge status | Where / notes |
|---|---|---|---|---|
| DOS-60.1 | 60. The critical issue to correct before giving Claude the architecture | The Part 1 architecture is conceptually strong but not yet strict enough to guarantee a high-quality | n/a | W1 — Process rule → becomes level column + CI check |
| DOS-60.2 | 60. The critical issue to correct before giving Claude the architecture | The real problem: three different levels to distinguish — | n/a | W1 — Process rule → becomes level column + CI check |
| DOS-60.3 | 60. The critical issue to correct before giving Claude the architecture | The previous architecture was mostly Level 1, with some Level 2. It must be taken to Level 3. | n/a | W1 — Process rule → becomes level column + CI check |
| DOS-61.1 | 61. The CineForge DirectorOS Implementation Contract | Create a CineForge DirectorOS Implementation Contract, not merely an architecture document. | shallow | W1 — contracts/README.md (12-field template) + contracts/truth-layer.md; contracts for W2–W8 pending |
| DOS-61.2 | 61. The CineForge DirectorOS Implementation Contract | Every job description must have: | shallow | W1 — contracts/README.md (12-field template) + contracts/truth-layer.md; contracts for W2–W8 pending |
| DOS-62.1 | 62. Example — Character Continuity Engine | The weak specification would be: — | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.2 | 62. Example — Character Continuity Engine | The specification should instead say: — | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.3 | 62. Example — Character Continuity Engine | Responsibility — The engine must maintain canonical character state across the entire Film IR and prevent downstream | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.4 | 62. Example — Character Continuity Engine | Required inputs — | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.5 | 62. Example — Character Continuity Engine | Required checks — The engine MUST compare: | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.6 | 62. Example — Character Continuity Engine | Required output — | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.7 | 62. Example — Character Continuity Engine | Forbidden — The engine must never return: | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.8 | 62. Example — Character Continuity Engine | Acceptance test — Given: | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.9 | 62. Example — Character Continuity Engine | Integration test — Change Maya's canonical wardrobe. Then verify: | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-62.10 | 62. Example — Character Continuity Engine | If that doesn't happen, the feature is NOT IMPLEMENTED. That is the level of specification Claude ne | poorly built | W3 — String state; no ContinuityResult/severity/corrected context |
| DOS-63.1 | 63. This applies to EVERY major subsystem | DirectorOS should not merely contain: | shallow | W1 — contract template in place; one contract written (truth layer) |
| DOS-64.1 | 64. The Director — contract | Not "The Director creates the movie." Instead: | shallow | W2 — One forced-tool call; Director also builds prompts |
| DOS-65.1 | 65. Story Engine — proof | It needs to prove: | not built | W3 — acts hard-coded; no plot threads/arcs/setup-payoff |
| DOS-66.1 | 66. Scene Architect — proof | Must prove: | shallow | W3 — Scene has no purpose/beats; duration = requested not measured |
| DOS-66.2 | 66. Scene Architect — proof | And: | shallow | W3 — Scene has no purpose/beats; duration = requested not measured |
| DOS-67.1 | 67. Shot Architect — proof | Must prove: | poorly built | W4 — Formula shots (AVG_SHOT_SEC=5); clock not tied to planning |
| DOS-67.2 | 67. Shot Architect — proof | Then: | poorly built | W4 — Formula shots (AVG_SHOT_SEC=5); clock not tied to planning |
| DOS-67.3 | 67. Shot Architect — proof | This connects directly to the Master Production Clock work already identified in the existing media- | poorly built | W4 — Formula shots (AVG_SHOT_SEC=5); clock not tied to planning |
| DOS-68.1 | 68. Prompt Compiler — strict protection | This one especially needs strict protection. Claude could easily implement: | poorly built | W4 — String concatenation — the named anti-pattern |
| DOS-68.2 | 68. Prompt Compiler — strict protection | Instead: | poorly built | W4 — String concatenation — the named anti-pattern |
| DOS-68.3 | 68. Prompt Compiler — strict protection | And it needs tests. For example: if Maya is wearing a red coat in the canonical state, the compiled | poorly built | W4 — String concatenation — the named anti-pattern |
| DOS-68.4 | 68. Prompt Compiler — strict protection | Not necessarily literally the words "red coat", because the actual model adapter may use reference i | poorly built | W4 — String concatenation — the named anti-pattern |
| DOS-69.1 | 69. The Image Engine — contract | This is where "wired but not functional" becomes particularly dangerous. The job description cannot | shallow | W6 — gpt-image-1, no checksum/seed/revision; data: URL fallback |
| DOS-69.2 | 69. The Image Engine — contract | Then test: | shallow | W6 — gpt-image-1, no checksum/seed/revision; data: URL fallback |
| DOS-69.3 | 69. The Image Engine — contract | If Claude mocks the generation response: | shallow | W6 — gpt-image-1, no checksum/seed/revision; data: URL fallback |
| DOS-70.1 | 70. The critical principle — never self-certify | Never allow a component to prove itself by returning its own claimed status. | shallow | W1 — storage check + GPU execution report judged before READY (video.processor verifyArtifact/judgeRun); content QC is W5 |
| DOS-70.2 | 70. The critical principle — never self-certify | Bad: | shallow | W1 — storage check + GPU execution report judged before READY (video.processor verifyArtifact/judgeRun); content QC is W5 |
| DOS-70.3 | 70. The critical principle — never self-certify | Better: | shallow | W1 — storage check + GPU execution report judged before READY (video.processor verifyArtifact/judgeRun); content QC is W5 |
| DOS-71.1 | 71. The same applies to Audio | The existing audio requirements become machine-enforced acceptance criteria, not documentation. For | built | planNarrationFit + media-regression CI job |
| DOS-71.2 | 71. The same applies to Audio | The previous bug demonstrated why this matters: the film mux and dubbing pipeline must measure pictu | built | planNarrationFit + media-regression CI job |
| DOS-71.3 | 71. The same applies to Audio | That should be an automated regression test forever. | built | planNarrationFit + media-regression CI job |
| DOS-72.1 | 72. DirectorOS needs the same philosophy — zero hidden TODO functionality | The Movie Layer should have zero "TODO" functionality hidden behind interfaces. Claude should not be | built | W1 — scripts/check-truth.mjs in CI: no TODO/FIXME/XXX/HACK in production source; tested by check-truth.test.mjs |
| DOS-72.2 | 72. DirectorOS needs the same philosophy — zero hidden TODO functionality | Those should cause the build/verification process to fail. | built | W1 — scripts/check-truth.mjs in CI: no TODO/FIXME/XXX/HACK in production source; tested by check-truth.test.mjs |
| DOS-73.1 | 73. The REALITY GATE | Every CineForge subsystem has a status: | built | W1 — Reality Gate maturity in apps/web/lib/system.ts; CI refuses VALIDATED/PRODUCTION_READY without evidence files |
| DOS-73.2 | 73. The REALITY GATE | Claude must never call something "complete" merely because it is wired. For example: | built | W1 — Reality Gate maturity in apps/web/lib/system.ts; CI refuses VALIDATED/PRODUCTION_READY without evidence files |
| DOS-74.1 | 74. The "No Fake Completion" rule | At the top of Claude's implementation instructions: | built | W1 — rule in execution-protocol.md + contracts; stub film, placeholder media, phantom keys removed (docs/44 §1) |
| DOS-75.1 | 75. The "No Silent Degradation" rule | If a required capability is unavailable, the system must report NOT_IMPLEMENTED, UNAVAILABLE, or FAI | built | W1 — all 23 silent paths now fail or record a degradation (production_degradations, migration 0031); docs/44 |
| DOS-75.2 | 75. The "No Silent Degradation" rule | Especially important for: | built | W1 — all 23 silent paths now fail or record a degradation (production_degradations, migration 0031); docs/44 |
| DOS-76.1 | 76. REAL provider tests | If CineForge says: | not built | W10 — All provider tests mocked; gateway-e2e uses placeholder GPU |
| DOS-76.2 | 76. REAL provider tests | ComfyUI should remain the generation engine rather than Claude recreating it. That should remain a h | not built | W10 — All provider tests mocked; gateway-e2e uses placeholder GPU |
| DOS-76.3 | 76. REAL provider tests | Likewise Wan must actually generate. Not: | not built | W10 — All provider tests mocked; gateway-e2e uses placeholder GPU |
| DOS-77.1 | 77. The Capability Registry | Every subsystem must declare what is actually operational. For example: | built | W1 — buildCapabilityRegistry (packages/shared/src/truth) published to system_capabilities; GPU /capabilities truthful |
| DOS-77.2 | 77. The Capability Registry | That is much safer than pretending everything exposed in the UI is functional. The existing architec | built | W1 — buildCapabilityRegistry (packages/shared/src/truth) published to system_capabilities; GPU /capabilities truthful |
| DOS-78.1 | 78. The UI obeys the Capability Registry | If: | built | W1 — create UI offers only registry-real formats; admin lists live capabilities (apps/web/lib/truth.ts) |
| DOS-79.1 | 79. How to make Claude work differently | Don't tell Claude "Build DirectorOS." Tell it: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.1 | 80. Claude works in phases | Not "Build everything." That is where quality collapses. Instead: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.2 | 80. Claude works in phases | PHASE 0 — AUDIT — Claude examines the existing repository. No implementation. Produces: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.3 | 80. Claude works in phases | PHASE 1 — CONTRACT — Define: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.4 | 80. Claude works in phases | PHASE 2 — CANON — Implement: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.5 | 80. Claude works in phases | PHASE 3 — STORY — Implement: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.6 | 80. Claude works in phases | PHASE 4 — MEDIA — Wire: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.7 | 80. Claude works in phases | PHASE 5 — QC — Implement: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.8 | 80. Claude works in phases | PHASE 6 — COMPILER — | n/a | W1 — Process → execution-protocol.md |
| DOS-80.9 | 80. Claude works in phases | PHASE 7 — ELASTIC GPU — Then connect the architecture designed earlier: | n/a | W1 — Process → execution-protocol.md |
| DOS-80.10 | 80. Claude works in phases | PHASE 8 — END-TO-END — One complete movie. Not 100 mocked scenes. One actual short film from prompt → final MP4. That becom | n/a | W1 — Process → execution-protocol.md |
| DOS-81.1 | 81. The ultimate acceptance test | Claude receives: | not built | W10 — No end-to-end acceptance test |
| DOS-81.2 | 81. The ultimate acceptance test | Then automatically verify: | not built | W10 — No end-to-end acceptance test |
| DOS-81.3 | 81. The ultimate acceptance test | Only then can Claude report: | not built | W10 — No end-to-end acceptance test |
| DOS-82.1 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | The previous architecture + job descriptions are not yet the final implementation specification. The | n/a | W1 — Process → execution-protocol.md |
| DOS-82.2 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | A second document sits underneath the architecture: CineForge DirectorOS — Engineering & Verificatio | n/a | W1 — Process → execution-protocol.md |
| DOS-82.3 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | Add a Claude Execution Protocol that explicitly prevents: | n/a | W1 — Process → execution-protocol.md |
| DOS-82.4 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | We shouldn't merely tell Claude what CineForge should be. Write the specification so that Claude has | n/a | W1 — Process → execution-protocol.md |
| DOS-82.5 | 82. The missing layer — Engineering & Verification Contract + Claude Execution Protocol | Apply exactly the same discipline to the existing docs/38-media-engine-architecture.md and its v2.4/ | n/a | W1 — Process → execution-protocol.md |
| DOS-83.1 | 83. The author's question | Verbatim: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-83.2 | 83. The author's question | Answer: yes, and this is a better architecture than DirectorOS making many separate ChatGPT/Claude c | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-83.3 | 83. The author's question | Important distinction — We can minimise reasoning-model calls dramatically, but one ChatGPT call cannot literally generate 4 | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-83.4 | 83. The author's question | (author's note) — OpenAI's current Responses API is well suited to this because a single response can produce structur | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-84.1 | 84. Conventional vs recommended call pattern | Instead of — this (expensive, slow, potentially inconsistent): | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-84.2 | 84. Conventional vs recommended call pattern | Recommended: — | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-85.1 | 85. The key innovation — CineForge AI Production Compiler | A component called CineForge AI Production Compiler, distinct from the Director: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-85.2 | 85. The key innovation — CineForge AI Production Compiler | Example — The user says: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-85.3 | 85. The key innovation — CineForge AI Production Compiler | The model returns a structured Film Production Package: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-85.4 | 85. The key innovation — CineForge AI Production Compiler | This is extremely important: the LLM isn't producing "a screenplay". It is producing an executable p | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-86.1 | 86. Then CineForge takes over | Suppose GPT produces: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-86.2 | 86. Then CineForge takes over | This dramatically reduces API calls — The conventional approach: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-87.1 | 87. Film IR as the contract between AI and CineForge | The master call should not simply return huge raw JSON. It produces Film IR (Film Intermediate Repre | not built | W2 — No IR types; no zod; coerced output |
| DOS-87.2 | 87. Film IR as the contract between AI and CineForge | Compiler analogy (to help Claude understand) — A programmer writes: | not built | W2 — No IR types; no zod; coerced output |
| DOS-87.3 | 87. Film IR as the contract between AI and CineForge |  | not built | W2 — No IR types; no zod; coerced output |
| DOS-87.4 | 87. Film IR as the contract between AI and CineForge | This also solves the "Claude is average" problem — Claude doesn't get to decide "I'll implement whatever seems reasonable." Claude has to implement the | not built | W2 — No IR types; no zod; coerced output |
| DOS-88.1 | 88. Provider-neutral Intelligence Layer and model router | Do not call it ChatGPT Layer. Call it CineForge Intelligence Layer: | not built | W2 — No provider-neutral intelligence layer |
| DOS-88.2 | 88. Provider-neutral Intelligence Layer and model router | Model Router — (AI Router): | not built | W2 — No provider-neutral intelligence layer |
| DOS-88.3 | 88. Provider-neutral Intelligence Layer and model router | Do not pay GPT to do work CineForge's own infrastructure can already do. | not built | W2 — No provider-neutral intelligence layer |
| DOS-89.1 | 89. Don't ask GPT to create actual images if the own engine is better | The LLM decides: | built | LLM never touches GPU/FFmpeg; keep |
| DOS-90.1 | 90. The LLM is the "brain"; the infrastructure is the "hands" |  | built | LLM never touches GPU/FFmpeg; keep |
| DOS-91.1 | 91. Changes don't regenerate everything (and don't re-call the AI) | The user says "Make the station much darker." CineForge checks the dependency graph: | shallow | W8 — cacheKey excludes continuity state → stale reuse risk |
| DOS-91.2 | 91. Changes don't regenerate everything (and don't re-call the AI) | The user says "Make Maya's hair shorter." CineForge: | shallow | W8 — cacheKey excludes continuity state → stale reuse risk |
| DOS-92.1 | 92. Film State — the database is the source of truth | The AI layer maintains FILM STATE, containing: | shallow | W3 — Canon tables exist, unversioned, mostly unused |
| DOS-92.2 | 92. Film State — the database is the source of truth | The next AI request receives only the relevant state, not the entire history. That saves tokens and | shallow | W3 — Canon tables exist, unversioned, mostly unused |
| DOS-92.3 | 92. Film State — the database is the source of truth | No permanent giant ChatGPT conversation. Instead: | shallow | W3 — Canon tables exist, unversioned, mostly unused |
| DOS-93.1 | 93. One Master Call + Surgical Calls | Initial creation: — 1 MASTER LLM CALL generates: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-93.2 | 93. One Master Call + Surgical Calls | Later, only if necessary: — a TARGETED LLM CALL. Examples: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-93.3 | 93. One Master Call + Surgical Calls | So instead of LLM call, LLM call, LLM call, … you get: | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-94.1 | 94. Tool definitions — proposed, validated, then executed | The master AI request can include tool definitions. For example the Director has access to: | not built | W2 — No proposed→validated→executed step |
| DOS-94.2 | 94. Tool definitions — proposed, validated, then executed | (author's note) — OpenAI's current Responses API supports function calling for connecting the model to application fun | not built | W2 — No proposed→validated→executed step |
| DOS-94.3 | 94. Tool definitions — proposed, validated, then executed | But do not let the model freely execute arbitrary functions. Instead: | not built | W2 — No proposed→validated→executed step |
| DOS-95.1 | 95. Images are a special case | (author's note) — With OpenAI's current Responses API, a model can use an image-generation tool as part of a response, | shallow | W6 — ImageModelAdapter has one implementation (OpenAI) |
| DOS-95.2 | 95. Images are a special case | But the image engine stays provider-neutral, because these must all be interchangeable: | shallow | W6 — ImageModelAdapter has one implementation (OpenAI) |
| DOS-95.3 | 95. Images are a special case | DirectorOS says: | shallow | W6 — ImageModelAdapter has one implementation (OpenAI) |
| DOS-96.1 | 96. The revised architecture | The previous architecture is modified to: | not built | W2 — Composite |
| DOS-97.1 | 97. The most important rule — call AI only when reasoning is required | The AI should not be called because a piece of the pipeline exists. It should be called because reas | built | LLM never touches GPU/FFmpeg; keep |
| DOS-97.2 | 97. The most important rule — call AI only when reasoning is required | No AI call needed — (deterministic): | built | LLM never touches GPU/FFmpeg; keep |
| DOS-97.3 | 97. The most important rule — call AI only when reasoning is required | AI call needed: — | built | LLM never touches GPU/FFmpeg; keep |
| DOS-98.1 | 98. Batch reasoning | Suppose there are 30 shots. Don't do 30 GPT calls. Give the model the entire scene/sequence and requ | shallow | W2 — Planning batched; translation per scene×language |
| DOS-98.2 | 98. Batch reasoning | (author's note) — Structured Outputs are designed specifically to make this kind of machine-consumable response reliab | shallow | W2 — Planning batched; translation per scene×language |
| DOS-99.1 | 99. Name — CineForge One-Pass Intelligence / Multi-Pass Execution | Not literally one API call for the entire movie in every situation, because very large films eventua | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-100.1 | 100. Specification text to add for Claude (verbatim) |  | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-100.2 | 100. Specification text to add for Claude (verbatim) |  | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-100.3 | 100. Specification text to add for Claude (verbatim) |  | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-100.4 | 100. Specification text to add for Claude (verbatim) |  | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-100.5 | 100. Specification text to add for Claude (verbatim) |  | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-100.6 | 100. Specification text to add for Claude (verbatim) |  | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-100.7 | 100. Specification text to add for Claude (verbatim) |  | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-100.8 | 100. Specification text to add for Claude (verbatim) | In one sentence: — | shallow | W2 — One planning call exists but returns thin draft, not a Production Package |
| DOS-101.1 | 101. The author's question and the answer | Verbatim: | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-101.2 | 101. The author's question and the answer | No. OpenAI Image Generation is not needed when CineForge builds its own image-generation layer. Open | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-101.3 | 101. The author's question and the answer | Recommended architecture: — | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-101.4 | 101. The author's question and the answer | OpenAI does not have to generate the image. It can determine "This is what the image needs to be." T | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-102.1 | 102. Owning the image pipeline gives more control | DirectorOS could produce: | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-102.2 | 102. Owning the image pipeline gives more control | CineForge's Prompt Compiler converts that into the exact format the image engine needs: | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-103.1 | 103. ComfyUI is the execution/generation graph underneath CineForge | This is exactly where ComfyUI belongs. Don't have Claude rebuild ComfyUI. Use ComfyUI as the executi | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-103.2 | 103. ComfyUI is the execution/generation graph underneath CineForge | CineForge decides: | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-103.3 | 103. ComfyUI is the execution/generation graph underneath CineForge |  | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-103.4 | 103. ComfyUI is the execution/generation graph underneath CineForge | New models can be added later without changing DirectorOS. | not built | W6 — ComfyUI runtime not started (docs/38 Phase 6) |
| DOS-104.1 | 104. What OpenAI/Claude should actually do (and not do) | Spend the API money on: | built | LLM never touches GPU/FFmpeg; keep |
| DOS-104.2 | 104. What OpenAI/Claude should actually do (and not do) | But not: | built | LLM never touches GPU/FFmpeg; keep |
| DOS-105.1 | 105. Provider interface — no lock-in |  | shallow | W6 — ImageModelAdapter has one implementation (OpenAI) |
| DOS-105.2 | 105. Provider interface — no lock-in | DirectorOS doesn't care. It produces ImageGenerationRequest; the provider adapter handles the actual | shallow | W6 — ImageModelAdapter has one implementation (OpenAI) |
| DOS-106.1 | 106. OpenAI image generation is optional, not foundational | Capability registry example: | poorly built | W6 — OpenAI is the only image path, auto-on by key |
| DOS-106.2 | 106. OpenAI image generation is optional, not foundational | The system can then choose: | poorly built | W6 — OpenAI is the only image path, auto-on by key |
| DOS-106.3 | 106. OpenAI image generation is optional, not foundational | OpenAI can be activated later as one additional provider. | poorly built | W6 — OpenAI is the only image path, auto-on by key |
| DOS-107.1 | 107. The important distinction — intelligence vs media generation | Don't confuse AI intelligence with AI media generation. They are two different things. | n/a | Principle; keep |
| DOS-107.2 | 107. The important distinction — intelligence vs media generation | The goal: | n/a | Principle; keep |
| DOS-107.3 | 107. The important distinction — intelligence vs media generation | That gives a much stronger product architecture than making CineForge dependent on OpenAI's image ge | n/a | Principle; keep |

## Part 3 — Voice Clone Talker, Voice Engine and Voice Studio

| ID | Section | Requirement (pointer; the full text is in the part file) | Cineforge status | Where / notes |
|---|---|---|---|---|
| DOS-108.1 | 108. Two different things to distinguish | If "Voice Clone Talker" means the newer voice-clone "talker" architecture, that is very relevant to | n/a | W7 — Concept / model commentary |
| DOS-108.2 | 108. Two different things to distinguish | Voice cloning — This is: | n/a | W7 — Concept / model commentary |
| DOS-108.3 | 108. Two different things to distinguish | A Voice Clone Talker — A talker model is the actual neural generation component that takes the text plus a voice reference/ | n/a | W7 — Concept / model commentary |
| DOS-108.4 | 108. Two different things to distinguish | For example, the newer Qwen3-TTS ecosystem has a specific voice_clone talker model set, including co | n/a | W7 — Concept / model commentary |
| DOS-109.1 | 109. Building it into CineForge — the Voice Engine beside Image and Video | Yes, this can be built into the author's own system. Structure the CineForge architecture like this: | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-109.2 | 109. Building it into CineForge — the Voice Engine beside Image and Video | The Clone Talker becomes one of CineForge's own GPU workers. | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-110.1 | 110. Reusable voice profiles — enroll once | This is where it becomes powerful. A user uploads 30–60 seconds of their voice. The system creates: | shallow | W7 — Voice Lab stores MiniMax provider_voice_id; every call goes to fal |
| DOS-110.2 | 110. Reusable voice profiles — enroll once | The reusable voice profile is stored. | shallow | W7 — Voice Lab stores MiniMax provider_voice_id; every call goes to fal |
| DOS-110.3 | 110. Reusable voice profiles — enroll once | Every subsequent CineForge project can then say: | shallow | W7 — Voice Lab stores MiniMax provider_voice_id; every call goes to fal |
| DOS-110.4 | 110. Reusable voice profiles — enroll once | The GPU worker generates the speech. The user doesn't need to upload their voice again. | shallow | W7 — Voice Lab stores MiniMax provider_voice_id; every call goes to fal |
| DOS-111.1 | 111. Combining with the TALKER / video system | This is where it gets particularly interesting for BalanceVid: | shallow | W7 — Avatar via fal SadTalker/Kling; narrator always 'onyx'; dubbing = OpenAI TTS 4000-char cap; conversation mode not built |
| DOS-111.2 | 111. Combining with the TALKER / video system | So the pipeline becomes: | shallow | W7 — Avatar via fal SadTalker/Kling; narrator always 'onyx'; dubbing = OpenAI TTS 4000-char cap; conversation mode not built |
| DOS-111.3 | 111. Combining with the TALKER / video system | Projects such as Linly-Talker demonstrate this general architecture by combining LLM, ASR, TTS, voic | shallow | W7 — Avatar via fal SadTalker/Kling; narrator always 'onyx'; dubbing = OpenAI TTS 4000-char cap; conversation mode not built |
| DOS-112.1 | 112. What to use — not one model responsible for everything | Do not make one model responsible for everything. Instead, the Voice Engine: | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-112.2 | 112. What to use — not one model responsible for everything | Underneath that, experiment with models such as: | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-112.3 | 112. What to use — not one model responsible for everything | Qwen3-TTS implementations, for example, already expose a dedicated voice-cloning generation path usi | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-113.1 | 113. Recommendation — a Voice Engine that swaps models underneath | Don't build a "Qwen3-TTS clone." Build a CineForge Voice Engine that can swap models underneath: | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-113.2 | 113. Recommendation — a Voice Engine that swaps models underneath | Then the API, database, voice profiles, job system, billing, permissions, audio processing and UI re | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-113.3 | 113. Recommendation — a Voice Engine that swaps models underneath | That gives something much more valuable than simply having a voice-cloning model: your own voice-gen | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-114.1 | 114. Commercial licensing check before choosing the production model | Check commercial licensing carefully before selecting the production model: an open-source model bei | not built | W7 — No licence registry or voice benchmark harness |
| DOS-114.2 | 114. Commercial licensing check before choosing the production model | Linly-Talker itself explicitly warns that its referenced models have their own licensing requirement | not built | W7 — No licence registry or voice benchmark harness |
| DOS-115.1 | 115. Clone your own voice and read any script | That is absolutely possible. Provide a recording of your own voice once, create your voice profile, | shallow | W7 — Voice Lab stores MiniMax provider_voice_id; every call goes to fal |
| DOS-116.1 | 116. More than reading text — the script controls | Give the system a script, for example: | not built | W7 — No style/emotion/speed controls (speed:1 hard-coded) |
| DOS-116.2 | 116. More than reading text — the script controls | And select: | not built | W7 — No style/emotion/speed controls (speed:1 hard-coded) |
| DOS-116.3 | 116. More than reading text — the script controls | The Clone Talker generates the corresponding audio, which is fed directly into the existing CineForg | not built | W7 — No style/emotion/speed controls (speed:1 hard-coded) |
| DOS-117.1 | 117. Modes | Narrator — | shallow | W7 — Avatar via fal SadTalker/Kling; narrator always 'onyx'; dubbing = OpenAI TTS 4000-char cap; conversation mode not built |
| DOS-117.2 | 117. Modes | Presenter — | shallow | W7 — Avatar via fal SadTalker/Kling; narrator always 'onyx'; dubbing = OpenAI TTS 4000-char cap; conversation mode not built |
| DOS-117.3 | 117. Modes | Dubbing — | shallow | W7 — Avatar via fal SadTalker/Kling; narrator always 'onyx'; dubbing = OpenAI TTS 4000-char cap; conversation mode not built |
| DOS-117.4 | 117. Modes | Conversation — | shallow | W7 — Avatar via fal SadTalker/Kling; narrator always 'onyx'; dubbing = OpenAI TTS 4000-char cap; conversation mode not built |
| DOS-117.5 | 117. Modes | So you could effectively create a digital version of yourself that can read scripts, narrate films, | shallow | W7 — Avatar via fal SadTalker/Kling; narrator always 'onyx'; dubbing = OpenAI TTS 4000-char cap; conversation mode not built |
| DOS-118.1 | 118. Private voice identity, no external voice provider per request | Because the author is building their own infrastructure, the goal could be: | shallow | W7 — Voice Lab stores MiniMax provider_voice_id; every call goes to fal |
| DOS-119.1 | 119. CineForge Voice Studio | Call this CineForge Voice Studio rather than just "voice cloning." It could become a complete produc | shallow | W7 — VoiceLab.tsx is the starting point |
| DOS-120.1 | 120. Why people say it is hard | It is called hard because people often mean training a voice-cloning model from scratch. That is gen | n/a | W7 — Concept / model commentary |
| DOS-120.2 | 120. Why people say it is hard | Building a production system that uses an existing voice-cloning/talker architecture is much more ac | n/a | W7 — Concept / model commentary |
| DOS-121.1 | 121. The architecture — clone from a short reference, read arbitrary scripts | The architecture that clones a voice from a short reference recording and then reads arbitrary scrip | n/a | W7 — Concept / model commentary |
| DOS-122.1 | 122. The Talker is the difficult neural component | The Talker has to learn things such as: | n/a | W7 — Concept / model commentary |
| DOS-122.2 | 122. The Talker is the difficult neural component | That is why building the model itself from scratch is hard. But you don't necessarily need to train | n/a | W7 — Concept / model commentary |
| DOS-123.1 | 123. The newer, more sophisticated architecture | A modern system can look more like: | n/a | W7 — Concept / model commentary |
| DOS-123.2 | 123. The newer, more sophisticated architecture | This is fundamentally different from old systems where a separate TTS model had to be trained for ev | n/a | W7 — Concept / model commentary |
| DOS-123.3 | 123. The newer, more sophisticated architecture | The speaker embedding allows the system to preserve the identity of the reference speaker. | n/a | W7 — Concept / model commentary |
| DOS-124.1 | 124. Why it fits the project — the infrastructure already exists | CineForge already has the infrastructure needed for the difficult engineering part: | not built | W7 — GPU worker has video endpoints only |
| DOS-125.1 | 125. The voice-worker | The Voice Worker could therefore be: | not built | W7 — GPU worker has video endpoints only |
| DOS-126.1 | 126. The API | CineForge simply calls: | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-127.1 | 127. Where it becomes genuinely hard — three levels | Level 1 — Use an existing model. Difficulty: manageable — Install an existing voice-cloning model and build the API, GPU worker, storage, UI and job | n/a | W7 — Concept / model commentary |
| DOS-127.2 | 127. Where it becomes genuinely hard — three levels | Level 2 — Fine-tune/adapt the model. Difficulty: advanced — Collect your own voice dataset and adapt the model to improve: | n/a | W7 — Concept / model commentary |
| DOS-127.3 | 127. Where it becomes genuinely hard — three levels | Level 3 — Create your own Talker model. Difficulty: very high — Now this is actual ML research: | n/a | W7 — Concept / model commentary |
| DOS-127.4 | 127. Where it becomes genuinely hard — three levels | You don't need Level 3 to build your own commercial Voice Engine. | n/a | W7 — Concept / model commentary |
| DOS-128.1 | 128. The strategy for CineForge | Don't make the mistake of thinking: "I need to build a voice-cloning AI from zero." Instead: build t | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-128.2 | 128. The strategy for CineForge | The architecture becomes: | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-128.3 | 128. The strategy for CineForge | That means the architecture is yours even if the underlying Talker model changes. | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-129.1 | 129. Selecting the Talker | This matters particularly because the author has already been dealing with model licensing issues in | not built | W7 — No licence registry or voice benchmark harness |
| DOS-129.2 | 129. Selecting the Talker | Offered next step (not yet taken): map out the exact Voice Engine architecture for CineForge, includ | not built | W7 — No licence registry or voice benchmark harness |

## Part 4 — Voice Engine: models, licensing, architecture, implementation spec

| ID | Section | Requirement (pointer; the full text is in the part file) | Cineforge status | Where / notes |
|---|---|---|---|---|
| DOS-130.1 | 130. The shortlist — licensing differs substantially | There are quite a few, and the choice matters a lot for CineForge because licensing differs substant | n/a | W7 — Concept / model commentary |
| DOS-130.2 | 130. The shortlist — licensing differs substantially | \For a commercial CineForge service, don't treat the table as legal clearance; you need to verify th | n/a | W7 — Concept / model commentary |
| DOS-131.1 | 131. Qwen3-TTS — the one to investigate first | This is particularly interesting for the architecture. It has a voice-cloning mode rather than requi | n/a | W7 — Concept / model commentary |
| DOS-131.2 | 131. Qwen3-TTS — the one to investigate first | For the system: | n/a | W7 — Concept / model commentary |
| DOS-131.3 | 131. Qwen3-TTS — the one to investigate first | There are also different model sizes, so you can potentially have a smaller/cheaper worker and a hig | n/a | W7 — Concept / model commentary |
| DOS-132.1 | 132. CosyVoice 3 | Another one to take very seriously. The CosyVoice project currently recommends Fun-CosyVoice3-0.5B, | n/a | W7 — Concept / model commentary |
| DOS-132.2 | 132. CosyVoice 3 | For CineForge: | n/a | W7 — Concept / model commentary |
| DOS-132.3 | 132. CosyVoice 3 | The relatively small 0.5B model is particularly interesting because you don't necessarily need an en | n/a | W7 — Concept / model commentary |
| DOS-133.1 | 133. Fish Speech / Fish Audio S2 | Fish Speech is technically very impressive. The current S2 Pro is described as a 4B-parameter multil | n/a | W7 — Concept / model commentary |
| DOS-133.2 | 133. Fish Speech / Fish Audio S2 | Be cautious for the commercial architecture because of licensing. The current Fish Speech repository | n/a | W7 — Concept / model commentary |
| DOS-134.1 | 134. GPT-SoVITS | One of the better-known voice-cloning architectures. Its approach separates parts of the speech-gene | n/a | W7 — Concept / model commentary |
| DOS-134.2 | 134. GPT-SoVITS | It can work with relatively small amounts of reference/training data and has a large ecosystem. Curr | n/a | W7 — Concept / model commentary |
| DOS-135.1 | 135. F5-TTS | F5-TTS is technically excellent and uses a flow-matching approach. Its code is MIT licensed. GitHub | n/a | W7 — Concept / model commentary |
| DOS-135.2 | 135. F5-TTS | But the publicly released pretrained weights are currently CC-BY-NC, meaning non-commercial. GitHub | n/a | W7 — Concept / model commentary |
| DOS-136.1 | 136. What to actually do — pluggable models, benchmark with your own voice | Don't pick one model immediately. Build the architecture so that models are pluggable: | not built | W7 — No licence registry or voice benchmark harness |
| DOS-136.2 | 136. What to actually do — pluggable models, benchmark with your own voice | Then benchmark them using your actual voice. Test the same: | not built | W7 — No licence registry or voice benchmark harness |
| DOS-136.3 | 136. What to actually do — pluggable models, benchmark with your own voice | And measure: | not built | W7 — No licence registry or voice benchmark harness |
| DOS-137.1 | 137. Initial shortlist | If the goal is specifically: | n/a | W7 — Concept / model commentary |
| DOS-137.2 | 137. Initial shortlist | Do not make F5-TTS the commercial production choice using its standard public weights, because of th | n/a | W7 — Concept / model commentary |
| DOS-137.3 | 137. Initial shortlist | This is where the idea becomes much less "hard" than the author was originally told: we don't need t | n/a | W7 — Concept / model commentary |
| DOS-138.1 | 138. Free to run vs free for commercial use | Yes — many of the models are free to download and run, but "free" and "free for commercial use" are | n/a | W7 — Concept / model commentary |
| DOS-139.1 | 139. The licensing findings | The current licensing was checked rather than relying on older information. | not built | W7 — No licence registry or voice benchmark harness |
| DOS-139.2 | 139. The licensing findings | GPT-SoVITS's software repository is MIT licensed, which permits commercial use, modification, distri | not built | W7 — No licence registry or voice benchmark harness |
| DOS-139.3 | 139. The licensing findings | Fish Speech is different. Its current Research License explicitly says research/non-commercial use i | not built | W7 — No licence registry or voice benchmark harness |
| DOS-139.4 | 139. The licensing findings | Qwen3-TTS is particularly interesting because its Qwen TTS package is Apache-2.0 licensed. Hugging F | not built | W7 — No licence registry or voice benchmark harness |
| DOS-140.1 | 140. Start order and the abstraction | Start with: | n/a | W7 — Concept / model commentary |
| DOS-140.2 | 140. Start order and the abstraction | Then build your own abstraction: | n/a | W7 — Concept / model commentary |
| DOS-140.3 | 140. Start order and the abstraction | That means you don't pay per generated minute to ElevenLabs or another hosted voice provider. You pa | n/a | W7 — Concept / model commentary |
| DOS-140.4 | 140. Start order and the abstraction | And you can clone your own voice, save your speaker profile, and then generate unlimited scripts sub | n/a | W7 — Concept / model commentary |
| DOS-141.1 | 141. The caveat, and where to focus evaluation | Even when the model license permits commercial use, you still need to check the exact model checkpoi | not built | W7 — No licence registry or voice benchmark harness |
| DOS-141.2 | 141. The caveat, and where to focus evaluation | If the objective is "I want the best free/open model that I can legally put inside CineForge and use | not built | W7 — No licence registry or voice benchmark harness |
| DOS-142.1 | 142. The direction is set | For CineForge, make Qwen3-TTS the first model to benchmark, with CosyVoice 3 and GPT-SoVITS as fallb | n/a | W7 — Decision recorded |
| DOS-142.2 | 142. The direction is set | The next sensible step is to design the CineForge Voice Engine architecture around a model-independe | n/a | W7 — Decision recorded |
| DOS-142.3 | 142. The direction is set | Clear direction: CineForge Voice Engine, with Qwen3-TTS as the first implementation and a pluggable | n/a | W7 — Decision recorded |
| DOS-143.0 | D. Model-independent architecture (preamble) | Design it so CineForge never knows whether the speech was generated by Qwen3-TTS, CosyVoice, GPT-SoV | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-143.1 | 143. (D1) The recommended architecture |  | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-143.2 | 143. (D1) The recommended architecture | This is the key architectural decision: the adapters change. The API does not. | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-144.1 | 144. (D2) Five major subsystems |  | not built | W7 — No voice-engine module tree; place under apps/voice-* + packages/voice-contracts |
| DOS-145.1 | 145. (D3) The API is the permanent interface — register a voice |  | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-145.2 | 145. (D3) The API is the permanent interface — register a voice | The database knows that voice_8f31c belongs to the user's voice. | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-146.1 | 146. (D4) Generate speech | CineForge doesn't call Qwen directly. It calls: | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-146.2 | 146. (D4) Generate speech | The Voice Engine decides which model should handle it. | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-147.1 | 147. (D5) The model adapter — a common interface |  | not built | W7 — TtsAdapter is a one-method interface (openai.ts:27) |
| DOS-147.2 | 147. (D5) The model adapter — a common interface | Qwen3 might internally call its generate_voice_clone() functionality, while CineForge remains comple | not built | W7 — TtsAdapter is a one-method interface (openai.ts:27) |
| DOS-147.3 | 147. (D5) The model adapter — a common interface | CosyVoice has a considerably different internal architecture — its current implementation combines a | not built | W7 — TtsAdapter is a one-method interface (openai.ts:27) |
| DOS-148.1 | 148. (D6) The really important part: Voice Profiles | Don't store only the original WAV. Store a proper voice profile: | poorly built | W7 — voices.provider/provider_voice_id model-specific columns |
| DOS-148.2 | 148. (D6) The really important part: Voice Profiles | For example: | poorly built | W7 — voices.provider/provider_voice_id model-specific columns |
| DOS-148.3 | 148. (D6) The really important part: Voice Profiles | Qwen3-TTS supports an x-vector speaker representation and also an ICL-style reference path, which me | poorly built | W7 — voices.provider/provider_voice_id model-specific columns |
| DOS-149.1 | 149. (D7) Don't generate an entire movie's narration in one request | Instead: | shallow | W7 — 1800-char serial chunks; film path one call per scene; audio_generations never written |
| DOS-149.2 | 149. (D7) Don't generate an entire movie's narration in one request | Each chunk becomes: | shallow | W7 — 1800-char serial chunks; film path one call per scene; audio_generations never written |
| DOS-149.3 | 149. (D7) Don't generate an entire movie's narration in one request | That gives: | shallow | W7 — 1800-char serial chunks; film path one call per scene; audio_generations never written |
| DOS-150.1 | 150. (D8) The existing audio pipeline takes over | This connects directly with the audio work already done: | shallow | W7 — Mix-level only; no per-clip mastering, AAC not 48 kHz WAV |
| DOS-150.2 | 150. (D8) The existing audio pipeline takes over | The AI model does not own mastering. That remains the audio engine's responsibility. | shallow | W7 — Mix-level only; no per-clip mastering, AAC not 48 kHz WAV |
| DOS-151.1 | 151. (D9) Model routing | Initially: | not built | W7 — Model chosen by env vars |
| DOS-151.2 | 151. (D9) Model routing | Later: | not built | W7 — Model chosen by env vars |
| DOS-151.3 | 151. (D9) Model routing | Eventually the router could choose based on: | not built | W7 — Model chosen by env vars |
| DOS-151.4 | 151. (D9) Model routing | For example: | not built | W7 — Model chosen by env vars |
| DOS-152.1 | 152. (D10) GPU infrastructure — separate workers | Do not put the model directly into the main CineForge application container. Use separate workers: | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-152.2 | 152. (D10) GPU infrastructure — separate workers | A worker can start, load the model, process jobs, and remain warm. | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-153.1 | 153. (D11) Cloud and self-hosted | Cloud: | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-153.2 | 153. (D11) Cloud and self-hosted | Self-hosted: | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-153.3 | 153. (D11) Cloud and self-hosted | Same API. Same CineForge application. Different deployment. | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-154.1 | 154. (D12) Voice caching | If "Welcome to BalanceVid." is generated and later the exact same sentence is requested, don't gener | not built | W7 — Cache is video-only |
| DOS-154.2 | 154. (D12) Voice caching | This can save enormous GPU time. | not built | W7 — Cache is video-only |
| DOS-155.1 | 155. (D13) Batch generation | For a movie with 100 narration segments, don't send 100 independent HTTP requests from CineForge. Us | not built | W7 — Cache is video-only |
| DOS-155.2 | 155. (D13) Batch generation | The worker can optimize model loading and GPU utilization. | not built | W7 — Cache is video-only |
| DOS-156.1 | 156. (D14) The architecture to freeze for CineForge |  | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-156.2 | 156. (D14) The architecture to freeze for CineForge | The crucial design decision — Do not let CineForge depend on Qwen3-TTS. Let CineForge depend on: | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-156.3 | 156. (D14) The architecture to freeze for CineForge | This isn't theoretical: Qwen3-TTS already exposes the underlying voice-cloning primitives needed for | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-156.4 | 156. (D14) The architecture to freeze for CineForge | Freeze this architecture before Claude starts coding it. The next implementation step is to define t | not built | W7 — No Voice Engine; OpenAI tts-1 + fal MiniMax called directly |
| DOS-157.0 | E. Implementation specification (preamble) | This is the next layer to give to Claude. The objective is to build the Voice Engine as an independe | not built | W7 — No voice-engine module tree; place under apps/voice-* + packages/voice-contracts |
| DOS-157.1 | 157. (E1) Repository structure |  | not built | W7 — No voice-engine module tree; place under apps/voice-* + packages/voice-contracts |
| DOS-157.2 | 157. (E1) Repository structure | The most important boundary is packages/core/voice-engine.ts. That becomes the contract every model | not built | W7 — No voice-engine module tree; place under apps/voice-* + packages/voice-contracts |
| DOS-158.1 | 158. (E2) Model-independent interface |  | not built | W7 — TtsAdapter is a one-method interface (openai.ts:27) |
| DOS-158.2 | 158. (E2) Model-independent interface | Qwen3 implements it. CosyVoice implements it. GPT-SoVITS implements it. CineForge never calls their | not built | W7 — TtsAdapter is a one-method interface (openai.ts:27) |
| DOS-159.1 | 159. (E3) Voice enrollment | The user experience: | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-159.2 | 159. (E3) Voice enrollment | API: | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-159.3 | 159. (E3) Voice enrollment | The API should return immediately. The GPU work happens asynchronously. | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-160.1 | 160. (E4) Voice quality analysis | Before creating the voice profile, analyze the recording. Check: | not built | W7 — Primitives exist in ffmpeg/analysis.ts |
| DOS-160.2 | 160. (E4) Voice quality analysis | For example: | not built | W7 — Primitives exist in ffmpeg/analysis.ts |
| DOS-160.3 | 160. (E4) Voice quality analysis | If the recording is poor: | not built | W7 — Primitives exist in ffmpeg/analysis.ts |
| DOS-160.4 | 160. (E4) Voice quality analysis | This is important because garbage reference audio produces poor voice cloning. | not built | W7 — Primitives exist in ffmpeg/analysis.ts |
| DOS-161.1 | 161. (E5) Voice profile — and engine-specific artifacts | Database voice_profiles, recommended fields: | poorly built | W7 — voices.provider/provider_voice_id model-specific columns |
| DOS-161.2 | 161. (E5) Voice profile — and engine-specific artifacts | But don't assume every model has the same representation. Therefore voice_engine_artifacts holds eng | poorly built | W7 — voices.provider/provider_voice_id model-specific columns |
| DOS-161.3 | 161. (E5) Voice profile — and engine-specific artifacts | For Qwen: artifact_type = qwen_voice_clone_prompt. For another engine: artifact_type = speaker_embed | poorly built | W7 — voices.provider/provider_voice_id model-specific columns |
| DOS-162.1 | 162. (E6) Synthesis API | CineForge calls: | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-162.2 | 162. (E6) Synthesis API | Don't make the HTTP request wait for GPU inference. | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-163.1 | 163. (E7) Job architecture | Use the existing queue philosophy: | shallow | W7 — PENDING/CLONING/SPEAKING/READY/FAILED states |
| DOS-163.2 | 163. (E7) Job architecture | Job: | shallow | W7 — PENDING/CLONING/SPEAKING/READY/FAILED states |
| DOS-164.1 | 164. (E8) Job states |  | shallow | W7 — PENDING/CLONING/SPEAKING/READY/FAILED states |
| DOS-164.2 | 164. (E8) Job states | This gives CineForge reliable progress tracking. | shallow | W7 — PENDING/CLONING/SPEAKING/READY/FAILED states |
| DOS-165.1 | 165. (E9) Long scripts | Don't send a 30-minute script directly into the model. Pipeline: | shallow | W7 — 1800-char serial chunks; film path one call per scene; audio_generations never written |
| DOS-165.2 | 165. (E9) Long scripts | Each segment gets: | shallow | W7 — 1800-char serial chunks; film path one call per scene; audio_generations never written |
| DOS-166.1 | 166. (E10) Audio mastering belongs outside the model | This is critical. Do not ask the TTS model to be your mastering system. Architecture: | shallow | W7 — Mix-level only; no per-clip mastering, AAC not 48 kHz WAV |
| DOS-166.2 | 166. (E10) Audio mastering belongs outside the model | That integrates with the audio requirements already established for CineForge. | shallow | W7 — Mix-level only; no per-clip mastering, AAC not 48 kHz WAV |
| DOS-167.1 | 167. (E11) Model router | The router receives: | not built | W7 — Model chosen by env vars |
| DOS-167.2 | 167. (E11) Model router | The decision should not be hardcoded into CineForge. Use configuration: | not built | W7 — Model chosen by env vars |
| DOS-167.3 | 167. (E11) Model router | Routing can then change later without rebuilding CineForge. | not built | W7 — Model chosen by env vars |
| DOS-168.1 | 168. (E12) Model capabilities | Every adapter reports what it supports. For example: | not built | W7 — Model chosen by env vars |
| DOS-168.2 | 168. (E12) Model capabilities | Then the router knows what it can safely request. | not built | W7 — Model chosen by env vars |
| DOS-169.1 | 169. (E13) Storage | Don't put generated audio inside PostgreSQL. Use object storage: | shallow | W7 — Keys voiceovers/{user}/{id}.mp3 etc. |
| DOS-169.2 | 169. (E13) Storage | PostgreSQL stores metadata. Object storage stores media. | shallow | W7 — Keys voiceovers/{user}/{id}.mp3 etc. |
| DOS-170.1 | 170. (E14) Security | Voice profiles are sensitive. At minimum: | poorly built | W7 — No owner/consent check on synthesis; any voice UUID usable |
| DOS-170.2 | 170. (E14) Security | Never allow POST /v1/speech with someone else's voice_id. Database policy user_id → voice_id must al | poorly built | W7 — No owner/consent check on synthesis; any voice UUID usable |
| DOS-170.3 | 170. (E14) Security | For voice enrollment, consent_confirmed = true should be required. | poorly built | W7 — No owner/consent check on synthesis; any voice UUID usable |
| DOS-171.1 | 171. (E15) Docker architecture — separate CPU and GPU services |  | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-171.2 | 171. (E15) Docker architecture — separate CPU and GPU services | So you don't have to install every model on every GPU machine. | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-172.1 | 172. (E16) Deployment |  | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-172.2 | 172. (E16) Deployment | If Render is later stopped, the Voice Engine doesn't care. | not built | W7 — Lifecycle/gateway infra reusable; no voice GPU image |
| DOS-173.1 | 173. (E17) The most important API boundary — freeze now | CineForge should only know this: | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-173.2 | 173. (E17) The most important API boundary — freeze now | Everything underneath is the implementation. That is the part to freeze now. | not built | W7 — No /v1/voices /v1/speech API; web inserts rows directly |
| DOS-174.1 | 174. (E18) What Claude should NOT do | Tell Claude explicitly: | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-174.2 | 174. (E18) What Claude should NOT do | Do not embed Qwen3-TTS directly into CineForge. - DOS-174.3 Do not make CineForge import Qwen3 libra | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-174.3 | 174. (E18) What Claude should NOT do | Do not make CineForge import Qwen3 libraries. - DOS-174.4 Do not make the frontend know which TTS mo | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-174.4 | 174. (E18) What Claude should NOT do | Do not make the frontend know which TTS model is being used. - DOS-174.5 Do not store model-specific | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-174.5 | 174. (E18) What Claude should NOT do | Do not store model-specific assumptions in CineForge's database schema. - DOS-174.6 Do not make synt | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-174.6 | 174. (E18) What Claude should NOT do | Do not make synthesis requests synchronous. - DOS-174.7 Do not couple audio mastering to the TTS mod | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-174.7 | 174. (E18) What Claude should NOT do | Do not couple audio mastering to the TTS model. - DOS-174.8 Do not make voice profiles dependent on | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-174.8 | 174. (E18) What Claude should NOT do | Do not make voice profiles dependent on one specific model's internal representation. | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-174.9 | 174. (E18) What Claude should NOT do | Instead: Build a model-independent Voice Engine service with an adapter interface. | poorly built | W7 — Spec's 'do not' list currently violated (direct provider calls, model columns, UI names models) |
| DOS-175.1 | 175. (E19) The development sequence | Have Claude build it in this order: | n/a | W7 — Becomes the W7 build order |
| DOS-176.1 | 176. The end result | A CineForge user will eventually see something as simple as: | not built | W7 — End-state UI |
| DOS-176.2 | 176. The end result | Underneath that simple UI is the complete infrastructure: | not built | W7 — End-state UI |
| DOS-176.3 | 176. The end result | That is the architecture to use rather than making CineForge itself a voice-cloning application. It | not built | W7 — End-state UI |
