/**
 * Audio continuity on the plan (DirectorOS Part 1 §32.6; W14): voice, room,
 * ambience, music, sound. Advisories — recorded and shown, never failing
 * (sound design is a craft judgement, and a deliberate change is allowed):
 *
 *   AMBIENCE_BREAK   a scene that continues the previous one in the same place
 *                    with no time cut, whose ambience shares no sound with it
 *                    (the room would audibly change mid-moment)
 *   MUSIC_BREAK      the same continuous moment switching to an unrelated cue
 *   ROOM_TONE_DRIFT  a place returned to at the same time of day whose
 *                    ambience shares nothing with how it sounded before
 *
 * Voice continuity is structural in the plan — one voice per character — and
 * is checked on what was actually spoken (the worker's voice continuity check
 * over the scene voice tracks).
 */
import type { FilmPackage } from "../ir/schema";

export interface AudioAdvisory {
  code: "AMBIENCE_BREAK" | "MUSIC_BREAK" | "ROOM_TONE_DRIFT";
  sceneId: string;
  /** The scene it is compared with. */
  againstSceneId: string;
  message: string;
}

const STOP = new Set(["the", "and", "with", "from", "into", "onto", "over", "under", "low", "soft", "distant", "faint", "quiet", "light", "heavy", "some", "occasional", "sound", "sounds", "noise"]);

/** The sounds a description names: content words, crudely singularised. */
export function soundWords(text: string | null | undefined): Set<string> {
  return new Set(
    (text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)),
  );
}

const shares = (a: string | null | undefined, b: string | null | undefined) => {
  const x = soundWords(a);
  const y = soundWords(b);
  if (!x.size || !y.size) return true; // nothing to compare: not judged
  for (const w of x) if (y.has(w)) return true;
  return false;
};

export function audioAdvisories(pkg: FilmPackage): AudioAdvisory[] {
  const out: AudioAdvisory[] = [];
  pkg.scenes.forEach((sc, i) => {
    const prev = pkg.scenes[i - 1];
    const continuous = !!prev && !!sc.storyTime?.continuous && prev.locationId === sc.locationId;
    if (continuous) {
      if (!shares(prev.audio.ambience, sc.audio.ambience)) {
        out.push({ code: "AMBIENCE_BREAK", sceneId: sc.id, againstSceneId: prev.id,
          message: `${sc.id} continues ${prev.id} in the same place with no time cut, but its ambience changes from "${prev.audio.ambience}" to "${sc.audio.ambience}"` });
      }
      if (prev.audio.music && sc.audio.music && !shares(prev.audio.music, sc.audio.music)) {
        out.push({ code: "MUSIC_BREAK", sceneId: sc.id, againstSceneId: prev.id,
          message: `${sc.id} continues ${prev.id} with no time cut, but the music switches from "${prev.audio.music}" to "${sc.audio.music}"` });
      }
      return;
    }
    if (sc.storyTime?.flashback) return; // a flashback may sound like another time
    const before = pkg.scenes.slice(0, i).reverse().find((s) => s.locationId === sc.locationId && s.timeOfDay === sc.timeOfDay && !s.storyTime?.flashback);
    if (before && !shares(before.audio.ambience, sc.audio.ambience)) {
      out.push({ code: "ROOM_TONE_DRIFT", sceneId: sc.id, againstSceneId: before.id,
        message: `${sc.id} returns to the place of ${before.id} at the same time of day, but it sounded like "${before.audio.ambience}" and now "${sc.audio.ambience}"` });
    }
  });
  return out;
}
