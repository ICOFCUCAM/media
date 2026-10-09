/**
 * Voice model router (§167–168): which engine serves a request is
 * configuration, never CineForge code.
 *
 *   VOICE_ENGINES = "fal-minimax:90,openai-tts:80,qwen3-tts:100"
 *
 * Each entry is id:priority. Engines the registry knows but that may not run
 * yet are reported with the reason (never silently skipped):
 *   qwen3-tts, cosyvoice-3, gpt-sovits  self-hosted GPU models — gated: no
 *       model work until Phase 1 (docs/39) is operationally complete, and each
 *       needs its licence registry entry and owner approval (Part 4 §130, §141)
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
const SELF_HOSTED_GATE = "self-hosted voice model — waits on Phase 1 (docs/39) being operationally complete";

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
  "qwen3-tts": {
    id: "qwen3-tts", kind: "self-hosted", gated: SELF_HOSTED_GATE, requires: ["VOICE_GPU_URL"],
    capabilities: { voiceCloning: true, voiceDesign: true, multilingual: true, languages: ANY, emotionControl: true, speedControl: true, streaming: false, batch: true, maxChars: 600, presets: [] },
  },
  "cosyvoice-3": {
    id: "cosyvoice-3", kind: "self-hosted", gated: SELF_HOSTED_GATE, requires: ["VOICE_GPU_URL"],
    capabilities: { voiceCloning: true, voiceDesign: false, multilingual: true, languages: ANY, emotionControl: true, speedControl: true, streaming: true, batch: true, maxChars: 600, presets: [] },
  },
  "gpt-sovits": {
    id: "gpt-sovits", kind: "self-hosted", gated: SELF_HOSTED_GATE, requires: ["VOICE_GPU_URL"],
    capabilities: { voiceCloning: true, voiceDesign: false, multilingual: true, languages: ["en", "zh", "ja", "ko", "yue"], emotionControl: false, speedControl: true, streaming: false, batch: true, maxChars: 400, presets: [] },
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
    const langs = d.capabilities.languages;
    if (langs !== "any" && !langs.includes(needs.language.slice(0, 2))) { passedOver.push({ id, reason: `does not speak ${needs.language}` }); continue; }
    return { engine: d, passedOver };
  }
  return { engine: null, passedOver };
}
