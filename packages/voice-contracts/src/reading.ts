/**
 * Readings, modes and a character's voice traits (DirectorOS Part 3 §116–117,
 * Part 1 §19.2; W15).
 *
 *   modes        narrator (calm, even), presenter (brighter, a touch faster) and
 *                conversation (a script of "Name: line" read by up to four
 *                voices). Each mode is a default style; the owner's own
 *                controls (emotion, energy, speed, pitch) override it.
 *   traits       what a character's voice keeps in every scene: pitch, speech
 *                rate and loudness (§19.2). Pitch and rate go to the engine;
 *                loudness is a gain applied after mastering — mastering stays
 *                outside the model (§150).
 */
import { StyleSchema } from "./api";
import type { VoiceStyle } from "./engine";

export const READING_MODES = ["narrator", "presenter", "conversation"] as const;
export type ReadingMode = (typeof READING_MODES)[number];

export const MODE_STYLE: Record<ReadingMode, VoiceStyle> = {
  narrator: { energy: 0.4, speed: 1 },
  presenter: { energy: 0.7, speed: 1.05 },
  conversation: { energy: 0.55, speed: 1 },
};

/** The style a reading is spoken with: the mode's default, then the owner's controls (invalid ones dropped). */
export function readingStyle(mode: ReadingMode, own: unknown): VoiceStyle {
  const parsed = StyleSchema.safeParse(own ?? {});
  const style = { ...MODE_STYLE[mode], ...(parsed.success ? parsed.data : {}) };
  for (const k of Object.keys(style) as (keyof VoiceStyle)[]) if (style[k] === undefined || style[k] === "") delete style[k];
  return style;
}

export const MAX_SPEAKERS = 4;

export interface ConversationLine { speaker: string; text: string }

/**
 * A conversation script: one "Name: line" per line; a line without a name
 * continues the previous speaker. Speakers are matched case-insensitively.
 */
export function parseConversation(script: string): ConversationLine[] {
  const out: ConversationLine[] = [];
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([\p{L}\p{N}][\p{L}\p{N} ._'-]{0,39}):\s*(.+)$/u.exec(line);
    if (m) out.push({ speaker: m[1]!.trim(), text: m[2]!.trim() });
    else if (out.length) out[out.length - 1]!.text += ` ${line}`;
    else throw new Error(`the conversation must start with "Name: line" (got "${line.slice(0, 40)}")`);
  }
  return out;
}

/** The distinct speakers of a conversation, in order of first line. */
export function conversationSpeakers(lines: ConversationLine[]): string[] {
  const seen = new Map<string, string>();
  for (const l of lines) if (!seen.has(l.speaker.toLowerCase())) seen.set(l.speaker.toLowerCase(), l.speaker);
  return [...seen.values()];
}

export interface VoiceTraits {
  /** semitones, −6..6 */
  pitch?: number;
  /** 0.8..1.25 */
  rate?: number;
  /** dB after mastering, −6..3 */
  loudnessDb?: number;
}

const clamp = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);

/** A character's fixed traits from characters.voice_profile.traits (out-of-range values clamped, junk ignored). */
export function voiceTraits(profile: unknown): VoiceTraits {
  const t = (profile as { traits?: Record<string, unknown> } | null)?.traits;
  if (!t || typeof t !== "object") return {};
  const out: VoiceTraits = { pitch: clamp(t.pitch, -6, 6), rate: clamp(t.rate, 0.8, 1.25), loudnessDb: clamp(t.loudnessDb, -6, 3) };
  for (const k of Object.keys(out) as (keyof VoiceTraits)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** A line's style with the character's traits: rate scales the line's speed, pitch is the character's unless the line sets one. */
export function withTraits(style: VoiceStyle | undefined, traits: VoiceTraits): VoiceStyle | undefined {
  if (traits.pitch === undefined && traits.rate === undefined) return style;
  const out: VoiceStyle = { ...(style ?? {}) };
  if (traits.rate !== undefined) out.speed = Math.min(2, Math.max(0.5, (out.speed ?? 1) * traits.rate));
  if (traits.pitch !== undefined && out.pitch === undefined) out.pitch = traits.pitch;
  return out;
}
