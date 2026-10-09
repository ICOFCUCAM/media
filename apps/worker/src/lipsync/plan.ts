/**
 * Lip sync for dialogue shots (DirectorOS W21; Part 1 §2.4 "lip sync", Part 3
 * §111). Video models do not move a speaker's mouth to the film's dialogue, so
 * a shot in which a framed character speaks is passed, with exactly that
 * character's lines cut to the shot, through a lip-sync model.
 *
 * This module is pure: which shots need it, which slices of which lines they
 * carry, the ffmpeg arguments for each shot's dialogue stem, and a content key
 * so a shot is lip-synced once per (clip, lines) and reused.
 */
import { createHash } from "node:crypto";

/** Sizes too wide for a mouth to read, or with no one to read it: never lip-synced. */
export const NO_LIP_SYNC_SIZES = new Set(["EWS", "WS", "INSERT"]);
/** Less speech than this in a shot is not worth a lip-sync call (seconds). */
export const MIN_SPEECH_SEC = 0.4;

export interface LipSyncShot {
  shotId: string;
  videoKey: string;
  /** Where the shot starts in its scene, and how long it plays (seconds). */
  startSec: number;
  durSec: number;
  size: string | null;
  /** Characters framed in the shot (database ids). */
  framed: string[];
}

export interface LipSyncLine {
  lineId: string;
  characterId: string;
  audioKey: string;
  /** Where the line starts in its scene, and how long it is (seconds). */
  startSec: number;
  durSec: number;
}

export interface LipSyncSegment {
  lineId: string;
  audioKey: string;
  /** Where in the shot the slice plays, where in the line it starts, and its length (seconds). */
  atSec: number;
  fromSec: number;
  durSec: number;
}

export interface LipSyncTarget {
  shotId: string;
  videoKey: string;
  durSec: number;
  segments: LipSyncSegment[];
  speechSec: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The shots of one scene that need lip sync, each with the slices of its framed speakers' lines (pure). */
export function lipSyncTargets(shots: LipSyncShot[], lines: LipSyncLine[]): LipSyncTarget[] {
  const out: LipSyncTarget[] = [];
  for (const sh of shots) {
    if (sh.size && NO_LIP_SYNC_SIZES.has(sh.size)) continue;
    const end = sh.startSec + sh.durSec;
    const segments: LipSyncSegment[] = [];
    for (const l of lines) {
      if (!sh.framed.includes(l.characterId)) continue;
      const a = Math.max(sh.startSec, l.startSec);
      const b = Math.min(end, l.startSec + l.durSec);
      if (b - a <= 0.05) continue;
      segments.push({ lineId: l.lineId, audioKey: l.audioKey, atSec: r3(a - sh.startSec), fromSec: r3(a - l.startSec), durSec: r3(b - a) });
    }
    const speechSec = r3(segments.reduce((s, x) => s + x.durSec, 0));
    if (speechSec >= MIN_SPEECH_SEC) out.push({ shotId: sh.shotId, videoKey: sh.videoKey, durSec: sh.durSec, segments, speechSec });
  }
  return out;
}

/** ffmpeg: the shot's dialogue stem — each slice at its place, silence elsewhere, exactly the shot's length, 48 kHz mono. */
export function dialogueStemArgs(inputs: string[], segments: LipSyncSegment[], durSec: number, output: string): string[] {
  const args: string[] = [];
  segments.forEach((s, i) => args.push("-ss", s.fromSec.toFixed(3), "-t", s.durSec.toFixed(3), "-i", inputs[i]!));
  const parts = segments.map((s, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${Math.round(s.atSec * 1000)}:all=1[s${i}]`);
  const mix = `${segments.map((_, i) => `[s${i}]`).join("")}amix=inputs=${segments.length}:normalize=0:duration=longest,apad,atrim=0:${durSec.toFixed(3)}[out]`;
  return [...args, "-filter_complex", [...parts, mix].join(";"), "-map", "[out]", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", output];
}

/** Content key: the same clip with the same slices of the same lines is lip-synced once. */
export function lipSyncKey(projectId: string, t: LipSyncTarget, model: string): string {
  const h = createHash("sha256").update(JSON.stringify([model, t.videoKey, t.durSec, t.segments])).digest("hex").slice(0, 20);
  return `projects/${projectId}/lipsync/${t.shotId}-${h}.mp4`;
}
