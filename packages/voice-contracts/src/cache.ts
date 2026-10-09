/**
 * The speech cache key (DirectorOS Part 4 §154). The same sentence, in the
 * same voice, from the same model version, in the same language and style,
 * is generated once: every later request is a cache hit — instant audio, no
 * GPU time, no provider charge.
 *
 *   key = sha256(voice + engine + engine version + text + language + style + speed + pitch)
 *
 * The voice is the engine's artifact for a cloned voice (it is per voice and
 * per engine version) or the preset for a built-in one. Text is compared
 * after whitespace is normalised, nothing else: "Welcome." and "welcome." are
 * different sentences to a speaker.
 */
import { createHash } from "node:crypto";
import type { SpeechSynthesisRequest } from "./engine";

export const SPEECH_CACHE_PREFIX = "audio_cache";

export function speechCacheKey(engine: { id: string; version: string }, req: Pick<SpeechSynthesisRequest, "text" | "language" | "voice" | "preset" | "style">): string {
  const style = req.style ?? {};
  const canonical = {
    v: 1,
    engine: engine.id,
    version: engine.version,
    voice: req.voice ? { type: req.voice.artifactType, uri: req.voice.uri } : { preset: req.preset ?? "default" },
    text: req.text.replace(/\s+/g, " ").trim(),
    language: req.language.trim().toLowerCase(),
    style: { emotion: style.emotion ?? null, energy: style.energy ?? null, speed: style.speed ?? null, pitch: style.pitch ?? null },
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Where a cached clip lives: grouped by voice, so a deleted voice's clips are easy to find. */
export function speechCacheObjectKey(key: string, format: "mp3" | "wav", voiceId: string | null): string {
  return `${SPEECH_CACHE_PREFIX}/${voiceId ? `voice/${voiceId}` : "stock"}/${key}.${format}`;
}
