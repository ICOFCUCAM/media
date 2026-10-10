/**
 * The benchmark corpus (DirectorOS Part 1 §50): ten complete films of ten
 * scenes — 100 scenes, 50 characters, 30 locations — generated
 * deterministically, every one a VALID Film Production Package that exercises
 * the canon the engines must keep: story days and times, a continuous scene
 * that carries an injury, a death, a reveal a later line relies on, a mystery
 * answered for the audience, a planted setup paid off, a relationship that
 * changes, props held through the film, and shot coverage with a reverse.
 *
 * Mutating one of these films is how the continuity, dialogue and
 * cinematography test cases are built (./cases.ts): a known-good film with one
 * known defect, so the expected finding is exact.
 */
import type { FilmPackage, FilmScene, FilmShot, ProductionConstraints } from "@cineforge/movie";

export const FILMS = 10;
export const SCENES_PER_FILM = 10;
export const CAST_PER_FILM = 5;
export const LOCATIONS_PER_FILM = 3;

const GENRES = ["thriller", "drama", "mystery", "science fiction", "western", "romance", "horror", "adventure", "war", "fantasy"];
const TONES = ["tense", "tender", "eerie", "wry", "elegiac", "hopeful", "bleak", "warm", "urgent", "dreamlike"];
const PALETTES = ["teal and sodium orange", "warm amber and deep blue", "desaturated greens", "neon magenta and cyan", "dusty ochre",
  "rose and cream", "cold steel grey", "sunlit gold", "olive and khaki", "violet and silver"];

/** 50 distinct first names, five per film. */
const NAMES = [
  "Maya", "Ewan", "Ines", "Tobias", "Ruth", "Kofi", "Lena", "Arjun", "Petra", "Silas",
  "Noor", "Callum", "Freya", "Dmitri", "Ada", "Jonah", "Yara", "Mateo", "Hilde", "Osei",
  "Clara", "Bram", "Amara", "Felix", "Wren", "Tariq", "Sigrid", "Marcus", "Lior", "Esme",
  "Hugo", "Zara", "Ilse", "Rafael", "Odile", "Kenji", "Bea", "Lorcan", "Priya", "Anselm",
  "Mira", "Gideon", "Saoirse", "Emil", "Nadia", "Teodor", "June", "Idris", "Vera", "Caspian",
];
const HAIR = ["short red hair", "grey, thinning", "long black braid", "shaved head", "curly auburn bob"];
const FACES = ["angular face, dark brown eyes", "weathered face, grey beard", "round face, freckles, green eyes", "high cheekbones, hazel eyes", "narrow face, pale blue eyes"];
const BODIES = ["lean, athletic", "broad, heavy-set", "small and wiry", "tall, long-limbed", "stocky, strong"];
const MARKS = [["scar above left eyebrow"], [], ["round wire glasses"], ["tattoo of a swallow on the neck"], []];
const ROLES = ["protagonist", "antagonist", "supporting", "supporting", "minor"] as const;

/** 30 distinct places, three per film. */
const PLACES: [string, "EXTERIOR" | "INTERIOR"][] = [
  ["The Harbour", "EXTERIOR"], ["The Signal Box", "INTERIOR"], ["The Fish Market", "EXTERIOR"],
  ["The Farmhouse Kitchen", "INTERIOR"], ["The Barley Field", "EXTERIOR"], ["The Chapel", "INTERIOR"],
  ["The Archive", "INTERIOR"], ["The Rooftop", "EXTERIOR"], ["The Night Tram", "INTERIOR"],
  ["The Orbital Lab", "INTERIOR"], ["The Ice Plain", "EXTERIOR"], ["The Airlock", "INTERIOR"],
  ["The Saloon", "INTERIOR"], ["The Canyon", "EXTERIOR"], ["The Rail Camp", "EXTERIOR"],
  ["The Ballroom", "INTERIOR"], ["The Rose Garden", "EXTERIOR"], ["The Station Café", "INTERIOR"],
  ["The Cellar", "INTERIOR"], ["The Pine Forest", "EXTERIOR"], ["The Attic", "INTERIOR"],
  ["The Jungle River", "EXTERIOR"], ["The Ruined Temple", "EXTERIOR"], ["The Market Square", "EXTERIOR"],
  ["The Trench", "EXTERIOR"], ["The Field Hospital", "INTERIOR"], ["The Bombed Church", "INTERIOR"],
  ["The Tower Library", "INTERIOR"], ["The Mirror Lake", "EXTERIOR"], ["The Throne Hall", "INTERIOR"],
];

/** Story time per scene: day and time of day only move forward; scene 7 continues scene 6. */
const DAYS = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3];
const TODS = ["dawn", "day", "dusk", "night", "dawn", "day", "dusk", "dusk", "day", "night"] as const;
const ACTS = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
/** Who besides the protagonist is in each scene (cast indexes). The minor (4) dies in scene 6. */
const PRESENT = [[1], [2], [1, 3], [2, 4], [3], [1, 2], [4, 3], [3], [1, 2], [1, 3]];

export const SCENE_SEC = 12;

export function corpusConstraints(): ProductionConstraints {
  return { sceneCount: SCENES_PER_FILM, sceneSec: SCENE_SEC, sceneTolerance: 0.15, maxShotsPerScene: 4, maxShotSec: 5, targetSeconds: SCENES_PER_FILM * SCENE_SEC, filmTolerance: 0.1 };
}

const slug = (s: string) => s.toLowerCase().replace(/^the /, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const sid = (i: number) => `scene_${String(i + 1).padStart(2, "0")}`;

function shot(index: number, durationSec: number, size: FilmShot["size"], subjects: string[], side: FilmShot["side"], dir: FilmShot["screenDirection"], action: string): FilmShot {
  return {
    index, durationSec, size, angle: "eye", movement: index === 0 ? "dolly" : "static", lens: index === 0 ? "24mm" : "50mm",
    subjectIds: subjects, action, emotion: "focused", lighting: null, transition: "cut", side, screenDirection: dir,
    rationale: "Geography first, then the exchange in a matched reverse.",
  };
}

/** Film `f` of the corpus (0..9). */
export function benchmarkFilm(f: number): FilmPackage {
  if (f < 0 || f >= FILMS) throw new Error(`no film ${f}`);
  const names = NAMES.slice(f * CAST_PER_FILM, (f + 1) * CAST_PER_FILM);
  const places = PLACES.slice(f * LOCATIONS_PER_FILM, (f + 1) * LOCATIONS_PER_FILM);
  const charId = (i: number) => `char_${names[i]!.toLowerCase()}`;
  const locId = (i: number) => `loc_${slug(places[i]![0])}`;
  const hero = charId(0);
  const cast: FilmPackage["cast"] = names.map((name, i) => ({
    id: charId(i), name, role: ROLES[i]!, age: 24 + ((f * 7 + i * 11) % 50), gender: i % 2 ? "male" : "female",
    identity: { face: FACES[i]!, hair: HAIR[i]!, body: BODIES[i]!, marks: [...MARKS[i]!] },
    wardrobe: [
      { id: `wardrobe_${name.toLowerCase()}_day`, description: `${["yellow raincoat", "dark oilskin", "blue work shirt", "black wool coat", "grey cardigan"][i]} over plain clothes` },
      { id: `wardrobe_${name.toLowerCase()}_night`, description: `${["red wool coat", "brown leather jacket", "green parka", "long navy greatcoat", "patched tweed jacket"][i]}` },
    ],
    personality: ["stubborn, dry humour", "controlled, patient", "warm, impulsive", "watchful, quiet", "anxious, kind"][i]!,
    voice: { description: ["low, quick", "deep, slow", "bright, fast", "soft, measured", "light, hesitant"][i]! },
    design: null,
    arc: i === 0 ? "from working alone to trusting others" : "is changed by the protagonist's choice",
    rationale: "Each character pushes the protagonist toward the final choice.",
  }));
  const locations: FilmPackage["locations"] = places.map(([name, kind], i) => ({
    id: locId(i), name, kind, description: `${name.toLowerCase()}, worn and specific`, architecture: "period detail, practical materials",
    era: "present day", lighting: i === 0 ? "hard practical light" : "soft window light", rationale: "Each place changes what the characters can hide.",
  }));
  const keepsake = `prop_keepsake_${f}`;
  const letter = `prop_letter_${f}`;
  const props: FilmPackage["props"] = [
    { id: keepsake, name: "Brass keepsake", description: "a small brass locket, dented", ownerId: hero },
    { id: letter, name: "Sealed letter", description: "a cream envelope sealed with green wax", ownerId: charId(1) },
  ];
  const facts: FilmPackage["facts"] = [
    { id: "fact_debt", statement: `${names[0]} owes ${names[1]} a debt`, knownAtStart: [hero, charId(1), "audience"] },
    { id: "fact_letter", statement: "the letter names the heir", knownAtStart: [charId(1)] },
    { id: "fact_culprit", statement: `${names[3]} started the fire`, knownAtStart: [charId(3)] },
  ];
  const relationships: FilmPackage["relationships"] = [
    { id: "rel_rivals", a: hero, b: charId(1), initial: "bitter rivals" },
    { id: "rel_friends", a: hero, b: charId(2), initial: "old friends" },
  ];

  const scenes: FilmScene[] = PRESENT.map((others, i) => {
    const day = DAYS[i]!;
    const night = TODS[i] === "night" || TODS[i] === "dusk";
    const present = [0, ...others];
    const loc = i === 7 ? 0 : i % LOCATIONS_PER_FILM; // scene 8 continues scene 7 in the same place
    const other = charId(others[0]!);
    const physical = (c: number) => (c === 0 && (i === 6 || i === 7) ? "cut on the left hand" : c === 0 && i >= 8 ? "bandaged left hand" : null);
    const sceneChars = present.map((c) => ({
      characterId: charId(c),
      wardrobeId: `wardrobe_${names[c]!.toLowerCase()}_${night ? "night" : "day"}`,
      emotion: c === 0 ? "determined" : "guarded",
      physical: physical(c),
      holding: c === 0 ? [keepsake] : c === 1 ? [letter] : [],
    }));
    const dialogue: FilmScene["dialogue"] = [
      { characterId: hero, line: i === 5 ? "The letter names the heir. I read it." : `We finish this tonight, ${names[others[0]!]}.`, emotion: "firm", references: i === 5 ? ["fact_letter"] : [] },
      { characterId: other, line: i === 0 ? "You still owe me." : "Then stop hiding.", emotion: "cold", references: i === 0 && others[0] === 1 ? ["fact_debt"] : [] },
    ];
    const reveals: FilmScene["reveals"] = [];
    if (i === 3) reveals.push({ factId: "fact_letter", to: [hero, "audience"] });
    if (i === 8) reveals.push({ factId: "fact_culprit", to: [hero, "audience"] });
    return {
      id: sid(i), index: i, act: ACTS[i]!,
      heading: `${places[loc]![1] === "EXTERIOR" ? "EXT." : "INT."} ${places[loc]![0].toUpperCase()} - ${TODS[i]!.toUpperCase()}`,
      locationId: locId(loc), timeOfDay: TODS[i]!,
      storyTime: { day, continuous: i === 7, flashback: false },
      reveals,
      relationshipChanges: i === 5 ? [{ relationshipId: "rel_rivals", becomes: "uneasy allies" }] : [],
      goalChanges: [],
      devices: [],
      deaths: i === 6 ? [charId(4)] : [],
      purpose: `beat ${i + 1} of the ${GENRES[f]} plot`,
      summary: `${names[0]} confronts ${names[others[0]!]} in ${places[loc]![0]}.`,
      emotionalArc: { start: "wary", middle: "pressed", end: "resolved" },
      beats: [`${names[0]} arrives`, "the exchange turns"],
      characters: sceneChars,
      dialogue,
      narration: null,
      bridge: { whatJustHappened: "the last choice", whatChanged: "the stakes rose", whatCarriesForward: "the keepsake, the debt" },
      audio: { music: i % 3 ? null : "low strings", ambience: "room tone and weather", sfx: ["footsteps"] },
      shots: [
        shot(0, 4, "WS", [locId(loc)], "neutral", null, `${names[0]} enters ${places[loc]![0]}.`),
        shot(1, 4, "MS", [hero], "A", "right", `${names[0]} faces ${names[others[0]!]}.`),
        shot(2, 4, "CU", [other], "A", "left", `${names[others[0]!]} answers.`),
      ],
      rationale: "Each scene ends on a decision.",
    };
  });

  return {
    irVersion: 1,
    film: {
      title: `Benchmark ${f + 1}: ${places[0]![0]}`,
      logline: `${names[0]} must settle a debt before the truth about the fire comes out.`,
      synopsis: `${names[0]} carries a keepsake through three days of reckoning with ${names[1]}.`,
      genre: GENRES[f]!, tone: TONES[f]!, themes: ["debt", "trust"],
      visualStyle: { palette: PALETTES[f]!, lighting: "motivated practicals", lensLanguage: "wide to close, matched reverses", texture: "35mm grain" },
      audioStyle: { score: "sparse strings", ambience: "weather and rooms" },
      rationale: "A contained cast keeps every canon rule in play.",
    },
    cast, locations, props, facts, relationships, goals: [],
    acts: [1, 2, 3].map((a) => ({ index: a, purpose: ["setup", "confrontation", "resolution"][a - 1]!, sceneIds: scenes.filter((s) => s.act === a).map((s) => s.id) })),
    threads: [
      { id: "thread_debt", kind: "plot", description: "the debt is settled", sceneIds: scenes.map((s) => s.id), answerFactId: null },
      { id: "thread_fire", kind: "mystery", description: "who started the fire", sceneIds: [sid(2), sid(6), sid(8)], answerFactId: "fact_culprit" },
    ],
    setups: [{ id: "setup_debt", description: "the debt is named", plantedIn: sid(0), developedIn: [sid(4)], paidOffIn: sid(9), factId: "fact_debt" }],
    scenes,
  };
}

export function benchmarkCorpus(): FilmPackage[] {
  return Array.from({ length: FILMS }, (_, f) => benchmarkFilm(f));
}

export function corpusCounts(films: FilmPackage[]): { films: number; scenes: number; characters: number; locations: number; shots: number } {
  return {
    films: films.length,
    scenes: films.reduce((n, p) => n + p.scenes.length, 0),
    characters: new Set(films.flatMap((p) => p.cast.map((c) => `${p.film.title}/${c.id}`))).size,
    locations: new Set(films.flatMap((p) => p.locations.map((l) => `${p.film.title}/${l.id}`))).size,
    shots: films.reduce((n, p) => n + p.scenes.reduce((m, s) => m + s.shots.length, 0), 0),
  };
}
