/**
 * Dialogue timing estimate before TTS exists (docs/38 §AU.5): words ×
 * language speaking rate × emotion modifier + pauses from punctuation. It is
 * replaced by measured durations as soon as dialogue audio exists. Rates are
 * planning defaults, not measurements.
 */
import type { Us } from "../clock/time";

/** Approximate conversational words per minute by language (planning only). */
const WPM: Record<string, number> = { en: 150, es: 160, fr: 155, de: 135, it: 160, pt: 155, nl: 145, sv: 140, no: 140, ja: 130, zh: 130, ko: 135, ar: 130, hi: 140 };

const EMOTION: Record<string, number> = {
  calm: 1.1, sad: 1.2, tender: 1.15, whisper: 1.15, neutral: 1, happy: 0.95,
  excited: 0.85, angry: 0.9, urgent: 0.8, scared: 0.9,
};

/** Pause after punctuation, µs. */
const PAUSE: Array<[RegExp, bigint]> = [
  [/[.!?…]+/g, 350_000n],
  [/[,;:—–]/g, 180_000n],
];

export function estimateSpeechUs(text: string, opts: { language?: string; emotion?: string | null } = {}): Us {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0n;
  const lang = (opts.language ?? "en").slice(0, 2).toLowerCase();
  const wpm = WPM[lang] ?? 150;
  const mod = EMOTION[(opts.emotion ?? "neutral").toLowerCase()] ?? 1;
  const speak = BigInt(Math.round(((words * 60) / wpm) * mod * 1_000_000));
  // Interior punctuation only: a trailing full stop adds no pause after the line ends.
  const body = text.trim().replace(/[.!?…]+$/, "");
  let pause = 0n;
  for (const [re, us] of PAUSE) pause += BigInt((body.match(re) ?? []).length) * us;
  return speak + pause;
}
