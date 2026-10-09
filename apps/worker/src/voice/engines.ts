/**
 * Cloud voice engines behind the VoiceEngine boundary (Part 4 §158, W7a).
 *
 *   fal-minimax  MiniMax voice clone + speech on fal (the Voice Lab's engine)
 *   openai-tts   OpenAI speech, stock voices only (no cloning)
 *
 * Self-hosted engines (qwen3-tts, cosyvoice-3, gpt-sovits) are registered in
 * @cineforge/voice-contracts but have no adapter here: model work waits on
 * Phase 1 (docs/39). An engine returns raw audio; mastering happens after,
 * outside the model (mastering.ts).
 */
import { readFile, writeFile } from "node:fs/promises";
import { falFindUrl, falRunQueue, falUploadBytes } from "@cineforge/model-adapters";
import { languageName } from "@cineforge/shared";
import {
  ENGINE_REGISTRY,
  type EngineHealth,
  type SpeechSynthesisRequest,
  type SpeechSynthesisResult,
  type VoiceEngine,
  type VoiceEnrollmentRequest,
  type VoiceEnrollmentResult,
} from "@cineforge/voice-contracts";

type Env = Record<string, string | undefined>;

export interface FalDeps {
  upload: typeof falUploadBytes;
  run: typeof falRunQueue;
  fetch: typeof fetch;
}

const MIME: Record<string, string> = { wav: "audio/wav", m4a: "audio/mp4", mp3: "audio/mpeg", ogg: "audio/ogg", webm: "audio/webm", flac: "audio/flac" };
/** MiniMax's emotion vocabulary; anything else is left to the model's default. */
const MINIMAX_EMOTIONS = new Set(["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"]);

async function download(f: typeof fetch, url: string, to: string): Promise<void> {
  const res = await f(url);
  if (!res.ok) throw new Error(`audio download ${res.status}`);
  await writeFile(to, new Uint8Array(await res.arrayBuffer()));
}

export class FalMinimaxEngine implements VoiceEngine {
  readonly id = "fal-minimax";
  readonly version: string;
  private readonly cloneModel: string;
  private readonly speechModel: string;
  private readonly stockVoice: string;
  constructor(private readonly env: Env, private readonly deps: FalDeps = { upload: falUploadBytes, run: falRunQueue, fetch }) {
    this.cloneModel = env.FAL_VOICE_CLONE_MODEL ?? "fal-ai/minimax/voice-clone";
    this.speechModel = env.FAL_SPEECH_MODEL ?? "fal-ai/minimax/speech-02-hd";
    this.stockVoice = env.FAL_STOCK_VOICE ?? "Deep_Voice_Man";
    // A cloned voice id belongs to the clone model that made it.
    this.version = this.cloneModel;
  }
  getCapabilities() {
    return ENGINE_REGISTRY["fal-minimax"]!.capabilities;
  }
  private key(): string {
    const k = this.env.FAL_KEY;
    if (!k) throw new Error("FAL_KEY not configured");
    return k;
  }
  private preset(name: string | undefined): string {
    return name && this.getCapabilities().presets.includes(name) ? name : this.stockVoice;
  }
  async enrollVoice(req: VoiceEnrollmentRequest): Promise<VoiceEnrollmentResult> {
    const ext = req.referencePath.split(".").pop()?.toLowerCase() ?? "wav";
    const url = await this.deps.upload(this.key(), new Uint8Array(await readFile(req.referencePath)), MIME[ext] ?? "audio/wav", `sample.${ext}`);
    const result = await this.deps.run(this.key(), this.cloneModel, { audio_url: url });
    const id =
      (result.custom_voice_id as string | undefined) ??
      (result.voice_id as string | undefined) ??
      ((result.data as Record<string, unknown> | undefined)?.voice_id as string | undefined);
    if (!id) throw new Error(`voice clone returned no voice id (${JSON.stringify(result).slice(0, 200)})`);
    return { artifacts: [{ artifactType: "provider_voice_id", uri: id, metadata: { model: this.cloneModel } }] };
  }
  async synthesize(req: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    if (req.voice && req.voice.artifactType !== "provider_voice_id") throw new Error(`fal-minimax cannot use a ${req.voice.artifactType}`);
    const emotion = req.style?.emotion?.toLowerCase();
    const input: Record<string, unknown> = {
      text: req.text,
      voice_setting: {
        voice_id: req.voice?.uri ?? this.preset(req.preset),
        speed: req.style?.speed ?? 1,
        ...(req.style?.pitch !== undefined ? { pitch: Math.round(req.style.pitch) } : {}),
        ...(emotion && MINIMAX_EMOTIONS.has(emotion) ? { emotion } : {}),
      },
      ...(req.language && req.language !== "en" ? { language_boost: languageName(req.language) } : {}),
    };
    const result = await this.deps.run(this.key(), this.speechModel, input, { timeoutMs: 5 * 60_000 });
    const url = falFindUrl(result);
    if (!url) throw new Error("speech returned no audio");
    await download(this.deps.fetch, url, req.outPath);
    return { path: req.outPath, format: "mp3" };
  }
  async health(): Promise<EngineHealth> {
    return this.env.FAL_KEY ? { ok: true } : { ok: false, detail: "FAL_KEY not configured" };
  }
  async unload(): Promise<void> {}
}

export class OpenAiTtsEngine implements VoiceEngine {
  readonly id = "openai-tts";
  readonly version: string;
  constructor(private readonly env: Env, private readonly f: typeof fetch = fetch) {
    this.version = env.OPENAI_TTS_MODEL ?? "tts-1";
  }
  getCapabilities() {
    return ENGINE_REGISTRY["openai-tts"]!.capabilities;
  }
  async enrollVoice(): Promise<VoiceEnrollmentResult> {
    throw new Error("openai-tts cannot clone voices");
  }
  async synthesize(req: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    if (req.voice) throw new Error("openai-tts cannot speak in a cloned voice");
    const key = this.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not configured");
    const res = await this.f("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: this.version,
        voice: req.preset && this.getCapabilities().presets.includes(req.preset) ? req.preset : this.env.OPENAI_TTS_VOICE ?? "onyx",
        input: req.text,
        response_format: "wav",
        ...(req.style?.speed !== undefined ? { speed: req.style.speed } : {}),
      }),
    });
    if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await writeFile(req.outPath, new Uint8Array(await res.arrayBuffer()));
    return { path: req.outPath, format: "wav" };
  }
  async health(): Promise<EngineHealth> {
    return this.env.OPENAI_API_KEY ? { ok: true } : { ok: false, detail: "OPENAI_API_KEY not configured" };
  }
  async unload(): Promise<void> {}
}

/** The adapter for a routed engine id; gated or unknown engines have none. */
export function voiceEngine(id: string, env: Env): VoiceEngine | null {
  if (id === "fal-minimax") return new FalMinimaxEngine(env);
  if (id === "openai-tts") return new OpenAiTtsEngine(env);
  return null;
}
