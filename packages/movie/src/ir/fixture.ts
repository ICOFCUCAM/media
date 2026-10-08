/** A small, valid Film Production Package — shared by tests (not used at runtime). */
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
        arc: "lets go of control",
        rationale: "He mirrors Maya's stubbornness.",
      },
    ],
    locations: [
      { id: "loc_harbour", name: "The Harbour", kind: "EXTERIOR", description: "stone quays, cranes, a swing bridge", architecture: "Victorian stone and iron", era: "present day", lighting: "sodium lamps, storm light", rationale: "The bridge is the clock." },
    ],
    props: [{ id: "prop_key", name: "Sealed key", description: "brass key in a wax-sealed pouch", ownerId: "char_maya" }],
    acts: [
      { index: 1, purpose: "set the stakes", sceneIds: ["scene_01"] },
      { index: 2, purpose: "the crossing", sceneIds: ["scene_02"] },
    ],
    threads: [{ id: "thread_delivery", kind: "plot", description: "the key must arrive", sceneIds: ["scene_01", "scene_02"] }],
    setups: [{ id: "setup_bridge", description: "the bridge swings at high tide", plantedIn: "scene_01", paidOffIn: "scene_02" }],
    scenes: [0, 1].map((i) => ({
      id: `scene_0${i + 1}`,
      index: i,
      act: i + 1,
      heading: "EXT. THE HARBOUR - NIGHT",
      locationId: "loc_harbour",
      timeOfDay: "night" as const,
      purpose: i ? "Maya crosses as the bridge swings" : "Maya receives the key and the deadline",
      summary: "Rain sheets across the quay as Maya runs.",
      emotionalArc: { start: "wary", middle: "afraid", end: "resolved" },
      beats: ["Maya arrives", "the bridge horn sounds"],
      characters: [
        { characterId: "char_maya", wardrobeId: i ? "wardrobe_soaked" : "wardrobe_raincoat", emotion: "tense", physical: i ? "soaked" : null, holding: ["prop_key"] },
        { characterId: "char_harbourmaster", wardrobeId: "wardrobe_oilskin", emotion: "worried", physical: null, holding: [] },
      ],
      dialogue: [{ characterId: "char_harbourmaster", line: "Tide turns in ten minutes.", emotion: "urgent" }],
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
