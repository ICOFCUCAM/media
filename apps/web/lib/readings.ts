/**
 * Voice Studio readings (W15; Part 3 §116–117): modes, delivery controls and
 * conversation speakers. The worker re-parses and the database checks every
 * voice; this only drives the form.
 */
export type ReadingMode = "narrator" | "presenter" | "conversation";

export const READING_MODES: { id: ReadingMode; label: string; hint: string }[] = [
  { id: "narrator", label: "Narrator", hint: "Calm and even — books, documentaries, explainers." },
  { id: "presenter", label: "Presenter", hint: "Brighter and a touch faster — news, adverts, announcements." },
  { id: "conversation", label: "Conversation", hint: "Write “Name: line” — each speaker in their own voice (up to four)." },
];

export const EMOTIONS = ["neutral", "happy", "sad", "angry", "calm", "excited", "serious"] as const;

export interface Delivery {
  emotion: (typeof EMOTIONS)[number];
  energy: number;
  speed: number;
  pitch: number;
}

export const DEFAULT_DELIVERY: Delivery = { emotion: "neutral", energy: 0.5, speed: 1, pitch: 0 };

/** The style stored on the reading: only what the owner moved off the defaults (the mode supplies the rest). */
export function deliveryStyle(d: Delivery, touched: Partial<Record<keyof Delivery, boolean>>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (d.emotion !== "neutral") out.emotion = d.emotion;
  if (touched.energy) out.energy = Math.round(d.energy * 100) / 100;
  if (touched.speed) out.speed = Math.round(d.speed * 100) / 100;
  if (touched.pitch && d.pitch !== 0) out.pitch = Math.round(d.pitch);
  return out;
}

export const MAX_SPEAKERS = 4;

/** The speakers of a "Name: line" script, in order of first line (matched case-insensitively). */
export function scriptSpeakers(script: string): string[] {
  const seen = new Map<string, string>();
  for (const raw of script.split(/\r?\n/)) {
    const m = /^\s*([\p{L}\p{N}][\p{L}\p{N} ._'-]{0,39}):\s*\S/u.exec(raw);
    if (m && !seen.has(m[1]!.trim().toLowerCase())) seen.set(m[1]!.trim().toLowerCase(), m[1]!.trim());
  }
  return [...seen.values()];
}
