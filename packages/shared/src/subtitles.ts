/**
 * Subtitle builders (docs/29). Turn timed caption cues into SRT or WebVTT, so a
 * film can ship a soft subtitle track per language (the render engine muxes them
 * via `mov_text` — see apps/worker/src/ffmpeg/commands.ts). Pure + tested.
 */
export interface Cue {
  startSec: number;
  endSec: number;
  text: string;
}

function pad(n: number, w = 2): string {
  return String(Math.max(0, Math.floor(n))).padStart(w, "0");
}

/** Format seconds as a subtitle timecode. `sep` is "," for SRT, "." for VTT. */
export function timecode(sec: number, sep: "," | "."): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export function buildSrt(cues: Cue[]): string {
  return (
    cues
      .map((c, i) => `${i + 1}\n${timecode(c.startSec, ",")} --> ${timecode(c.endSec, ",")}\n${c.text.trim()}`)
      .join("\n\n") + "\n"
  );
}

export function buildVtt(cues: Cue[]): string {
  return (
    "WEBVTT\n\n" +
    cues
      .map((c) => `${timecode(c.startSec, ".")} --> ${timecode(c.endSec, ".")}\n${c.text.trim()}`)
      .join("\n\n") +
    "\n"
  );
}

/**
 * Lay out lines sequentially over a total duration when explicit per-line times
 * aren't known: each line gets an equal slice. A pragmatic default for scene
 * dialogue/narration before precise word-timings (forced alignment) are wired.
 */
export function cuesFromLines(lines: string[], totalSec: number): Cue[] {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (!clean.length || totalSec <= 0) return [];
  const slice = totalSec / clean.length;
  return clean.map((text, i) => ({ startSec: i * slice, endSec: (i + 1) * slice, text }));
}
