/**
 * Deterministic stand-in Film Production Package — LOCAL RUNS AND TESTS ONLY,
 * behind DIRECTOR_ALLOW_STUB=1 (a reviewed substitute switch, docs/44). It is
 * valid Film IR so the whole pipeline can run without a planning model; it is
 * never used in production (no stand-in films, DOS-74).
 */
import type { FilmPackage, ProductionConstraints } from "@cineforge/movie";

export function stubPackage(brief: string, c: ProductionConstraints): FilmPackage {
  const ids = Array.from({ length: c.sceneCount }, (_, i) => `scene_${String(i + 1).padStart(2, "0")}`);
  const shotsPerScene = Math.min(c.maxShotsPerScene, Math.max(1, Math.ceil(c.sceneSec / c.maxShotSec)));
  const durations = (() => {
    const base = Math.max(2, Math.min(c.maxShotSec, Math.floor(c.sceneSec / shotsPerScene)));
    const d = Array.from({ length: shotsPerScene }, () => base);
    for (let i = 0, left = c.sceneSec - base * shotsPerScene; left > 0 && i < d.length; i++) {
      const add = Math.min(left, c.maxShotSec - d[i]!);
      d[i]! += add;
      left -= add;
    }
    return d;
  })();
  const title = brief.trim().slice(0, 60) || "Untitled";
  return {
    irVersion: 1,
    film: {
      title, logline: `A story from: ${title}`, synopsis: `Stand-in plan for local runs: ${title}`, genre: "drama", tone: "cinematic",
      themes: ["stand-in"],
      visualStyle: { palette: "neutral", lighting: "soft daylight", lensLanguage: "classic coverage", texture: "clean digital" },
      audioStyle: { score: "ambient", ambience: "room tone" },
      rationale: "Local stand-in (DIRECTOR_ALLOW_STUB=1).",
    },
    cast: [{
      id: "char_lead", name: "Lead", role: "protagonist", age: null, gender: null,
      identity: { face: "neutral features", hair: "short dark hair", body: "average build", marks: [] },
      wardrobe: [{ id: "wardrobe_default", description: "plain dark clothes" }],
      personality: "determined", voice: { description: "even, calm" }, arc: "stand-in arc", rationale: "Local stand-in.",
    }],
    locations: [{ id: "loc_set", name: "The Set", kind: "INTERIOR", description: "a plain room", architecture: "simple", era: "present day", lighting: "soft", rationale: "Local stand-in." }],
    props: [],
    acts: [{ index: 1, purpose: "stand-in", sceneIds: ids }],
    threads: [],
    setups: [],
    scenes: ids.map((id, i) => ({
      id, index: i, act: 1, heading: "INT. THE SET - DAY", locationId: "loc_set", timeOfDay: "day" as const,
      purpose: `beat ${i + 1}`, summary: `Beat ${i + 1} of: ${title}`,
      emotionalArc: { start: "calm", middle: "calm", end: "calm" }, beats: [`beat ${i + 1}`],
      characters: [{ characterId: "char_lead", wardrobeId: "wardrobe_default", emotion: "calm", physical: null, holding: [] }],
      dialogue: [], narration: null,
      bridge: { whatJustHappened: "—", whatChanged: "—", whatCarriesForward: "—" },
      audio: { music: null, ambience: "room tone", sfx: [] },
      shots: durations.map((d, j) => ({
        index: j, durationSec: d, size: "MS" as const, angle: "eye" as const, movement: "static" as const, lens: null,
        subjectIds: ["char_lead"], action: "The lead stands in the room.", emotion: null, lighting: null,
        transition: "cut" as const, rationale: "Local stand-in.",
      })),
      rationale: "Local stand-in.",
    })),
  };
}
