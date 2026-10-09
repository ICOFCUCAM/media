/** Small, valid Film Production Packages — shared by tests here and in the worker (not used at runtime). */
import type { FilmPackage } from "./schema";

const shot = (index: number, durationSec: number, subject: string) => ({
  index,
  durationSec,
  size: (["WS", "MS", "CU", "MCU"] as const)[index % 4]!,
  angle: "eye" as const,
  movement: "static" as const,
  lens: "35mm",
  subjectIds: [subject],
  action: `Maya moves through the harbour (${index}).`,
  emotion: "tense",
  lighting: "sodium streetlight through rain",
  transition: "cut" as const,
  side: "A" as "A" | "B" | "neutral" | null,
  screenDirection: (index % 2 ? "left" : "right") as "left" | "right" | null,
  rationale: "Coverage builds from geography to emotion.",
});

export function fixturePackage(): FilmPackage {
  return {
    irVersion: 1,
    film: {
      title: "Harbour Run",
      logline: "A courier must cross a storm-lashed harbour before the tide takes the only bridge.",
      synopsis: "Maya carries a sealed key across the harbour while the storm rises.",
      genre: "thriller",
      tone: "tense, intimate",
      themes: ["duty", "trust"],
      visualStyle: { palette: "teal and sodium orange", lighting: "practical, wet", lensLanguage: "close, handheld in action", texture: "35mm grain" },
      audioStyle: { score: "pulsing low strings", ambience: "rain, wind, distant foghorns" },
      rationale: "Rain and sodium light make the harbour feel hostile and intimate.",
    },
    cast: [
      {
        id: "char_maya",
        name: "Maya",
        role: "protagonist",
        age: 29,
        gender: "female",
        identity: { face: "angular face, dark brown eyes", hair: "short red hair", body: "lean, athletic", marks: ["scar above left eyebrow"] },
        wardrobe: [
          { id: "wardrobe_raincoat", description: "yellow raincoat over black jumper" },
          { id: "wardrobe_soaked", description: "raincoat torn at the sleeve, soaked" },
        ],
        personality: "stubborn, dry humour",
        voice: { description: "low, quick, slight Glasgow accent" },
        design: null,
        arc: "from working alone to trusting the harbourmaster",
        rationale: "A stubborn loner makes the final act of trust land.",
      },
      {
        id: "char_harbourmaster",
        name: "Ewan",
        role: "supporting",
        age: 61,
        gender: "male",
        identity: { face: "weathered, grey beard", hair: "grey, thinning", body: "broad", marks: [] },
        wardrobe: [{ id: "wardrobe_oilskin", description: "dark green oilskin" }],
        personality: "gruff, protective",
        voice: { description: "deep, slow" },
        design: null,
        arc: "lets go of control",
        rationale: "He mirrors Maya's stubbornness.",
      },
    ],
    locations: [
      { id: "loc_harbour", name: "The Harbour", kind: "EXTERIOR", description: "stone quays, cranes, a swing bridge", architecture: "Victorian stone and iron", era: "present day", lighting: "sodium lamps, storm light", rationale: "The bridge is the clock." },
    ],
    props: [{ id: "prop_key", name: "Sealed key", description: "brass key in a wax-sealed pouch", ownerId: "char_maya" }],
    relationships: [{ id: "rel_maya_ewan", a: "char_maya", b: "char_harbourmaster", initial: "wary strangers" }],
    facts: [
      { id: "fact_bridge_swings", statement: "the swing bridge opens at high tide", knownAtStart: ["char_harbourmaster"] },
      { id: "fact_key_opens_vault", statement: "the key opens the harbour vault", knownAtStart: ["char_maya", "audience"] },
    ],
    acts: [
      { index: 1, purpose: "set the stakes", sceneIds: ["scene_01"] },
      { index: 2, purpose: "the crossing", sceneIds: ["scene_02"] },
    ],
    threads: [{ id: "thread_delivery", kind: "plot", description: "the key must arrive", sceneIds: ["scene_01", "scene_02"], answerFactId: null }],
    setups: [{
      id: "setup_bridge", description: "the bridge swings at high tide", plantedIn: "scene_01", developedIn: [], paidOffIn: "scene_02",
      factId: "fact_bridge_swings",
    }],
    scenes: [0, 1].map((i) => ({
      id: `scene_0${i + 1}`,
      index: i,
      act: i + 1,
      heading: "EXT. THE HARBOUR - NIGHT",
      locationId: "loc_harbour",
      timeOfDay: "night" as const,
      storyTime: { day: 1, continuous: false, flashback: false },
      // Ewan tells Maya (and the audience) about the bridge in scene one.
      reveals: i ? [] : [{ factId: "fact_bridge_swings", to: ["char_maya", "audience"] }],
      relationshipChanges: i ? [{ relationshipId: "rel_maya_ewan", becomes: "trust" }] : [],
      deaths: [],
      purpose: i ? "Maya crosses as the bridge swings" : "Maya receives the key and the deadline",
      summary: "Rain sheets across the quay as Maya runs.",
      emotionalArc: { start: "wary", middle: "afraid", end: "resolved" },
      beats: ["Maya arrives", "the bridge horn sounds"],
      characters: [
        { characterId: "char_maya", wardrobeId: i ? "wardrobe_soaked" : "wardrobe_raincoat", emotion: "tense", physical: i ? "soaked" : null, holding: ["prop_key"] },
        { characterId: "char_harbourmaster", wardrobeId: "wardrobe_oilskin", emotion: "worried", physical: null, holding: [] },
      ],
      dialogue: [{ characterId: "char_harbourmaster", line: "Tide turns in ten minutes.", emotion: "urgent", references: ["fact_bridge_swings"] }],
      narration: null,
      bridge: { whatJustHappened: "Maya took the key", whatChanged: "the storm rose", whatCarriesForward: "the key, the deadline" },
      audio: { music: "low strings", ambience: "rain on stone", sfx: ["foghorn"] },
      shots: [shot(0, 5, "loc_harbour"), shot(1, 5, "char_maya"), shot(2, 4, "char_maya"), shot(3, 4, "prop_key")],
      rationale: "Each scene ends on the clock.",
    })),
  };
}

export const FIXTURE_CONSTRAINTS = {
  sceneCount: 2,
  sceneSec: 18,
  sceneTolerance: 0.15,
  maxShotsPerScene: 4,
  maxShotSec: 5,
  targetSeconds: 36,
  filmTolerance: 0.15,
};

/**
 * Part 2 §62.8: Maya wears a red coat in scenes 10 and 11; scene 12 picks up
 * scene 11's action with no time cut; scene 10 is the day before.
 */
export function mayaCoatFixture(): FilmPackage {
  const base = fixturePackage();
  const maya = base.cast[0]!;
  maya.wardrobe.push({ id: "wardrobe_red_coat", description: "long red wool coat" });
  const template = base.scenes[0]!;
  const ids = ["scene_10", "scene_11", "scene_12"];
  base.scenes = ids.map((id, i) => ({
    ...structuredClone(template),
    id,
    index: i,
    act: i === 0 ? 1 : 2,
    timeOfDay: "night" as const,
    storyTime: { day: i === 0 ? 1 : 2, continuous: i === 2, flashback: false },
    reveals: i === 0 ? [{ factId: "fact_bridge_swings", to: ["char_maya", "audience"] }] : [],
    characters: [
      { characterId: "char_maya", wardrobeId: "wardrobe_red_coat", emotion: "tense", physical: null, holding: ["prop_key"] },
      { characterId: "char_harbourmaster", wardrobeId: "wardrobe_oilskin", emotion: "worried", physical: null, holding: [] },
    ],
    shots: template.shots.map((s, j) => ({ ...s, subjectIds: [["loc_harbour"], ["char_maya"], ["char_harbourmaster"], ["prop_key"]][j]! })),
  }));
  base.acts = [
    { index: 1, purpose: "set the stakes", sceneIds: ["scene_10"] },
    { index: 2, purpose: "the crossing", sceneIds: ["scene_11", "scene_12"] },
  ];
  base.threads = [{ id: "thread_delivery", kind: "plot", description: "the key must arrive", sceneIds: ids, answerFactId: null }];
  base.setups = [{ id: "setup_bridge", description: "the bridge", plantedIn: "scene_10", developedIn: ["scene_11"], paidOffIn: "scene_12", factId: "fact_bridge_swings" }];
  return base;
}
