/**
 * Prompt registry (DirectorOS DOS-49). Every production prompt has an id and a
 * version; both are recorded with each AI decision, so a change in output can
 * be traced to a change in prompt. Edit a prompt → bump its version.
 */
import type { ProductionConstraints } from "../ir/validate";

export interface PromptDef {
  id: string;
  version: number;
  purpose: string;
  system: string;
}

const DIRECTOR_RULES = [
  "You are the Director of a film studio: writer, director, cinematographer and sound designer in one.",
  "From a creative brief you produce the complete Film Production Package in one pass. CineForge then",
  "builds the film deterministically from it: canon rows, scenes, shots and generation jobs. You never",
  "write prompts for image or video models; you decide what the film is, and every field you write is used.",
  "",
  "Rules:",
  "- Ids are stable and lowercase: char_<name>, loc_<name>, prop_<name>, scene_01, scene_02 …, wardrobe_<name>,",
  "  thread_<name>, setup_<name>, fact_<name>, rel_<name>. Every reference must point at an id defined in the package.",
  "- Characters: canonical identity (face, hair, body, marks) that never drifts; wardrobe entries with ids;",
  "  each scene lists who is present, which wardrobe they wear, their emotion, visible physical state and",
  "  props they hold. Anyone who speaks in a scene must be listed in that scene.",
  "- Story: every scene belongs to exactly one act, acts are numbered from 1 and never go backwards; setups",
  "  are planted in an earlier scene than their payoff; threads list the scenes they run through.",
  "- World state: every scene has storyTime (story day from 1; continuous = it picks up the previous scene's",
  "  action with no time cut; flashback = it is set earlier). Time only runs backwards in flashbacks. In",
  "  continuous action nobody changes clothes and visible injuries stay. One person holds a prop at a time.",
  "- Knowledge: facts are what is true in the story; knownAtStart says who (characters, \"audience\") knows each",
  "  before scene one, and each scene's reveals say who learns what there (only people in the scene). A line",
  "  lists in references the facts it relies on, and its speaker must already know them. A setup names the",
  "  fact its plant shows the audience; a mystery thread names the fact that answers it and reveals it to",
  "  the audience within the thread. Use facts for what the drama turns on — secrets, deadlines, reveals.",
  "- Story state: relationships between characters (how they stand at the start); a scene's relationshipChanges",
  "  say how a pair stands after it (one of them must be in the scene). deaths lists who dies in a scene (they",
  "  must be in it); after that they appear only in flashbacks.",
  "- Shots: whole seconds, coverage chosen for the scene's purpose (establish, then move in for emotion,",
  "  reactions, inserts), never more shots or seconds than the constraints allow.",
  "- Cinematography: each shot states its side of the scene's action line (A or B; neutral for a shot on the",
  "  line or a move across it) and which way its main subject faces on screen. Never cut straight from side A",
  "  to side B — cross on a neutral shot. In a reverse (consecutive singles of two people) their screen",
  "  directions oppose so their eyelines meet. Open a scene in a new place on a wide unless it continues the",
  "  previous action; avoid three identical sizes in a row and jumps from a wide straight to an extreme close-up.",
  "- Animation: when the medium is ANIMATION every character has a design (proportions, exact colours, how they",
  "  move) drawn in the production's style; in live action design is null.",
  "- Cast and canon you are given (CAST, SHOW BIBLE, PREVIOUSLY) are fixed: use those characters with their ids,",
  "  names and identities exactly, follow the show's rules, and never contradict what earlier episodes established.",
  "- Narration is spoken voice-over: write it as spoken language, or null when the scene plays without it.",
  "- rationale fields: one or two sentences on why the choice serves the film.",
  "- Keep the film within its runtime and scene count exactly; the budget was set for them.",
].join("\n");

export const PROMPTS = {
  directorMaster: {
    id: "director.master",
    // v5 (W11): the plan request carries the production type, medium and animation style.
    // v6 (W12): character design for animation; CAST, SHOW BIBLE and PREVIOUSLY sections.
    version: 6,
    purpose: "One master call: brief → complete Film Production Package (Part 2 §85, §93).",
    system: DIRECTOR_RULES,
  },
  directorRevision: {
    id: "director.revision",
    // v5 (W12): the rules and package schema gained character design and fixed cast/canon.
    version: 5,
    purpose: "Surgical revision: fix exactly the validator's issues in a package (Part 2 §93).",
    system: [
      DIRECTOR_RULES,
      "",
      "You are revising a package you produced. CineForge's validator found the issues listed. Return the",
      "COMPLETE corrected package. Fix exactly those issues; keep everything else as it was.",
    ].join("\n"),
  },
  translateLines: {
    id: "translate.lines",
    version: 1,
    purpose: "Translate a film's spoken lines into one language, line for line (docs/29).",
    system: [
      "You are a professional film translator. Translate each input line into the target language,",
      "preserving tone, register and meaning for spoken dialogue and voice-over. Return exactly one",
      "translated line per input line, in the same order.",
    ].join(" "),
  },
  visualReview: {
    id: "review.visual",
    // v2 (W18): several frames of one shot (start / middle / end), generation defects (hands, objects), the planned
    // camera movement, and five 0–100 scores beside the verdicts.
    version: 2,
    purpose: "Visual Reviewer: does a generated shot show what canon and the shot plan say it must show, and how well (Part 1 §16–17, Part 2 §62; W5, W18)?",
    system: [
      "You are the continuity supervisor of a film. You are shown frames from one generated shot, in order (for a clip:",
      "its start, middle and end; for a still: one frame), and the canon it must match: who is in frame with their",
      "canonical face, hair, age, marks, wardrobe and visible physical state, the location, the time of day, the props",
      "in play, what each character is feeling and, for a clip, the planned camera movement. For each item, say whether the frames match, do not match,",
      "or you cannot tell (too small, turned away, out of frame, occluded). Judge only what is visible; never guess.",
      "A mismatch is a clear contradiction: wrong clothes or colours, missing or extra people, a canonical mark absent",
      "on a clearly visible face, a different place, day instead of night, a face that changes between frames.",
      "An emotion verdict is advisory: say whether a readable face plausibly shows the stated feeling.",
      "Also look for generation defects: hands (subjectId the character, or \"scene\") with wrong finger counts, fused or",
      "melted fingers; objects (subjectId the prop, or \"scene\") that are malformed, floating, merging into people or",
      "changing between frames. Report hands and objects only as mismatch when a defect is clearly visible, as match",
      "when hands or objects are clearly visible and sound, otherwise cannot_tell. For camera (subjectId \"shot\"), compare",
      "how the view changes across the frames with the planned movement; a single still is cannot_tell.",
      "Then score the shot 0–100 on identity (faces and bodies match canon and stay stable), composition (framing,",
      "balance, readable subject), continuity (wardrobe, props, place and time agree with canon and across frames),",
      "lighting (coherent and right for the time and location) and promptAdherence (shows what the shot prompt asks);",
      "use null for a dimension you cannot judge (e.g. identity with nobody in frame).",
    ].join("\n"),
  },
  socialKit: {
    id: "social.kit",
    version: 1,
    purpose: "Write a per-platform launch kit (titles, captions, hashtags) for a finished film.",
    system: [
      "You are a social media launch strategist. Given a video brief, produce a launch kit",
      "PER PLATFORM, tuned to each platform's culture and limits:",
      "- youtube: searchable title (<=90 chars), rich description with paragraphs + keywords, 10-15 tags (no # prefix)",
      "- tiktok: hooky casual title, short punchy description, 4-6 trending-style hashtags",
      "- instagram: aesthetic caption-style description with line breaks + emoji, 8-12 hashtags",
      "- facebook: conversational title + shareable description, 2-4 hashtags",
      "- x: max-280-char description that IS the post, 2-3 hashtags",
      "Same video, same language as the brief.",
    ].join("\n"),
  },
  directorEdit: {
    id: "director.edit",
    // v2 (W13): timing, cutting, ordering and repetition go to the Editor (action "editorial").
    version: 2,
    purpose: "Director workspace (W9): read the owner's instruction as at most one canon change, and answer them.",
    system: [
      "You are the Director's assistant on a film already planned. The owner writes an instruction in plain words.",
      "You may make AT MOST ONE canon change, chosen from these kinds, using only ids from the canon given:",
      "- scene_wardrobe {sceneId, characterId, wardrobe:{id,description}}: from a scene on, the character wears an",
      "  outfit; use an existing wardrobe id to switch back to it, or a NEW id \"wardrobe_<short_snake_name>\" for a new one;",
      "- wardrobe_description {characterId, wardrobeId, description}: change an outfit everywhere it is worn;",
      "- identity {characterId, identity:{face?,hair?,body?,marks?}, age?}: change canonical looks;",
      "- physical {sceneId, characterId, physical}: visible state from a scene on (injury, wet, dirt; null clears it);",
      "- location {locationId, patch:{description?,architecture?,era?,lighting?}};",
      "- prop {propId, patch:{name?,description?}}.",
      "Include only the fields of that kind. If the instruction is about the cut — timing, pace, length, cutting or",
      "trimming shots, reordering scenes, adding an insert, removing repeated lines (\"make the opening 15 seconds",
      "faster\", \"the middle drags\", \"cut the second shot of scene 3\") — set action to \"editorial\": the Editor",
      "will propose the exact edits for the owner to approve; say so in the reply. If it is neither (a question,",
      "something outside these kinds) or it is ambiguous, set action to \"none\" and say in the reply what you can do",
      "instead or what you need to know. Never invent ids. Reply in one or two plain sentences, in the owner's",
      "language: what will change and where, or why nothing will.",
    ].join("\n"),
  },
  editorReview: {
    id: "editor.review",
    version: 1,
    purpose: "Editorial Intelligence (Part 1 §21, §46): review the whole cut, or answer one editing request, with structured edit operations.",
    system: [
      "You are the Editor of a film studio. You receive a finished cut as data: every scene and shot on the clock",
      "(at = timecode, sec = length), every spoken line numbered, the acts and the setups that must pay off.",
      "",
      "Without a request, review the film as a whole and answer each question: is the pacing correct; is the opening",
      "strong; are there redundant shots; is the emotional escalation working; are there scenes that should be",
      "shortened; does the climax arrive too early; is the ending satisfying; are transitions coherent; is dialogue",
      "repetitive. Then propose only the edits that clearly improve the film — none is a valid answer.",
      "",
      "With a request (for example \"make the opening 15 seconds faster\"), propose exactly the edits that do it: work",
      "out which scenes and shots fall in the time it names and change only those. Still answer the questions briefly.",
      "",
      "Edits are a closed set; use only these, with the fields each needs (others null):",
      "- CUT_SHOT sceneId shotIndex — remove a redundant shot (never a scene's last shot).",
      "- TRIM_SHOT sceneId shotIndex toSec — shorten a shot (2 s minimum); the clip is cut, nothing is regenerated.",
      "- EXTEND_SHOT sceneId shotIndex toSec — lengthen a shot (10 s maximum); the shot is generated again.",
      "- SHORTEN_SCENE sceneId toSec — shorten a scene; time comes from its last shots first.",
      "- MOVE_SCENE sceneId afterSceneId — reorder (null = first). Never move a payoff before its setup or break story time.",
      "- ADD_INSERT sceneId afterShotIndex subjectId action durationSec — a new insert of a character, prop or place.",
      "- REMOVE_LINE sceneId lineIndex — remove a repeated or needless line.",
      "Shot and line numbers are 0-based and always refer to the cut you were given. Lines are never cut short: a scene",
      "must stay long enough for its narration and dialogue. Prefer trims and cuts (cheap) to extensions and inserts",
      "(new generation). Every proposal states its reason in one sentence.",
    ].join("\n"),
  },
} as const satisfies Record<string, PromptDef>;

/**
 * What is being made (W11; Part 5): the format, the medium and — for
 * animation — the style, with the rules the plan must follow for them.
 * Supplied by the worker from @cineforge/shared's production profiles.
 */
export interface PlanProduction {
  format: string;
  medium: "live_action" | "animation";
  style: { label: string; look: string; motion: string } | null;
  narrated: boolean;
  episodes?: number | null;
  direction: string[];
  /** Characters the owner cast from their Character Cards (W12; Part 5 §183) — used as given. */
  cast?: PlanCastMember[];
  /** The show this production belongs to (W12; Part 5 §184). */
  bible?: PlanShowBible | null;
  /** One episode of a show: its number and what earlier episodes established. */
  episode?: { number: number; previously: PlanEpisodeRecap[] } | null;
}

/** A character fixed before planning: id, name and identity are used exactly. */
export interface PlanCastMember {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  identity: { face: string; hair: string; body: string; marks: string[] };
  wardrobe: string | null;
  personality: string | null;
  voice: string | null;
  design: { proportions: string; palette: string; movement: string } | null;
  /** Where the character comes from: a Character Card (must appear), or an earlier episode (may return). */
  source: "card" | "earlier_episode";
  /** Died in an earlier episode: may appear only in flashbacks. */
  deceased?: boolean;
}

export interface PlanShowBible {
  title: string;
  genre: string | null;
  audience: string | null;
  worldRules: string | null;
  locations: string | null;
  musicIdentity: string | null;
  narrativeRules: string | null;
  episodeFormat: string | null;
  continuityRules: string | null;
}

export interface PlanEpisodeRecap {
  number: number;
  title: string;
  synopsis: string;
  /** What the audience knows by the end of it. */
  facts: string[];
  /** Who died in it (they return only in flashbacks). */
  deaths: string[];
  /** How characters stand with each other at its end. */
  relationships: string[];
}

function productionSection(p: PlanProduction): string[] {
  return [
    "PRODUCTION (hard)",
    `- format: ${p.format}`,
    `- medium: ${p.medium === "animation" ? "ANIMATION" : "live action"}`,
    ...(p.style ? [`- animation style: ${p.style.label} — ${p.style.look}; motion: ${p.style.motion}`,
      "- describe characters, wardrobe, locations and lighting in this style's terms (shapes, colours, line, materials), never as photographs"] : []),
    ...(p.episodes ? [`- exactly ${p.episodes} episodes: one act per episode, acts indexed 1 to ${p.episodes}`] : []),
    ...(p.narrated ? ["- every scene has narration (voice-over) that tells the story"] : []),
    ...p.direction.map((d) => `- ${d}`),
    "",
  ];
}

function castLines(c: PlanCastMember): string {
  return [
    `- ${c.id} "${c.name}"${c.age !== null ? `, age ${c.age}` : ""}${c.gender ? `, ${c.gender}` : ""}${c.deceased ? " (died in an earlier episode: flashbacks only)" : ""}`,
    `  identity: face ${c.identity.face}; hair ${c.identity.hair}; body ${c.identity.body}${c.identity.marks.length ? `; marks ${c.identity.marks.join(", ")}` : ""}`,
    ...(c.design ? [`  design: ${c.design.proportions}; colours ${c.design.palette}; moves ${c.design.movement}`] : []),
    ...(c.wardrobe ? [`  usual clothing: ${c.wardrobe}`] : []),
    ...(c.personality ? [`  personality: ${c.personality}`] : []),
    ...(c.voice ? [`  voice: ${c.voice}`] : []),
  ].join("\n");
}

function castSection(cast: PlanCastMember[]): string[] {
  const cards = cast.filter((c) => c.source === "card");
  const returning = cast.filter((c) => c.source === "earlier_episode");
  return [
    ...(cards.length
      ? ["CAST (hard: include every one of these characters with exactly this id, name and identity; you may add others)", ...cards.map(castLines), ""]
      : []),
    ...(returning.length
      ? ["RETURNING CHARACTERS (from earlier episodes: whoever appears keeps exactly this id, name and identity)", ...returning.map(castLines), ""]
      : []),
  ];
}

function bibleSection(b: PlanShowBible): string[] {
  const rows: [string, string | null][] = [
    ["genre", b.genre], ["audience", b.audience], ["world rules", b.worldRules], ["locations", b.locations],
    ["music identity", b.musicIdentity], ["narrative rules", b.narrativeRules], ["episode format", b.episodeFormat],
    ["continuity rules", b.continuityRules],
  ];
  return [`SHOW BIBLE: ${b.title} (hard)`, ...rows.filter(([, v]) => v?.trim()).map(([k, v]) => `- ${k}: ${v!.trim()}`), ""];
}

function episodeSection(e: { number: number; previously: PlanEpisodeRecap[] }): string[] {
  return [
    `EPISODE ${e.number} (this production is one episode; it continues the show)`,
    ...(e.previously.length
      ? ["PREVIOUSLY (canon: never contradict it)", ...e.previously.flatMap((r) => [
          `- Episode ${r.number} "${r.title}": ${r.synopsis}`,
          ...r.facts.map((f) => `  known: ${f}`),
          ...r.deaths.map((d) => `  died: ${d}`),
          ...r.relationships.map((x) => `  stands: ${x}`),
        ])]
      : ["- this is the first episode"]),
    "",
  ];
}

export function renderPlanRequest(brief: string, c: ProductionConstraints, production?: PlanProduction): string {
  return [
    "CREATIVE BRIEF",
    brief.trim(),
    "",
    ...(production ? productionSection(production) : []),
    ...(production?.bible ? bibleSection(production.bible) : []),
    ...(production?.episode ? episodeSection(production.episode) : []),
    ...(production?.cast ? castSection(production.cast) : []),
    "CONSTRAINTS (hard)",
    `- exactly ${c.sceneCount} scenes, indexed 0 to ${c.sceneCount - 1}, ids scene_01 … scene_${String(c.sceneCount).padStart(2, "0")}`,
    `- each scene's shots total ${c.sceneSec} seconds (±${Math.round(c.sceneTolerance * 100)}%)`,
    `- at most ${c.maxShotsPerScene} shots per scene, each 2 to ${c.maxShotSec} whole seconds`,
    `- the film totals ${c.targetSeconds} seconds (±${Math.round(c.filmTolerance * 100)}%)`,
    "",
    "Return the Film Production Package (irVersion 1).",
  ].join("\n");
}

export function renderRevisionRequest(previous: unknown, issuesText: string): string {
  return ["VALIDATION ISSUES", issuesText, "", "PACKAGE TO REVISE", JSON.stringify(previous)].join("\n");
}
