/**
 * Plain-text shot description from canon (the pre-W4 prompt). Kept as the
 * model-independent description inside the Continuity Engine's corrected
 * context; generation prompts come from the model compilers (prompt/).
 */
import type { FilmCharacter, FilmPackage, FilmScene, FilmShot } from "../ir/schema";

const SIZE: Record<FilmShot["size"], string> = {
  EWS: "extreme wide shot",
  WS: "wide shot",
  MS: "medium shot",
  MCU: "medium close-up",
  CU: "close-up",
  ECU: "extreme close-up",
  INSERT: "insert shot",
};

export const NEGATIVE_PROMPT = "blurry, watermark, text, captions, extra limbs, deformed hands, duplicate faces";
const PROMPT_MAX = 1500;

export function appearanceOf(c: FilmCharacter): string {
  const marks = c.identity.marks.length ? `; marks: ${c.identity.marks.join(", ")}` : "";
  return `${c.identity.face}; ${c.identity.hair}; ${c.identity.body}${marks}`;
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function subjectLine(pkg: FilmPackage, scene: FilmScene, key: string): string | null {
  const ch = pkg.cast.find((c) => c.id === key);
  if (ch) {
    const st = scene.characters.find((s) => s.characterId === key);
    const wardrobe = ch.wardrobe.find((w) => w.id === st?.wardrobeId)?.description;
    const parts = [appearanceOf(ch), wardrobe ? `wearing ${wardrobe}` : null, st?.physical ?? null].filter(Boolean);
    return `${ch.name} (${parts.join("; ")})`;
  }
  const prop = pkg.props.find((p) => p.id === key);
  if (prop) return `${prop.name} (${prop.description})`;
  return null;
}

/** Shot prompt from canon: framing, action, who (canonical look + scene wardrobe), where, light, style. */
export function shotPrompt(pkg: FilmPackage, scene: FilmScene, shot: FilmShot): string {
  const loc = pkg.locations.find((l) => l.id === scene.locationId)!;
  const framing = [SIZE[shot.size], `${shot.angle} angle`, shot.movement === "static" ? "locked-off camera" : `${shot.movement} camera`,
    shot.lens ? `${shot.lens} lens` : null].filter(Boolean).join(", ");
  const subjects = shot.subjectIds.map((k) => subjectLine(pkg, scene, k)).filter((s): s is string => !!s);
  const parts = [
    `Cinematic film still, ${framing}.`,
    shot.action,
    subjects.length ? `Featuring ${subjects.join("; ")}.` : null,
    `Setting: ${loc.name}, ${loc.description}, ${loc.architecture}, ${loc.era}; ${scene.timeOfDay}${scene.weather ? `, ${scene.weather}` : ""}${scene.storyTime?.clock ? ` (${scene.storyTime.clock})` : ""}.`,
    `Light: ${shot.lighting ?? loc.lighting}.`,
    shot.emotion ? `Mood: ${shot.emotion}.` : null,
    shot.composition ? `Composition: ${shot.composition}.` : null,
    `Look: ${pkg.film.visualStyle.palette}; ${pkg.film.visualStyle.texture}.`,
  ].filter(Boolean);
  return clip(parts.join(" "), PROMPT_MAX);
}

