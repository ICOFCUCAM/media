/**
 * Exact rational frame rates for the Master Production Clock (docs/38 §AU.4,
 * §AW.3). 23.976 fps is 24000/1001, never 23.976: every conversion on the
 * clock is integer arithmetic over (num, den), so frame-rate handling cannot
 * introduce cumulative drift.
 */
export interface FrameRate {
  /** Frames per `den` seconds. */
  readonly num: number;
  readonly den: number;
}

/** The rates a production may use (one per production, §AW.3). */
export const FPS = {
  FILM_23_976: { num: 24000, den: 1001 },
  FILM_24: { num: 24, den: 1 },
  PAL_25: { num: 25, den: 1 },
  NTSC_29_97: { num: 30000, den: 1001 },
  VIDEO_30: { num: 30, den: 1 },
  PAL_50: { num: 50, den: 1 },
  NTSC_59_94: { num: 60000, den: 1001 },
  VIDEO_60: { num: 60, den: 1 },
} as const satisfies Record<string, FrameRate>;

export const PRODUCTION_FRAME_RATES: readonly FrameRate[] = Object.values(FPS);

/** Decimal spellings of the NTSC family that must map to their exact rational. */
const NTSC_DECIMALS: Record<string, FrameRate> = {
  "23.976": FPS.FILM_23_976,
  "23.98": FPS.FILM_23_976,
  "29.97": FPS.NTSC_29_97,
  "59.94": FPS.NTSC_59_94,
  "47.952": { num: 48000, den: 1001 },
  "119.88": { num: 120000, den: 1001 },
};

export class FrameRateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameRateError";
  }
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Validate and reduce a rate (48/2 → 24/1). Throws on non-positive or non-integer parts. */
export function frameRate(num: number, den = 1): FrameRate {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || num <= 0 || den <= 0) {
    throw new FrameRateError(`invalid frame rate ${num}/${den}`);
  }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Parse "24", "24/1", "24000/1001", "23.976", "29.97" or an ffprobe
 * `r_frame_rate` / `avg_frame_rate`. NTSC decimals map to x000/1001; other
 * decimals are taken literally (12.5 → 25/2). "0/0" (ffprobe "unknown") throws.
 */
export function parseFrameRate(input: string | number | FrameRate): FrameRate {
  if (typeof input === "object") return frameRate(input.num, input.den);
  const s = String(input).trim();
  const ntsc = NTSC_DECIMALS[s];
  if (ntsc) return frameRate(ntsc.num, ntsc.den);
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (frac) return frameRate(Number(frac[1]), Number(frac[2]));
  const dec = /^(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (dec) {
    const decimals = dec[2] ?? "";
    const den = 10 ** decimals.length;
    return frameRate(Number(dec[1]) * den + Number(decimals || 0), den);
  }
  throw new FrameRateError(`unparseable frame rate ${JSON.stringify(input)}`);
}

export function sameRate(a: FrameRate, b: FrameRate): boolean {
  // Cross-multiplication compares unreduced inputs too.
  return BigInt(a.num) * BigInt(b.den) === BigInt(b.num) * BigInt(a.den);
}

/** "24/1", "24000/1001" — the canonical storage form. */
export function formatFrameRate(r: FrameRate): string {
  const x = frameRate(r.num, r.den);
  return `${x.num}/${x.den}`;
}

/** Approximate decimal value — display only, never for timing. */
export function frameRateValue(r: FrameRate): number {
  return r.num / r.den;
}

/** Whether `r` is one of the allowed production rates. */
export function isProductionRate(r: FrameRate): boolean {
  return PRODUCTION_FRAME_RATES.some((p) => sameRate(p, r));
}
