/**
 * Voice model router (§167–168): which engine serves a request is
 * configuration, never CineForge code.
 *
 *   VOICE_ENGINES = "fal-minimax:90,openai-tts:80,qwen3-tts:100"
 *
 * Each entry is id:priority. An engine that may not run is passed over with
 * the reason (never silently skipped):
 *   - the licence registry has not cleared it (W14; for a self-hosted model:
 *     recorded terms plus the owner's approval of that exact checkpoint);
 *   - it is not configured (a self-hosted engine needs its own GPU deployment
 *     URL and the pinned checkpoint revision, docs/74);
 *   - it cannot do what the request needs (cloning, language, built-in voices).
 *
 * Self-hosted models (qwen3-tts, cosyvoice-3, gpt-sovits) are no longer held
 * by the Phase 1 rule (lifted by the owner, docs/74); the licence registry and
 * the owner's approval still keep each one off until it is cleared.
 */
import type { VoiceCapabilities } from "./engine";
import { licenceStatus } from "./licences";

export interface EngineDescriptor {
  id: string;
  kind: "cloud" | "self-hosted";
  capabilities: VoiceCapabilities;
  /** Why the engine cannot run, or null. */
  gated: string | null;
  /** Env vars the engine needs. */
  requires: string[];
}

const ANY = "any" as const;

/**
 * Self-hosted engines (apps/gpu-voice, docs/74): each runs on its own GPU
 * deployment. url: the deployment (registered and approved with gateway:admin).
 * revision: the pinned Hugging Face commit of its checkpoint — CineForge keys
 * voice artifacts and cached speech by it, and refuses a pod running another.
 * checkpoint (optional): the checkpoint repository, when not the licence
 * registry's (an approval names the checkpoint it covers).
 */
export const SELF_HOSTED_VOICE_ENGINES = {
  "qwen3-tts": { url: "VOICE_GPU_QWEN3_URL", revision: "VOICE_GPU_QWEN3_REVISION", checkpoint: "VOICE_GPU_QWEN3_MODEL" },
  "cosyvoice-3": { url: "VOICE_GPU_COSYVOICE_URL", revision: "VOICE_GPU_COSYVOICE_REVISION", checkpoint: "VOICE_GPU_COSYVOICE_MODEL" },
  "gpt-sovits": { url: "VOICE_GPU_GPTSOVITS_URL", revision: "VOICE_GPU_GPTSOVITS_REVISION", checkpoint: "VOICE_GPU_GPTSOVITS_MODEL" },
} as const;
export type SelfHostedVoiceEngineId = keyof typeof SELF_HOSTED_VOICE_ENGINES;
export const isSelfHostedVoiceEngine = (id: string): id is SelfHostedVoiceEngineId => id in SELF_HOSTED_VOICE_ENGINES;

export const ENGINE_REGISTRY: Record<string, EngineDescriptor> = {
  "fal-minimax": {
    id: "fal-minimax", kind: "cloud", gated: null, requires: ["FAL_KEY"],
    capabilities: { voiceCloning: true, voiceDesign: false, multilingual: true, languages: ANY, emotionControl: true, speedControl: true, streaming: false, batch: false, maxChars: 1800,
      presets: ["Deep_Voice_Man", "Wise_Woman", "Friendly_Person", "Calm_Woman", "Casual_Guy", "Lively_Girl", "Patient_Man", "Young_Knight", "Determined_Man", "Lovely_Girl", "Decent_Boy", "Elegant_Man", "Imposing_Manner", "Inspirational_girl"] },
  },
  "openai-tts": {
    id: "openai-tts", kind: "cloud", gated: null, requires: ["OPENAI_API_KEY"],
    capabilities: { voiceCloning: false, voiceDesign: false, multilingual: true, languages: ANY, emotionControl: false, speedControl: true, streaming: false, batch: false, maxChars: 4000,
      presets: ["onyx", "nova", "alloy", "shimmer", "echo", "fable"] },
  },
  // Self-hosted (docs/74). Capabilities are what the CineForge GPU service
  // actually wires for each model — not everything the model family can do.
  "qwen3-tts": {
    id: "qwen3-tts", kind: "self-hosted", gated: null, requires: ["VOICE_GPU_QWEN3_URL", "VOICE_GPU_QWEN3_REVISION"],
    // The Base checkpoint clones; instructions/emotion and named voices belong to other checkpoints.
    capabilities: { voiceCloning: true, voiceDesign: false, multilingual: true, languages: ["zh", "en", "ja", "ko", "de", "fr", "ru", "pt", "es", "it"],
      emotionControl: false, speedControl: false, streaming: false, batch: true, maxChars: 600, presets: [] },
  },
  "cosyvoice-3": {
    id: "cosyvoice-3", kind: "self-hosted", gated: null, requires: ["VOICE_GPU_COSYVOICE_URL", "VOICE_GPU_COSYVOICE_REVISION"],
    capabilities: { voiceCloning: true, voiceDesign: false, multilingual: true, languages: ["zh", "en", "ja", "ko", "de", "es", "fr", "it", "ru"],
      emotionControl: false, speedControl: true, streaming: false, batch: true, maxChars: 600, presets: [] },
  },
  "gpt-sovits": {
    id: "gpt-sovits", kind: "self-hosted", gated: null, requires: ["VOICE_GPU_GPTSOVITS_URL", "VOICE_GPU_GPTSOVITS_REVISION"],
    // Chinese/Cantonese need the G2PW model, which the image does not download.
    capabilities: { voiceCloning: true, voiceDesign: false, multilingual: true, languages: ["en", "ja", "ko"],
      emotionControl: false, speedControl: true, streaming: false, batch: true, maxChars: 400, presets: [] },
  },
};

export const DEFAULT_VOICE_ENGINES = "fal-minimax:90,openai-tts:80";

export interface EngineChoice {
  engine: EngineDescriptor | null;
  /** Why each listed engine was passed over (for the job record and the Capability Registry). */
  passedOver: { id: string; reason: string }[];
}

export interface RouteNeeds {
  cloning: boolean;
  language: string;
  emotion?: boolean;
}

export function parseVoiceEngines(spec: string | undefined): { id: string; priority: number }[] {
  return (spec ?? DEFAULT_VOICE_ENGINES).split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [id, p] = s.split(":");
    return { id: id!.trim(), priority: Number(p ?? 50) || 50 };
  }).sort((a, b) => b.priority - a.priority);
}

export function routeVoice(needs: RouteNeeds, env: Record<string, string | undefined>): EngineChoice {
  const passedOver: EngineChoice["passedOver"] = [];
  for (const { id } of parseVoiceEngines(env.VOICE_ENGINES)) {
    const d = ENGINE_REGISTRY[id];
    if (!d) { passedOver.push({ id, reason: "unknown engine" }); continue; }
    if (d.gated) { passedOver.push({ id, reason: d.gated }); continue; }
    // The licence registry (W14; Part 4 §141): an engine that is not cleared never speaks.
    const licence = licenceStatus(id, env);
    if (!licence.cleared) { passedOver.push({ id, reason: `licence: ${licence.reasons.join("; ")}` }); continue; }
    const missing = d.requires.filter((k) => !env[k]);
    if (missing.length) { passedOver.push({ id, reason: `not configured (${missing.join(", ")})` }); continue; }
    if (needs.cloning && !d.capabilities.voiceCloning) { passedOver.push({ id, reason: "cannot speak in a cloned voice" }); continue; }
    if (!needs.cloning && !d.capabilities.presets.length) { passedOver.push({ id, reason: "has no built-in voices (speaks enrolled voices only)" }); continue; }
    const langs = d.capabilities.languages;
    if (langs !== "any" && !langs.includes(needs.language.slice(0, 2))) { passedOver.push({ id, reason: `does not speak ${needs.language}` }); continue; }
    return { engine: d, passedOver };
  }
  return { engine: null, passedOver };
}
