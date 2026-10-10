/**
 * Speech recognition for a recorded line (W26; Part 3 §111: ASR → LLM → TTS →
 * avatar). A hosted model on fal (FAL_TRANSCRIBE_MODEL, default Whisper)
 * hears the stored recording; nothing runs on the GPU pod.
 */
import { falRunQueue, falUploadBytes } from "@cineforge/model-adapters";

export interface TranscribeDeps {
  getBytes(key: string): Promise<Uint8Array>;
  upload(key: string, bytes: Uint8Array, type: string, name: string): Promise<string>;
  run(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const TYPES: Record<string, string> = { webm: "audio/webm", ogg: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", wav: "audio/wav" };

/** The first "text" string in a model's result (some wrap it: { output: { text } }). */
export function findText(obj: unknown, depth = 0): string | undefined {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  const o = obj as Record<string, unknown>;
  if (typeof o.text === "string") return o.text;
  for (const v of Object.values(o)) {
    const t = findText(v, depth + 1);
    if (t !== undefined) return t;
  }
  return undefined;
}

/** The text of a recording (throws when nothing could be heard or no provider is configured). */
export async function transcribe(audioKey: string, language: string, deps: TranscribeDeps, env: Record<string, string | undefined> = process.env): Promise<string> {
  const model = env.FAL_TRANSCRIBE_MODEL ?? "fal-ai/whisper";
  const ext = audioKey.split(".").pop()?.toLowerCase() ?? "webm";
  const url = await deps.upload(audioKey, await deps.getBytes(audioKey), TYPES[ext] ?? "audio/webm", `line.${ext}`);
  const result = await deps.run(model, { audio_url: url, task: "transcribe", language: language.slice(0, 2) });
  const text = findText(result);
  return (text ?? "").trim();
}

/** Production wiring (FAL_KEY required). */
export function falTranscribeDeps(getBytes: (k: string) => Promise<Uint8Array>): TranscribeDeps | null {
  const key = process.env.FAL_KEY;
  if (!key) return null;
  return {
    getBytes,
    upload: (_k, bytes, type, name) => falUploadBytes(key, bytes, type, name),
    run: (model, input) => falRunQueue(key, model, input, { timeoutMs: 3 * 60_000 }),
  };
}
