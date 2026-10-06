/**
 * SMPTE timecode for the Master Production Clock — a display and interchange
 * form of a frame position, never a storage form (§AU.4 stores µs). Non-drop
 * frame for every rate; drop-frame (`;` separator) for 30000/1001 and
 * 60000/1001, where frame numbers 0–1 (0–3 at 59.94) are skipped at the start
 * of every minute except each tenth, keeping timecode in step with wall time.
 */
import { ClockError, frameToUs, usToFrame, type Us } from "./time";
import { formatFrameRate, type FrameRate } from "./rational";

export interface TimecodeOptions {
  /** Default: true for 29.97/59.94, ignored (false) for other rates. */
  dropFrame?: boolean;
}

function nominal(fps: FrameRate): number {
  return Math.ceil(fps.num / fps.den);
}

function dropCount(fps: FrameRate): number {
  const r = formatFrameRate(fps);
  return r === "30000/1001" ? 2 : r === "60000/1001" ? 4 : 0;
}

function usesDrop(fps: FrameRate, opts?: TimecodeOptions): boolean {
  const supported = dropCount(fps) > 0;
  if (opts?.dropFrame && !supported) throw new ClockError(`drop-frame timecode is undefined at ${formatFrameRate(fps)}`);
  return supported && opts?.dropFrame !== false;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** Frame number → "HH:MM:SS:FF" (or "HH:MM:SS;FF" drop-frame). */
export function frameToTimecode(frame: number, fps: FrameRate, opts?: TimecodeOptions): string {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new ClockError(`invalid frame ${frame}`);
  const base = nominal(fps);
  const drop = usesDrop(fps, opts);
  let f = frame;
  if (drop) {
    const d = dropCount(fps);
    const per10 = base * 600 - d * 9;
    const perMin = base * 60 - d;
    const tens = Math.floor(f / per10);
    const rem = f % per10;
    f += d * 9 * tens + (rem > d ? d * Math.floor((rem - d) / perMin) : 0);
  }
  const ff = f % base;
  const totalSec = Math.floor(f / base);
  return `${p2(Math.floor(totalSec / 3600))}:${p2(Math.floor(totalSec / 60) % 60)}:${p2(totalSec % 60)}${drop ? ";" : ":"}${p2(ff)}`;
}

/** "HH:MM:SS:FF" / "HH:MM:SS;FF" → frame number. Rejects frames that drop-frame skips. */
export function timecodeToFrame(tc: string, fps: FrameRate, opts?: TimecodeOptions): number {
  const m = /^(\d{2}):(\d{2}):(\d{2})([:;])(\d{2})$/.exec(tc.trim());
  if (!m) throw new ClockError(`malformed timecode ${JSON.stringify(tc)}`);
  const [h, mi, s, ff] = [m[1], m[2], m[3], m[5]].map(Number) as [number, number, number, number];
  const base = nominal(fps);
  const drop = m[4] === ";" ? usesDrop(fps, { dropFrame: true }) : usesDrop(fps, opts) && m[4] !== ":";
  if (mi > 59 || s > 59 || ff >= base) throw new ClockError(`timecode out of range ${tc}`);
  let frame = (h * 3600 + mi * 60 + s) * base + ff;
  if (drop) {
    const d = dropCount(fps);
    if (s === 0 && ff < d && mi % 10 !== 0) throw new ClockError(`${tc} does not exist in drop-frame timecode`);
    const minutes = h * 60 + mi;
    frame -= d * (minutes - Math.floor(minutes / 10));
  }
  return frame;
}

export function usToTimecode(us: Us, fps: FrameRate, opts?: TimecodeOptions): string {
  return frameToTimecode(Number(usToFrame(us, fps)), fps, opts);
}

export function timecodeToUs(tc: string, fps: FrameRate, opts?: TimecodeOptions): Us {
  return frameToUs(timecodeToFrame(tc, fps, opts), fps);
}
