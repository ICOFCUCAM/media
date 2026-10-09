/**
 * The Voice Engine boundary (DirectorOS Part 4 §158, §168, §173–174; W7).
 *
 * Every voice model — a cloud API today, self-hosted Qwen3-TTS / CosyVoice /
 * GPT-SoVITS later — implements this interface. CineForge never calls a
 * model's own functions, never stores a model's internal representation in
 * its own schema (engine artifacts are opaque, per engine), and never lets
 * the frontend know which model spoke.
 */

export type ConsentType = "self" | "authorised";

export interface VoiceCapabilities {
  voiceCloning: boolean;
  voiceDesign: boolean;
  multilingual: boolean;
  languages: string[] | "any";
  emotionControl: boolean;
  speedControl: boolean;
  streaming: boolean;
  batch: boolean;
  /** Longest text one synthesis call takes; longer scripts are segmented first. */
  maxChars: number;
}

export interface VoiceStyle {
  emotion?: string;
  /** 0..1 */
  energy?: number;
  /** 0.5..2 */
  speed?: number;
  /** semitones */
  pitch?: number;
}

export interface VoiceEnrollmentRequest {
  voiceId: string;
  language: string;
  /** Local path of the (analysed) reference recording. */
  referencePath: string;
}

/** Engine-specific representation of a voice — stored opaquely in voice_engine_artifacts. */
export interface VoiceEngineArtifact {
  artifactType: VoiceArtifactType;
  /** Opaque reference: a provider voice id, an object-storage key, … */
  uri: string;
  metadata?: Record<string, unknown>;
}

export interface VoiceEnrollmentResult {
  artifacts: VoiceEngineArtifact[];
}

export interface SpeechSynthesisRequest {
  text: string;
  language: string;
  /** The engine's artifact for a cloned voice, or null for the engine's stock narrator. */
  voice: VoiceEngineArtifact | null;
  style?: VoiceStyle;
  /** Local path to write the raw audio to. */
  outPath: string;
}

export interface SpeechSynthesisResult {
  path: string;
  format: "mp3" | "wav";
}

export interface EngineHealth {
  ok: boolean;
  detail?: string;
}

export interface VoiceEngine {
  readonly id: string;
  readonly version: string;
  getCapabilities(): VoiceCapabilities;
  enrollVoice(request: VoiceEnrollmentRequest): Promise<VoiceEnrollmentResult>;
  synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult>;
  health(): Promise<EngineHealth>;
  unload(): Promise<void>;
}

/** What an engine may keep for an enrolled voice (voice_engine_artifacts.artifact_type). */
export const VOICE_ARTIFACT_TYPES = ["provider_voice_id", "speaker_embedding", "prompt_audio", "reference_audio", "adapter_weights"] as const;
export type VoiceArtifactType = (typeof VOICE_ARTIFACT_TYPES)[number];

/** Job states (§164). */
export const VOICE_JOB_STATES = ["queued", "claimed", "loading_model", "generating", "post_processing", "completed", "failed", "cancelled"] as const;
export type VoiceJobState = (typeof VOICE_JOB_STATES)[number];

const NEXT: Record<VoiceJobState, VoiceJobState[]> = {
  queued: ["claimed", "cancelled", "failed"],
  claimed: ["loading_model", "failed", "cancelled"],
  loading_model: ["generating", "failed", "cancelled"],
  generating: ["post_processing", "failed", "cancelled"],
  post_processing: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: VoiceJobState, to: VoiceJobState): boolean {
  return NEXT[from].includes(to);
}

export const VOICE_JOB_TYPES = ["voice.enroll", "speech.synthesis", "speech.batch"] as const;
export type VoiceJobType = (typeof VOICE_JOB_TYPES)[number];
