/**
 * Master Production Clock positions (docs/38 §AU.4). The canonical unit is an
 * integer number of microseconds from timeline start, carried as `bigint` so
 * a fractional or float value cannot enter timeline storage. Frame and sample
 * positions convert to and from µs with exact integer arithmetic and explicit
 * rounding:
 *
 *   frame n  starts at  floor(n · 1e6 · den / num) µs
 *   sample k starts at  floor(k · 1e6 / sampleRate) µs
 *
 * Snap rules: picture events snap to frame starts; audio events are
 * sample-accurate; subtitles snap to frames for display.
 */
import type { FrameRate } from "./rational";

/** Microseconds on the Master Production Clock. */
export type Us = bigint;

export const US_PER_SECOND = 1_000_000n;
export const PRODUCTION_SAMPLE_RATE = 48_000;

export type Rounding = "floor" | "nearest" | "ceil";

export class ClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockError";
  }
}

function big(n: number | bigint, what: string): bigint {
  if (typeof n === "bigint") return n;
  if (!Number.isSafeInteger(n)) throw new ClockError(`${what} must be an integer, got ${n}`);
  return BigInt(n);
}

/** floor(a / b) for b > 0, correct for negative a (BigInt division truncates). */
export function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  return -floorDiv(-a, b);
}

/** Round a/b to the nearest integer; exact halves round up (towards +∞). */
export function roundDiv(a: bigint, b: bigint): bigint {
  return floorDiv(2n * a + b, 2n * b);
}

function divide(a: bigint, b: bigint, mode: Rounding): bigint {
  return mode === "floor" ? floorDiv(a, b) : mode === "ceil" ? ceilDiv(a, b) : roundDiv(a, b);
}

// ── frames ──────────────────────────────────────────────────────────────────
/** Start of frame `n` in µs. */
export function frameToUs(n: number | bigint, fps: FrameRate): Us {
  return floorDiv(big(n, "frame") * US_PER_SECOND * BigInt(fps.den), BigInt(fps.num));
}

/**
 * The frame containing position `us`: the largest n with frameToUs(n) ≤ us.
 * Consistent with frameToUs by construction (round-trips exactly).
 */
export function usToFrame(us: Us, fps: FrameRate): bigint {
  // frameToUs(n) ≤ us  ⇔  n·1e6·den < (us+1)·num  ⇔  n < (us+1)·num / (1e6·den)
  return ceilDiv((us + 1n) * BigInt(fps.num), US_PER_SECOND * BigInt(fps.den)) - 1n;
}

/** Snap a position to a frame start. "nearest" picks the closer start (ties → later). */
export function snapToFrame(us: Us, fps: FrameRate, mode: Rounding = "nearest"): Us {
  const n = usToFrame(us, fps);
  const start = frameToUs(n, fps);
  if (start === us || mode === "floor") return start;
  const next = frameToUs(n + 1n, fps);
  if (mode === "ceil") return next;
  return us - start < next - us ? start : next;
}

export function isFrameAligned(us: Us, fps: FrameRate): boolean {
  return frameToUs(usToFrame(us, fps), fps) === us;
}

/** Whole frames covering [startUs, endUs) once both ends are snapped to frames. */
export function frameSpan(startUs: Us, endUs: Us, fps: FrameRate, mode: Rounding = "nearest"): bigint {
  if (endUs < startUs) throw new ClockError(`interval ends before it starts (${startUs}..${endUs})`);
  return usToFrame(snapToFrame(endUs, fps, mode), fps) - usToFrame(snapToFrame(startUs, fps, mode), fps);
}

/** Exact duration of `count` frames starting at frame `first`. */
export function framesDurationUs(count: number | bigint, fps: FrameRate, first: number | bigint = 0n): Us {
  const f = big(first, "frame");
  return frameToUs(f + big(count, "frame count"), fps) - frameToUs(f, fps);
}

// ── samples ─────────────────────────────────────────────────────────────────
export function sampleToUs(k: number | bigint, sampleRate: number = PRODUCTION_SAMPLE_RATE): Us {
  return floorDiv(big(k, "sample") * US_PER_SECOND, big(sampleRate, "sample rate"));
}

/** The sample containing `us` (largest k with sampleToUs(k) ≤ us). */
export function usToSample(us: Us, sampleRate: number = PRODUCTION_SAMPLE_RATE): bigint {
  return ceilDiv((us + 1n) * big(sampleRate, "sample rate"), US_PER_SECOND) - 1n;
}

// ── seconds / milliseconds at the boundary ──────────────────────────────────
/**
 * Convert a float seconds value from a legacy or external source (ffprobe,
 * TTS metadata, `start_ms` columns) onto the clock. The rounding is explicit;
 * floats never travel further than this call.
 */
export function secondsToUs(sec: number, mode: Rounding = "nearest"): Us {
  if (!Number.isFinite(sec)) throw new ClockError(`non-finite seconds ${sec}`);
  // Through a decimal string so 0.1 → 100000 exactly, not 100000.00000000001.
  const [intPart, frac = ""] = Math.abs(sec).toFixed(9).split(".");
  const nanos = BigInt(intPart!) * 1_000_000_000n + BigInt(frac.padEnd(9, "0"));
  const us = divide(nanos, 1000n, mode);
  return sec < 0 ? -us : us;
}

export function msToUs(ms: number): Us {
  return big(ms, "milliseconds") * 1000n;
}

/** For display and FFmpeg arguments only. */
export function usToSeconds(us: Us): number {
  return Number(us) / 1e6;
}

/** "6.840000" — exact decimal seconds for FFmpeg `-t`/`-ss` arguments. */
export function usToSecondsString(us: Us): string {
  const neg = us < 0n;
  const a = neg ? -us : us;
  return `${neg ? "-" : ""}${a / US_PER_SECOND}.${String(a % US_PER_SECOND).padStart(6, "0")}`;
}

/** JSON-safe form (bigint does not serialize). */
export function usToJson(us: Us): string {
  return us.toString();
}

export function usFromJson(v: string | number | bigint): Us {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return big(v, "µs");
  if (!/^-?\d+$/.test(v)) throw new ClockError(`not an integer µs value: ${JSON.stringify(v)}`);
  return BigInt(v);
}
