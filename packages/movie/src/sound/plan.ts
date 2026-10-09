/**
 * The sound plan (DirectorOS Part 1 §18; W16): what each scene should sound
 * like, turned into generation requests. Audio is planned at the scene and
 * shot level, not added at the end:
 *
 *   ambience   the scene's room tone / soundscape from its planned ambience,
 *              the place and the hour, in the film's ambience style — one bed
 *              per scene, looped under the whole scene
 *   sfx        each planned sound effect, anchored to the shot whose action
 *              it belongs to (the shot that shares the most sound words with
 *              it), a beat after that shot starts; cues that match no shot are
 *              spread evenly through the scene and marked as such
 *
 * Prompts never ask for music or voices: those are their own stems.
 */
import type { FilmPackage } from "../ir/schema";
import { soundWords } from "../cinema/audio";

export interface AmbienceRequest {
  prompt: string;
  /** Seconds to generate; the bed loops under the scene. */
  seconds: number;
}

export interface SfxRequest {
  cue: string;
  prompt: string;
  seconds: number;
  /** Planned start within the scene (seconds). */
  atSec: number;
  shotIndex: number | null;
  anchor: "shot_action" | "spread";
}

export interface SceneSoundPlan {
  sceneId: string;
  /** The scene's planned length (Σ shot durations), the frame the cue times refer to. */
  plannedSec: number;
  ambience: AmbienceRequest | null;
  sfx: SfxRequest[];
}

export interface SoundPlanOptions {
  /** Most effects generated per scene (the rest are dropped, in planned order). */
  maxSfxPerScene?: number;
  /** Longest ambience bed generated (it loops). */
  maxAmbienceSec?: number;
  sfxSec?: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const INTERIOR = new Set(["ROOM", "INTERIOR", "BUILDING"]);

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

export function sceneSoundPlan(pkg: FilmPackage, sceneIndex: number, opts: SoundPlanOptions = {}): SceneSoundPlan | null {
  const sc = pkg.scenes[sceneIndex];
  if (!sc) return null;
  const maxSfx = opts.maxSfxPerScene ?? 4;
  const maxAmb = opts.maxAmbienceSec ?? 30;
  const sfxSec = opts.sfxSec ?? 3;
  const plannedSec = sc.shots.reduce((a, s) => a + s.durationSec, 0);
  const loc = pkg.locations.find((l) => l.id === sc.locationId);
  const place = loc ? `${loc.name}, ${INTERIOR.has(loc.kind) ? "interior" : "exterior"}` : "";

  const ambienceText = sc.audio.ambience.trim();
  const ambience: AmbienceRequest | null = ambienceText
    ? {
        prompt: clip(
          [`Ambient soundscape, no music, no voices, no speech: ${ambienceText}`, place, sc.timeOfDay, pkg.film.audioStyle.ambience, "continuous, even, loopable"]
            .filter(Boolean).join(". "),
          400,
        ),
        seconds: Math.max(5, Math.min(maxAmb, Math.round(plannedSec) || 10)),
      }
    : null;

  // Shot start times within the scene.
  const starts: number[] = [];
  sc.shots.reduce((t, s) => { starts.push(t); return t + s.durationSec; }, 0);
  const shotWords = sc.shots.map((s) => soundWords(`${s.action} ${s.emotion ?? ""}`));

  const cues = sc.audio.sfx.map((c) => c.trim()).filter(Boolean).slice(0, maxSfx);
  const sfx: SfxRequest[] = cues.map((cue, i) => {
    const words = soundWords(cue);
    let best = -1;
    let bestScore = 0;
    shotWords.forEach((w, j) => {
      const score = overlap(words, w);
      if (score > bestScore) { best = j; bestScore = score; }
    });
    const base = { cue, prompt: clip(`Sound effect, isolated, no music, no voices: ${cue}${place ? `. ${place}` : ""}`, 300), seconds: sfxSec };
    if (best >= 0) {
      const shot = sc.shots[best]!;
      return { ...base, atSec: round(starts[best]! + Math.min(0.4, shot.durationSec / 4)), shotIndex: shot.index, anchor: "shot_action" as const };
    }
    return { ...base, atSec: round((plannedSec * (i + 1)) / (cues.length + 1)), shotIndex: null, anchor: "spread" as const };
  });

  return { sceneId: sc.id, plannedSec, ambience, sfx };
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Where a planned cue lands in the scene as rendered: scaled by the scene's
 * real length against its planned length, and never past its end.
 */
export function placeCue(atSec: number, plannedSec: number, actualSec: number, cueSec = 0): number {
  if (plannedSec <= 0 || actualSec <= 0) return 0;
  const t = (atSec * actualSec) / plannedSec;
  return round(Math.max(0, Math.min(t, actualSec - Math.min(cueSec, actualSec) )));
}
