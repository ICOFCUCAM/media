/**
 * The one simple voice screen (DirectorOS W26; Part 4 §176): voice, language,
 * style, emotion, speed → one reading. Pure: what the screen's choices become
 * on the voiceover row the Voice Engine reads (the same row the full Voice
 * Studio writes).
 */
import { EMOTIONS, type ReadingMode } from "./readings";

export const QUICK_STYLES = [
  { id: "cinematic", label: "Cinematic", hint: "Film narration: unhurried, weighty.", mode: "narrator" as ReadingMode, energy: 0.65, speedFactor: 0.95 },
  { id: "narrator", label: "Narrator", hint: "Calm and even: books, documentaries.", mode: "narrator" as ReadingMode, energy: null, speedFactor: 1 },
  { id: "presenter", label: "Presenter", hint: "Bright and clear: news, adverts.", mode: "presenter" as ReadingMode, energy: null, speedFactor: 1 },
] as const;

export type QuickStyle = (typeof QUICK_STYLES)[number]["id"];

/** Emotions offered on the simple screen, with the plain word the owner sees. */
export const QUICK_EMOTIONS: { id: (typeof EMOTIONS)[number]; label: string }[] = [
  { id: "neutral", label: "Natural" },
  { id: "serious", label: "Authoritative" },
  { id: "calm", label: "Calm" },
  { id: "happy", label: "Warm" },
  { id: "excited", label: "Excited" },
  { id: "sad", label: "Sad" },
  { id: "angry", label: "Angry" },
];

export interface QuickChoice {
  voiceId: string | null;
  language: string;
  style: QuickStyle;
  emotion: (typeof EMOTIONS)[number];
  speed: number;
  text: string;
  title?: string;
}

/** The voiceover row the simple screen inserts (pure). */
export function quickVoiceRow(userId: string, c: QuickChoice): Record<string, unknown> {
  const s = QUICK_STYLES.find((x) => x.id === c.style) ?? QUICK_STYLES[0];
  const style: Record<string, number | string> = {};
  if (c.emotion !== "neutral") style.emotion = c.emotion;
  if (s.energy !== null) style.energy = s.energy;
  const speed = Math.round(Math.min(1.5, Math.max(0.75, c.speed * s.speedFactor)) * 100) / 100;
  if (speed !== 1) style.speed = speed;
  const text = c.text.trim();
  return {
    user_id: userId,
    voice_id: c.voiceId || null,
    title: c.title?.trim() || (text.split(/\s+/).slice(0, 6).join(" ") + (text.split(/\s+/).length > 6 ? "…" : "")) || "Untitled speech",
    text,
    language: c.language,
    mode: s.mode,
    style,
    speakers: [],
  };
}
