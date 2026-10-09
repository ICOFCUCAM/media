/**
 * CineForge Film IR (DirectorOS DOS-23, DOS-87; Part 2 §85 "AI Production
 * Compiler").
 *
 * The one structured object the planning model returns — the Film Production
 * Package — and the contract between the intelligence layer and everything
 * deterministic below it. The model fills it in ONE master call; CineForge
 * validates it (./validate.ts) and compiles it into canon rows, scenes, shots
 * and jobs. The model never controls the renderer (DOS-23.2).
 *
 * Identity is by stable string id (`char_maya`, `loc_harbour`, `prop_key`,
 * `scene_03`): every reference in the package points at an id defined in it,
 * so the compiler can resolve canon instead of pasting prose (DOS-4.3, 14.1).
 * Every creative decision carries a short `rationale` (DOS-47: "why").
 */
import { z } from "zod";

const id = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}_[a-z0-9][a-z0-9_]{0,47}$`), `id must look like ${prefix}_name (lowercase, digits, _)`);

export const CharacterId = id("char");
export const LocationId = id("loc");
export const PropId = id("prop");
export const SceneId = id("scene");
export const ThreadId = id("thread");
export const SetupId = id("setup");
export const WardrobeId = id("wardrobe");
export const FactId = id("fact");
export const RelationshipId = id("rel");

/** Who can know a fact: a character, or the audience (DirectorOS Part 1 §56–57). */
export const AUDIENCE = "audience" as const;
export const Knower = z.union([CharacterId, z.literal(AUDIENCE)]);

const text = (max: number) => z.string().trim().min(1).max(max);
const why = text(400).describe("one or two sentences: why this choice serves the film");

export const FilmBible = z.object({
  title: text(120),
  logline: text(300),
  synopsis: text(2000),
  genre: text(60),
  tone: text(120),
  themes: z.array(text(120)).min(1).max(6),
  visualStyle: z.object({
    palette: text(200),
    lighting: text(200),
    lensLanguage: text(200).describe("lenses, framing tendencies, camera behaviour"),
    texture: text(200).describe("grain, era, film stock, finish"),
  }),
  audioStyle: z.object({
    score: text(200),
    ambience: text(200),
  }),
  rationale: why,
});

export const Wardrobe = z.object({
  id: WardrobeId,
  description: text(300),
});

export const Character = z.object({
  id: CharacterId,
  name: text(80),
  role: z.enum(["protagonist", "antagonist", "supporting", "minor"]),
  age: z.number().int().min(0).max(130).nullable(),
  gender: z.string().trim().max(40).nullable(),
  identity: z.object({
    face: text(300).describe("canonical face: shape, eyes, skin, distinguishing features"),
    hair: text(200),
    body: text(200),
    marks: z.array(text(120)).max(6).describe("scars, tattoos, glasses — anything that must never drift"),
  }),
  wardrobe: z.array(Wardrobe).min(1).max(6),
  personality: text(400),
  voice: z.object({
    description: text(200).describe("timbre, pitch, pace, accent"),
  }),
  /**
   * Animated character design (W12; Part 5 §179.4): what keeps a drawn
   * character the same character — proportions, exact colours, how they move.
   * Required for animation, null for live action (defaults to null so plans
   * stored before W12 still parse).
   */
  design: z.object({
    proportions: text(200).describe("head-to-body ratio, silhouette, size relative to others"),
    palette: text(200).describe("the exact colours of skin, hair, eyes and outfit"),
    movement: text(200).describe("how they move: gait, gestures, energy"),
  }).nullable().default(null),
  arc: text(400),
  rationale: why,
});

export const LocationKind = z.enum(["CITY", "KINGDOM", "BUILDING", "ROOM", "LANDSCAPE", "INTERIOR", "EXTERIOR"]);

export const Location = z.object({
  id: LocationId,
  name: text(80),
  kind: LocationKind,
  description: text(500),
  architecture: text(300),
  era: text(80),
  lighting: text(200).describe("how light behaves here by default"),
  rationale: why,
});

export const Prop = z.object({
  id: PropId,
  name: text(80),
  description: text(300),
  ownerId: CharacterId.nullable(),
});

export const Act = z.object({
  index: z.number().int().min(1).max(5),
  purpose: text(300),
  sceneIds: z.array(SceneId).min(1),
});

/**
 * A story fact — something true in the story that characters and the audience
 * may or may not know yet (Part 1 §56–57). Knowledge only grows through
 * `knownAtStart` and scene `reveals`; dialogue that relies on a fact must come
 * from a speaker who knows it.
 */
export const Fact = z.object({
  id: FactId,
  statement: text(300),
  knownAtStart: z.array(Knower).max(13).describe(`who knows this before scene one ("${AUDIENCE}" = the audience)`),
});

/** A relationship between two characters and where it starts (Part 1 §32.4: relationships). */
export const Relationship = z.object({
  id: RelationshipId,
  a: CharacterId,
  b: CharacterId,
  initial: text(120).describe("how they stand at the start, e.g. estranged siblings, wary allies"),
});

export const RelationshipChange = z.object({
  relationshipId: RelationshipId,
  becomes: text(120).describe("how they stand after this scene"),
});

export const Thread = z.object({
  id: ThreadId,
  kind: z.enum(["plot", "subplot", "character_arc", "mystery", "relationship"]),
  description: text(300),
  sceneIds: z.array(SceneId).min(1),
  answerFactId: FactId.nullable().default(null).describe("mystery threads: the fact that answers it (revealed to the audience inside the thread)"),
});

/** Foreshadowing: Plant → Development → Payoff (Part 1 §58). */
export const Setup = z.object({
  id: SetupId,
  description: text(300).describe("what is planted"),
  plantedIn: SceneId,
  developedIn: z.array(SceneId).max(4).default([]).describe("scenes between plant and payoff that keep it alive"),
  paidOffIn: SceneId,
  factId: FactId.nullable().default(null).describe("the fact the plant establishes for the audience, so the payoff is earned"),
});

export const DialogueLine = z.object({
  characterId: CharacterId,
  line: text(400),
  emotion: z.string().trim().max(60).nullable(),
  references: z.array(FactId).max(4).default([]).describe("facts this line relies on — the speaker must know them"),
});

export const ShotSize = z.enum(["EWS", "WS", "MS", "MCU", "CU", "ECU", "INSERT"]);
export const CameraMovement = z.enum(["static", "pan", "tilt", "dolly", "crane", "handheld", "drone", "tracking"]);
export const CameraAngle = z.enum(["eye", "low", "high", "dutch", "overhead"]);

export const Shot = z.object({
  index: z.number().int().min(0),
  durationSec: z.number().int().min(2).max(10),
  size: ShotSize,
  angle: CameraAngle,
  movement: CameraMovement,
  lens: z.string().trim().max(40).nullable().describe("e.g. 35mm, 85mm, anamorphic"),
  subjectIds: z.array(z.union([CharacterId, PropId, LocationId])).max(6),
  action: text(400).describe("what visibly happens in this shot"),
  emotion: z.string().trim().max(80).nullable(),
  lighting: z.string().trim().max(200).nullable(),
  transition: z.enum(["cut", "dissolve", "match_cut", "fade_in", "fade_out", "smash_cut"]),
  side: z.enum(["A", "B", "neutral"]).nullable().default(null)
    .describe("camera side of the scene's action line (180° rule): A or B; neutral = on the line or a move that crosses it"),
  screenDirection: z.enum(["left", "right"]).nullable().default(null)
    .describe("which way the main subject looks or moves on screen"),
  rationale: why,
});

export const SceneAudio = z.object({
  music: z.string().trim().max(200).nullable().describe("cue for this scene, or null for silence/score bed"),
  ambience: text(200),
  sfx: z.array(text(80)).max(8),
});

export const SceneState = z.object({
  characterId: CharacterId,
  wardrobeId: WardrobeId,
  emotion: text(60),
  physical: z.string().trim().max(200).nullable().describe("injuries, dirt, wet — anything visible that carries forward"),
  holding: z.array(PropId).max(4),
});

/** Story time (Part 1 §33): which story day, and whether the scene picks up the previous one with no time cut. */
export const StoryTime = z.object({
  day: z.number().int().min(1).max(3650).describe("story day, 1 = the first day of the story"),
  continuous: z.boolean().describe("true when this scene continues the previous scene's action with no time cut (same clothes, same injuries)"),
  flashback: z.boolean(),
});

export const Reveal = z.object({
  factId: FactId,
  to: z.array(Knower).min(1).max(13).describe(`who learns the fact in this scene ("${AUDIENCE}" = the audience)`),
});

export const TimeOfDay = z.enum(["dawn", "day", "dusk", "night"]);

export const Scene = z.object({
  id: SceneId,
  index: z.number().int().min(0),
  act: z.number().int().min(1).max(5),
  heading: text(120).describe("INT./EXT. LOCATION - TIME"),
  locationId: LocationId,
  timeOfDay: TimeOfDay,
  storyTime: StoryTime.nullable().default(null),
  reveals: z.array(Reveal).max(8).default([]),
  relationshipChanges: z.array(RelationshipChange).max(6).default([]),
  deaths: z.array(CharacterId).max(8).default([]).describe("characters who die in this scene; they appear later only in flashbacks"),
  purpose: text(300).describe("what this scene does for the story"),
  summary: text(600).describe("what the audience sees"),
  emotionalArc: z.object({ start: text(80), middle: text(80), end: text(80) }),
  beats: z.array(text(200)).min(1).max(8),
  characters: z.array(SceneState).max(8).describe("who is present and their visible state"),
  dialogue: z.array(DialogueLine).max(24),
  narration: z.string().trim().max(1200).nullable().describe("voice-over, or null"),
  bridge: z.object({
    whatJustHappened: text(300),
    whatChanged: text(300),
    whatCarriesForward: text(300),
  }),
  audio: SceneAudio,
  shots: z.array(Shot).min(1).max(12),
  rationale: why,
});

export const FilmPackage = z.object({
  irVersion: z.literal(1),
  film: FilmBible,
  cast: z.array(Character).min(1).max(12),
  locations: z.array(Location).min(1).max(12),
  props: z.array(Prop).max(20),
  facts: z.array(Fact).max(24).default([]),
  relationships: z.array(Relationship).max(24).default([]),
  acts: z.array(Act).min(1).max(5),
  threads: z.array(Thread).max(10),
  setups: z.array(Setup).max(12),
  scenes: z.array(Scene).min(1),
});

export type FilmPackage = z.infer<typeof FilmPackage>;
export type FilmScene = z.infer<typeof Scene>;
export type FilmShot = z.infer<typeof Shot>;
export type FilmCharacter = z.infer<typeof Character>;
export type FilmLocation = z.infer<typeof Location>;
export type FilmProp = z.infer<typeof Prop>;
export type FilmFact = z.infer<typeof Fact>;
export type FilmRelationship = z.infer<typeof Relationship>;
export type FilmSetup = z.infer<typeof Setup>;
export type FilmThread = z.infer<typeof Thread>;
export type SceneCharacterState = z.infer<typeof SceneState>;
export type FilmStoryTime = z.infer<typeof StoryTime>;
export type FilmTimeOfDay = z.infer<typeof TimeOfDay>;
/** A package as stored before W3 (canon fields absent) — parse it with FilmPackage to fill defaults. */
export type FilmPackageInput = z.input<typeof FilmPackage>;
