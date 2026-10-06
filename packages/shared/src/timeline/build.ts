/**
 * Build a draft production timeline on the Master Production Clock from a
 * project's current structure (docs/38 §AU.5, §AW.13). Pure: the caller loads
 * rows and persists the draft (production_timelines / timeline_events /
 * audio_events, migrations 0028–0029).
 *
 * Mapping from today's tables (whose timing columns were never used):
 *   scenes (by index)          → 'scene' events, back to back
 *   shots (by index)           → 'shot' events inside their scene, durations
 *                                snapped to whole frames (min. one frame)
 *   dialogue_lines.start_ms    → 'dialogue' events, relative to the scene
 *                                start, sample-accurate; duration measured
 *                                (audioDurationMs) or estimated (§AU.5);
 *                                anchored to the shot they start in
 *   audio_tracks.start_ms /    → audio placements (stem from kind, gain),
 *   duration_ms / gain_db        relative to the scene start
 *
 * Nothing is clipped to fit: an audio item that runs past its scene is kept
 * whole and reported in `warnings` — the A/V sync engine decides (§AV.5).
 */
import { MasterClock } from "../clock/master-clock";
import { msToUs, secondsToUs, type Us } from "../clock/time";
import { estimateSpeechUs } from "./speech";

export type TimelineEventKind =
  | "scene" | "shot" | "dialogue" | "word" | "narration" | "music_cue" | "sfx"
  | "ambience" | "subtitle" | "transition" | "title" | "vfx" | "action";

export type AudioStem = "dialogue" | "narration" | "music" | "sfx" | "ambience";

export interface DraftEvent {
  key: string;
  kind: TimelineEventKind;
  startUs: Us;
  endUs: Us;
  refType?: string;
  refId?: string;
  parentKey?: string;
  anchor?: { key: string; offsetUs: Us; mode: "start" | "end" | "action" | "cut" };
  payload?: Record<string, unknown>;
}

export interface DraftAudio {
  key: string;
  stem: AudioStem;
  startUs: Us;
  endUs: Us;
  gainDb: number;
  fadeInUs: Us;
  fadeOutUs: Us;
  refType: string;
  refId: string;
  eventKey?: string;
}

export interface TimelineDraft {
  clock: MasterClock;
  durationUs: Us;
  events: DraftEvent[];
  audio: DraftAudio[];
  warnings: string[];
}

export interface SourceShot { id: string; index: number; durationSec: number }
export interface SourceDialogue { id: string; index: number; text: string; emotion?: string | null; startMs?: number | null; characterId?: string | null; audioDurationMs?: number | null }
export interface SourceAudioTrack { id: string; kind: "VOICE" | "MUSIC" | "SFX" | "AMBIENCE"; startMs: number; durationMs?: number | null; gainDb: number }
export interface SourceScene {
  id: string;
  index: number;
  shots: SourceShot[];
  dialogue?: SourceDialogue[];
  audioTracks?: SourceAudioTrack[];
}

const STEM: Record<SourceAudioTrack["kind"], AudioStem> = { VOICE: "dialogue", MUSIC: "music", SFX: "sfx", AMBIENCE: "ambience" };

export function buildTimelineDraft(input: { scenes: SourceScene[]; clock: MasterClock; language?: string }): TimelineDraft {
  const { clock } = input;
  const events: DraftEvent[] = [];
  const audio: DraftAudio[] = [];
  const warnings: string[] = [];
  let cursor = 0n;

  for (const scene of [...input.scenes].sort((a, b) => a.index - b.index)) {
    const sceneKey = `scene:${scene.id}`;
    const sceneStart = cursor;
    const shotSpans: Array<{ key: string; startUs: Us; endUs: Us }> = [];

    for (const shot of [...scene.shots].sort((a, b) => a.index - b.index)) {
      // Whole frames, never zero: a shot always occupies at least one frame.
      let dur = clock.shotDurationUs(Math.max(0, shot.durationSec));
      if (dur === 0n) dur = clock.frameStart(1);
      const startUs = cursor;
      const endUs = clock.frameStart(clock.frameAt(startUs) + clock.frameAt(dur));
      const key = `shot:${shot.id}`;
      events.push({ key, kind: "shot", startUs, endUs, refType: "shot", refId: shot.id, parentKey: sceneKey, payload: { index: shot.index, requestedSec: shot.durationSec } });
      shotSpans.push({ key, startUs, endUs });
      cursor = endUs;
    }
    const sceneEnd = cursor;
    events.push({ key: sceneKey, kind: "scene", startUs: sceneStart, endUs: sceneEnd, refType: "scene", refId: scene.id, payload: { index: scene.index } });

    let dialogueCursor = sceneStart;
    for (const line of [...(scene.dialogue ?? [])].sort((a, b) => a.index - b.index)) {
      const measured = line.audioDurationMs != null && line.audioDurationMs > 0;
      const dur = measured ? msToUs(Math.round(line.audioDurationMs!)) : estimateSpeechUs(line.text, { language: input.language, emotion: line.emotion });
      if (dur === 0n) continue;
      // Explicit start (relative to the scene) or right after the previous line.
      const startUs = clock.snapAudio(line.startMs != null ? sceneStart + msToUs(Math.round(line.startMs)) : dialogueCursor);
      const endUs = clock.snapAudio(startUs + dur, "ceil");
      const key = `dialogue:${line.id}`;
      const shot = shotSpans.find((s) => startUs >= s.startUs && startUs < s.endUs) ?? shotSpans[shotSpans.length - 1];
      events.push({
        key, kind: "dialogue", startUs, endUs, refType: "dialogue_line", refId: line.id, parentKey: sceneKey,
        ...(shot ? { anchor: { key: shot.key, offsetUs: startUs - shot.startUs, mode: "start" as const } } : {}),
        payload: { text: line.text, characterId: line.characterId ?? null, durationSource: measured ? "audio" : "estimate" },
      });
      if (endUs > sceneEnd) warnings.push(`dialogue ${line.id} ends ${endUs - sceneEnd} µs after scene ${scene.id}`);
      dialogueCursor = endUs;
    }

    for (const t of scene.audioTracks ?? []) {
      const startUs = clock.snapAudio(sceneStart + msToUs(Math.round(t.startMs)));
      const endUs = t.durationMs != null && t.durationMs > 0 ? clock.snapAudio(startUs + msToUs(Math.round(t.durationMs)), "ceil") : sceneEnd;
      if (endUs <= startUs) {
        warnings.push(`audio track ${t.id} has no duration inside scene ${scene.id}`);
        continue;
      }
      audio.push({ key: `audio:${t.id}`, stem: STEM[t.kind], startUs, endUs, gainDb: t.gainDb, fadeInUs: 0n, fadeOutUs: 0n, refType: "audio_track", refId: t.id });
      if (endUs > sceneEnd) warnings.push(`audio track ${t.id} ends ${endUs - sceneEnd} µs after scene ${scene.id}`);
    }
  }

  const lastAudio = [...events.filter((e) => e.kind !== "scene" && e.kind !== "shot"), ...audio].reduce((m, e) => (e.endUs > m ? e.endUs : m), 0n);
  // The timeline covers everything placed on it; picture ends on a frame.
  const durationUs = clock.snapPicture(lastAudio > cursor ? lastAudio : cursor, "ceil");
  return { clock, durationUs, events: events.sort((a, b) => (a.startUs === b.startUs ? 0 : a.startUs < b.startUs ? -1 : 1)), audio, warnings };
}

/** Planned shot length in seconds → whole-frame µs on a 24 fps (or given) clock. */
export function plannedShotUs(seconds: number, clock: MasterClock): Us {
  return clock.snapPicture(secondsToUs(seconds));
}
