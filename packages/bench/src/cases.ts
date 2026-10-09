/**
 * Labelled benchmark cases (DirectorOS Part 1 §50): continuity, dialogue,
 * cinematography and voice. Each case takes one known-good corpus film, makes
 * ONE known change, and names exactly what the engines must report. Controls
 * (`expect: []`) are changes the engines must NOT flag — they measure false
 * positives. A case passes when every expected code is detected and, for a
 * control, nothing is.
 */
import {
  checkContinuity,
  checkFilmContinuity,
  cinemaAdvisories,
  canonicalHash,
  compileFor,
  compileGeneration,
  MODEL_PROFILES,
  sizeWords,
  validateFilmPackage,
  type FilmPackage,
  type FilmScene,
  type GenerationRequest,
} from "@cineforge/movie";
import { judgeVoiceSample, routeVoice, segmentScript, type VoiceSampleFacts } from "@cineforge/voice-contracts";
import { benchmarkFilm, corpusConstraints } from "./corpus";

export type Suite = "continuity" | "dialogue" | "cinematography" | "voice";
export const SUITES: Suite[] = ["continuity", "dialogue", "cinematography", "voice"];

export interface BenchCase {
  id: string;
  suite: Suite;
  description: string;
  /** Codes that must be reported; [] = a control that must report nothing. */
  expect: string[];
  /** Codes the engines actually reported. */
  detect(): string[];
}

// ── how a case is observed ────────────────────────────────────────────

/** Codes the plan validator and the cinematography advisories report for a mutated film. */
function planCodes(pkg: FilmPackage): string[] {
  const v = validateFilmPackage(pkg, corpusConstraints());
  const codes = v.ok ? [] : v.issues.map((i) => i.code);
  // Advisories need a schema-valid package (they walk the shots).
  const parsed = v.ok ? v.pkg : v.pkg;
  const adv = parsed ? cinemaAdvisories(parsed).map((a) => a.code) : [];
  // Every planned shot against the world state too (warnings included), when the ids resolve.
  let shots: string[] = [];
  if (parsed && !codes.includes("UNKNOWN_REFERENCE")) {
    try {
      shots = checkFilmContinuity(parsed).flatMap((x) => x.result.violations.map((w) => w.code));
    } catch {
      shots = ["CONTINUITY_UNCHECKABLE"];
    }
  }
  return [...new Set([...codes, ...adv, ...shots])];
}

function mutated(film: number, change: (pkg: FilmPackage, h: Helpers) => void): () => string[] {
  return () => {
    const pkg = benchmarkFilm(film);
    change(pkg, helpers(pkg));
    return planCodes(pkg);
  };
}

function requested(film: number, req: (pkg: FilmPackage, h: Helpers) => GenerationRequest): () => string[] {
  return () => {
    const pkg = benchmarkFilm(film);
    return [...new Set(checkContinuity(pkg, req(pkg, helpers(pkg))).violations.map((v) => v.code))];
  };
}

interface Helpers {
  scene(i: number): FilmScene;
  /** Cast member id by corpus index (0 protagonist, 1 antagonist, 2–3 supporting, 4 minor who dies in scene 7). */
  c(i: number): string;
  wardrobe(i: number, which: "day" | "night"): string;
  words(n: number): string;
}

function helpers(pkg: FilmPackage): Helpers {
  return {
    scene: (i) => pkg.scenes[i]!,
    c: (i) => pkg.cast[i]!.id,
    wardrobe: (i, which) => pkg.cast[i]!.wardrobe[which === "day" ? 0 : 1]!.id,
    words: (n) => Array.from({ length: n }, (_, k) => ["the", "tide", "turns", "before", "morning", "and", "we", "run"][k % 8]).join(" ") + ".",
  };
}

const C = (id: string, description: string, expect: string[], detect: () => string[]): BenchCase => ({ id, suite: "continuity", description, expect, detect });
const D = (id: string, description: string, expect: string[], detect: () => string[]): BenchCase => ({ id, suite: "dialogue", description, expect, detect });
const K = (id: string, description: string, expect: string[], detect: () => string[]): BenchCase => ({ id, suite: "cinematography", description, expect, detect });
const V = (id: string, description: string, expect: string[], detect: () => string[]): BenchCase => ({ id, suite: "voice", description, expect, detect });

// ── continuity (20 defects + 2 controls) ──────────────────────────────

const continuity: BenchCase[] = [
  C("C01", "wardrobe changes inside continuous action", ["WARDROBE_CHANGE_IN_CONTINUOUS_ACTION"],
    mutated(0, (p, h) => { h.scene(7).characters[0]!.wardrobeId = h.wardrobe(0, "day"); })),
  C("C02", "an injury vanishes inside continuous action", ["PHYSICAL_STATE_DROPPED"],
    mutated(1, (p, h) => { h.scene(7).characters[0]!.physical = null; })),
  C("C03", "a dead character appears in a present-day scene", ["DEAD_CHARACTER_APPEARS"],
    mutated(2, (p, h) => { h.scene(8).characters.push({ characterId: h.c(4), wardrobeId: h.wardrobe(4, "day"), emotion: "calm", physical: null, holding: [] }); })),
  C("C04", "a character dies in a scene they are not in", ["DEATH_OF_ABSENT"],
    mutated(3, (p, h) => { h.scene(2).deaths = [h.c(4)]; })),
  C("C05", "a death is recorded in a flashback", ["DEATH_IN_FLASHBACK"],
    mutated(4, (p, h) => { h.scene(6).storyTime = { day: 2, continuous: false, flashback: true }; })),
  C("C06", "story time runs backwards outside a flashback", ["TIME_REGRESSION"],
    mutated(5, (p, h) => { h.scene(5).storyTime = { day: 1, continuous: false, flashback: false }; })),
  C("C07", "a continuous scene jumps to another day", ["CONTINUOUS_TIME_JUMP"],
    mutated(6, (p, h) => { h.scene(7).storyTime = { day: 3, continuous: true, flashback: false }; })),
  C("C08", "two characters hold the same prop", ["PROP_TWO_HOLDERS"],
    mutated(7, (p, h) => { h.scene(2).characters[1]!.holding.push(p.props[0]!.id); })),
  C("C09", "a character relies on a fact before learning it", ["KNOWLEDGE_VIOLATION"],
    mutated(8, (p, h) => { h.scene(2).dialogue[0]!.references = ["fact_culprit"]; })),
  C("C10", "a fact is revealed to someone not in the scene", ["REVEAL_TO_ABSENT"],
    mutated(9, (p, h) => { h.scene(3).reveals[0]!.to.push(h.c(1)); })),
  C("C11", "a setup pays off before it is planted", ["PAYOFF_BEFORE_SETUP"],
    mutated(0, (p) => { p.setups[0] = { ...p.setups[0]!, plantedIn: "scene_06", developedIn: [], paidOffIn: "scene_03" }; })),
  C("C12", "a mystery is never answered for the audience", ["MYSTERY_UNRESOLVED"],
    mutated(1, (p, h) => { h.scene(8).reveals = []; })),
  C("C13", "a shot frames a character who is not in the scene", ["FRAMED_NOT_PRESENT"],
    mutated(2, (p, h) => { h.scene(4).shots[2]!.subjectIds = [h.c(2)]; })),
  C("C14", "a relationship changes with neither party present", ["RELATIONSHIP_CHANGE_OFFSCREEN"],
    mutated(3, (p, h) => {
      p.relationships.push({ id: "rel_cold", a: h.c(1), b: h.c(4), initial: "strangers" });
      h.scene(1).relationshipChanges = [{ relationshipId: "rel_cold", becomes: "enemies" }];
    })),
  C("C15", "a shot is requested in the wrong location", ["LOCATION_MISMATCH"],
    requested(4, (p) => ({ sceneId: "scene_01", shotIndex: 1, locationId: p.locations[1]!.id }))),
  C("C16", "a shot is requested at the wrong time of day", ["TIME_MISMATCH"],
    requested(5, () => ({ sceneId: "scene_04", shotIndex: 1, timeOfDay: "day" }))),
  C("C17", "a shot is requested in the wrong wardrobe", ["WARDROBE_MISMATCH"],
    requested(6, (p, h) => ({ sceneId: "scene_04", shotIndex: 1, characters: [{ characterId: h.c(0), wardrobeId: h.wardrobe(0, "day") }] }))),
  C("C18", "a shot is requested with the wrong hair", ["HAIR_MISMATCH"],
    requested(7, (p, h) => ({ sceneId: "scene_02", shotIndex: 1, characters: [{ characterId: h.c(0), hair: "long blonde hair" }] }))),
  C("C19", "a shot drops a visible injury", ["INJURY_MISSING"],
    requested(8, (p, h) => ({ sceneId: "scene_07", shotIndex: 1, characters: [{ characterId: h.c(0), physical: null }] }))),
  C("C20", "a shot drops an identifying mark", ["MARK_MISSING"],
    requested(9, (p, h) => ({ sceneId: "scene_03", shotIndex: 1, characters: [{ characterId: h.c(0), marks: [] }] }))),
  C("C21", "control: a faithful request reports nothing", [],
    requested(0, (p, h) => ({ sceneId: "scene_08", shotIndex: 1, characters: [{ characterId: h.c(0), wardrobeId: h.wardrobe(0, "night"), physical: "cut on the left hand", marks: [...p.cast[0]!.identity.marks] }] }))),
  C("C22", "control: an injury healed by the next story day is not a defect", [],
    mutated(1, (p, h) => { h.scene(8).characters[0]!.physical = null; })),
];

// ── dialogue (20 defects/properties + controls) ───────────────────────

const LONG_NARRATION = Array.from({ length: 12 }, (_, i) => `Sentence ${i + 1} of the keeper's account runs on, carefully, about the light and the sea and the long nights.`).join(" ");

/** Defects of a segmentation (empty when the segmenter kept every promise). */
function segmentDefects(text: string, max: number): string[] {
  const segs = segmentScript(text, max);
  const out: string[] = [];
  if (segs.some((s) => s.text.length > max)) out.push("SEGMENT_OVER_LIMIT");
  const squash = (t: string) => t.replace(/\s+/g, "");
  if (squash(segs.map((s) => s.text).join("")) !== squash(text)) out.push("TEXT_LOST");
  if (segs.some((s, i) => s.sequence !== i + 1 || s.segmentId !== `seg_${String(i + 1).padStart(3, "0")}`)) out.push("SEQUENCE_BROKEN");
  const words = new Set(text.split(/\s+/).map((w) => w.trim()).filter(Boolean));
  if (segs.some((s) => s.text.split(/\s+/).some((w) => w && !words.has(w)))) out.push("MID_WORD_SPLIT");
  return out;
}

const dialogue: BenchCase[] = [
  D("D01", "a line is spoken by someone not in the scene", ["SPEAKER_NOT_PRESENT"],
    mutated(0, (p, h) => { h.scene(1).dialogue.push({ characterId: h.c(3), line: "I was never here.", emotion: null, references: [] }); })),
  D("D02", "a line is too long for its scene", ["SPEECH_TOO_LONG"],
    mutated(1, (p, h) => { h.scene(2).dialogue[0]!.line = h.words(60); })),
  D("D03", "narration is too long for its scene", ["SPEECH_TOO_LONG"],
    mutated(2, (p, h) => { h.scene(4).narration = h.words(50); })),
  D("D04", "a dying character relies on a secret they never learned", ["KNOWLEDGE_VIOLATION"],
    mutated(3, (p, h) => { h.scene(6).dialogue[1]!.references = ["fact_letter"]; })),
  D("D05", "a line relies on a fact that does not exist", ["UNKNOWN_REFERENCE"],
    mutated(4, (p, h) => { h.scene(1).dialogue[0]!.references = ["fact_missing"]; })),
  D("D06", "a line is spoken by someone not in the cast", ["UNKNOWN_REFERENCE"],
    mutated(5, (p, h) => { h.scene(1).dialogue[0]!.characterId = "char_nobody"; })),
  D("D07", "control: a line relies on a fact revealed two scenes earlier", [],
    mutated(6, (p, h) => { h.scene(9).dialogue[0]!.references = ["fact_culprit"]; })),
  D("D08", "control: a line relies on a fact revealed in the same scene", [],
    mutated(7, (p, h) => { h.scene(8).dialogue[0]!.references = ["fact_culprit"]; })),
  D("D09", "control: a character relies on a fact known from the start", [],
    mutated(8, (p, h) => { h.scene(2).dialogue[1]!.references = ["fact_debt"]; })),
  D("D10", "control: narration that fits beside the dialogue", [],
    mutated(9, (p, h) => { h.scene(1).narration = h.words(12); })),
  D("D11", "a dead character speaks", ["SPEAKER_NOT_PRESENT"],
    mutated(0, (p, h) => { h.scene(8).dialogue.push({ characterId: h.c(4), line: "Remember me.", emotion: null, references: [] }); })),
  D("D12", "a character relies on a fact only the audience was told", ["KNOWLEDGE_VIOLATION"],
    mutated(1, (p, h) => {
      p.facts.push({ id: "fact_omen", statement: "the bell rang by itself", knownAtStart: ["audience"] });
      h.scene(2).dialogue[1]!.references = ["fact_omen"];
    })),
  D("D13", "a character relies on a fact revealed to someone else", ["KNOWLEDGE_VIOLATION"],
    mutated(2, (p, h) => { h.scene(5).dialogue[1]!.references = ["fact_culprit"]; h.scene(5).dialogue[0]!.references = []; })),
  D("D14", "many short lines that overflow the scene", ["SPEECH_TOO_LONG"],
    mutated(3, (p, h) => { h.scene(0).dialogue = Array.from({ length: 12 }, (_, i) => ({ characterId: i % 2 ? h.c(1) : h.c(0), line: h.words(5), emotion: null, references: [] })); })),
  D("D15", "segmentation: a long narration stays under the engine limit with nothing lost", [], () => segmentDefects(LONG_NARRATION, 400)),
  D("D16", "segmentation: one unpunctuated sentence is split between words", [], () => segmentDefects(h900(), 400)),
  D("D17", "segmentation: paragraphs never share a segment", [], () => {
    const segs = segmentScript("First paragraph ends here.\n\nSecond paragraph starts here.", 400);
    return segs.length === 2 ? [] : ["PARAGRAPH_MERGED"];
  }),
  D("D18", "segmentation: quotes and ellipses end sentences cleanly", [], () => segmentDefects("“Wait…” she said. \"Now!\" He ran. Then silence…", 20)),
  D("D19", "segmentation: the MiniMax limit (1,800 chars) is honoured", [], () => segmentDefects(LONG_NARRATION.repeat(3), 1800)),
  D("D20", "segmentation: sequence and ids are stable and ordered", [], () => segmentDefects(LONG_NARRATION, 120)),
];

function h900(): string {
  return Array.from({ length: 150 }, (_, i) => ["lantern", "salt", "rope", "keeper", "window", "storm"][i % 6]).join(" ");
}

// ── cinematography (20 defects/properties + controls) ─────────────────

/** Compile every shot of a film for a model; return the compiled prompts with their canon. */
function compiledShots(film: number, modelId: string) {
  const pkg = benchmarkFilm(film);
  return pkg.scenes.flatMap((s) => s.shots.map((sh) => {
    const req = compileGeneration(pkg, s.id, sh.index);
    return { pkg, scene: s, shot: sh, req, out: compileFor(modelId, req) };
  }));
}

const lower = (s: string) => s.toLowerCase();

const cinematography: BenchCase[] = [
  K("K01", "consecutive shots cross the action line", ["CROSSES_LINE"],
    mutated(0, (p, h) => { h.scene(0).shots[2]!.side = "B"; })),
  K("K02", "a reverse whose eyelines do not meet", ["EYELINE_MISMATCH"],
    mutated(1, (p, h) => { h.scene(1).shots[2]!.screenDirection = "right"; })),
  K("K03", "a scene in a new place opens without an establishing shot", ["NO_ESTABLISHING_SHOT"],
    mutated(2, (p, h) => { h.scene(1).shots[0]!.size = "MS"; })),
  K("K04", "three shots of the same size in a row", ["SIZE_REPEAT"],
    mutated(3, (p, h) => { h.scene(2).shots.forEach((s) => { s.size = "MS"; }); })),
  K("K05", "a jump from a wide straight to an extreme close-up", ["SIZE_JUMP"],
    mutated(4, (p, h) => { h.scene(3).shots[1]!.size = "ECU"; })),
  K("K06", "a subject's screen direction flips between shots", ["SCREEN_DIRECTION_FLIP"],
    mutated(5, (p, h) => { const s = h.scene(4).shots[2]!; s.subjectIds = [h.c(0)]; s.screenDirection = "left"; })),
  K("K07", "a shot longer than the runtime's per-clip maximum", ["SHOT_TOO_LONG"],
    mutated(6, (p, h) => { const s = h.scene(5).shots; s[0]!.durationSec = 8; s[1]!.durationSec = 2; s[2]!.durationSec = 2; })),
  K("K08", "more shots than the scene budget allows", ["TOO_MANY_SHOTS"],
    mutated(7, (p, h) => {
      const sc = h.scene(6);
      const extra = sc.shots.slice(1).map((s, i) => ({ ...structuredClone(s), index: 3 + i, durationSec: 2 }));
      sc.shots = [...sc.shots.map((s) => ({ ...s, durationSec: s.index === 0 ? 4 : 2 })), ...extra];
      sc.shots.forEach((s, i) => { s.index = i; });
    })),
  K("K09", "shots out of order", ["SHOT_ORDER"],
    mutated(8, (p, h) => { const s = h.scene(7).shots; s[1]!.index = 2; s[2]!.index = 1; })),
  K("K10", "a scene shorter than planned", ["SCENE_LENGTH"],
    mutated(9, (p, h) => { h.scene(8).shots.forEach((s) => { s.durationSec = 2; }); })),
  K("K11", "control: a smash cut may jump from wide to extreme close-up", [],
    mutated(0, (p, h) => { const s = h.scene(3).shots[1]!; s.size = "ECU"; s.transition = "smash_cut"; })),
  K("K12", "control: a neutral shot between the two sides keeps the line", [],
    mutated(1, (p, h) => {
      const sc = h.scene(0);
      sc.shots = [sc.shots[0]!, { ...sc.shots[1]!, side: "A" }, { ...structuredClone(sc.shots[1]!), index: 2, side: "neutral", screenDirection: null, durationSec: 2, size: "MS" },
        { ...sc.shots[2]!, index: 3, side: "B", durationSec: 2 }];
    })),
  K("K13", "every Wan prompt states size, angle, lens and camera move", [], () => compiledShots(2, "wan-2.1").flatMap(({ shot, out }) => {
    const p = lower(out.prompt);
    return [
      p.includes(sizeWords(shot.size)) ? null : "PROMPT_MISSING_SIZE",
      shot.lens && !p.includes(lower(shot.lens)) ? "PROMPT_MISSING_LENS" : null,
      p.includes("camera") || p.includes("dolly") ? null : "PROMPT_MISSING_MOVE",
    ].filter((x): x is string => !!x);
  })),
  K("K14", "Wan prompts fit the model and carry the negative prompt", [], () => compiledShots(3, "wan-2.1").flatMap(({ out }) => [
    out.prompt.length > MODEL_PROFILES["wan-2.1"]!.maxPromptChars ? "PROMPT_TOO_LONG" : null,
    out.negativePrompt ? null : "NEGATIVE_MISSING",
    out.dropped.length ? "PROMPT_PARTS_DROPPED" : null,
  ].filter((x): x is string => !!x))),
  K("K15", "Hunyuan prompts use its own camera vocabulary", [], () => compiledShots(4, "hunyuan").flatMap(({ shot, out }) =>
    shot.movement === "dolly" && !lower(out.prompt).includes("dolly-in") ? ["HUNYUAN_MOVE_VOCABULARY"] : [])),
  K("K16", "a still cannot move: the camera move is recorded as dropped", ["MOVEMENT_DROPPED"], () => {
    const first = compiledShots(5, "openai-image").find((x) => x.shot.movement !== "static")!;
    return first.out.dropped.some((d) => d.startsWith("camera movement")) ? ["MOVEMENT_DROPPED"] : [];
  }),
  K("K17", "the canonical hash is stable and changes when canon changes", [], () => {
    const a = benchmarkFilm(6);
    const b = benchmarkFilm(6);
    b.cast[0]!.wardrobe[1]!.description = "white linen coat";
    const h1 = canonicalHash(compileGeneration(a, "scene_04", 1));
    const h2 = canonicalHash(compileGeneration(benchmarkFilm(6), "scene_04", 1));
    const h3 = canonicalHash(compileGeneration(b, "scene_04", 1));
    return [h1 !== h2 ? "HASH_UNSTABLE" : null, h1 === h3 ? "HASH_BLIND_TO_CANON" : null].filter((x): x is string => !!x);
  }),
  K("K18", "character shots carry face, hair and the wardrobe of the scene", [], () => compiledShots(7, "wan-2.1").flatMap(({ pkg, scene, shot, out }) => {
    const p = out.prompt;
    return shot.subjectIds.filter((s) => s.startsWith("char_")).flatMap((id) => {
      const c = pkg.cast.find((x) => x.id === id)!;
      const w = c.wardrobe.find((x) => x.id === scene.characters.find((y) => y.characterId === id)!.wardrobeId)!;
      return [p.includes(c.identity.face) ? null : "PROMPT_MISSING_IDENTITY", p.includes(c.identity.hair) ? null : "PROMPT_MISSING_HAIR",
        p.includes(w.description) ? null : "PROMPT_MISSING_WARDROBE"].filter((x): x is string => !!x);
    });
  })),
  K("K19", "every prompt names the location and time of day", [], () => compiledShots(8, "wan-2.1").flatMap(({ pkg, scene, out }) => {
    const loc = pkg.locations.find((l) => l.id === scene.locationId)!;
    return [out.prompt.includes(loc.name) ? null : "PROMPT_MISSING_LOCATION", out.prompt.includes(scene.timeOfDay) ? null : "PROMPT_MISSING_TIME"].filter((x): x is string => !!x);
  })),
  K("K20", "screen direction reaches the prompt", [], () => compiledShots(9, "wan-2.1").flatMap(({ shot, out }) =>
    shot.screenDirection && !out.prompt.includes(`facing screen ${shot.screenDirection}`) ? ["PROMPT_MISSING_DIRECTION"] : [])),
];

// ── voice (recording judgement + engine routing) ──────────────────────

const sample = (o: Partial<VoiceSampleFacts>): VoiceSampleFacts => ({
  durationSec: 30, sampleRate: 48000, channels: 1, silenceRatio: 0.2, peakDbfs: -6, noiseFloorDbfs: -60, ...o,
});
const quality = (f: VoiceSampleFacts) => () => [`QUALITY_${judgeVoiceSample(f).quality.toUpperCase()}`];
const route = (needs: { cloning: boolean; language: string }, env: Record<string, string>) => () => {
  const r = routeVoice(needs, env);
  if (!r.engine) return ["NO_ENGINE"];
  return r.engine.gated ? ["GATED_ENGINE_CHOSEN"] : [`ENGINE_${r.engine.id.toUpperCase().replace(/-/g, "_")}`];
};

const voice: BenchCase[] = [
  V("V01", "a clean 30 s studio recording is good", ["QUALITY_GOOD"], quality(sample({}))),
  V("V02", "a 4 s recording is too short", ["QUALITY_POOR"], quality(sample({ durationSec: 4 }))),
  V("V03", "an 8 s recording is usable but short", ["QUALITY_FAIR"], quality(sample({ durationSec: 8 }))),
  V("V04", "telephone sample rate is refused", ["QUALITY_POOR"], quality(sample({ sampleRate: 8000 }))),
  V("V05", "22 kHz is fair", ["QUALITY_FAIR"], quality(sample({ sampleRate: 22050 }))),
  V("V06", "mostly silence is refused", ["QUALITY_POOR"], quality(sample({ silenceRatio: 0.7 }))),
  V("V07", "clipping is refused", ["QUALITY_POOR"], quality(sample({ peakDbfs: 0 }))),
  V("V08", "a noisy room is refused", ["QUALITY_POOR"], quality(sample({ noiseFloorDbfs: -35 }))),
  V("V09", "some background noise is fair", ["QUALITY_FAIR"], quality(sample({ noiseFloorDbfs: -45 }))),
  V("V10", "a cloned voice with only stock TTS available has no engine", ["NO_ENGINE"], route({ cloning: true, language: "en" }, { OPENAI_API_KEY: "k" })),
  V("V11", "a gated self-hosted engine is never chosen, even at top priority", ["ENGINE_OPENAI_TTS"],
    route({ cloning: false, language: "en" }, { VOICE_ENGINES: "qwen3-tts:100,openai-tts:50", OPENAI_API_KEY: "k", VOICE_GPU_URL: "http://gpu" })),
  V("V12", "cloning goes to the engine that can clone", ["ENGINE_FAL_MINIMAX"], route({ cloning: true, language: "fr" }, { FAL_KEY: "k", OPENAI_API_KEY: "k" })),
  V("V13", "nothing configured means no engine, not a silent default", ["NO_ENGINE"], route({ cloning: false, language: "en" }, {})),
];

export function benchCases(): BenchCase[] {
  return [...continuity, ...dialogue, ...cinematography, ...voice];
}
