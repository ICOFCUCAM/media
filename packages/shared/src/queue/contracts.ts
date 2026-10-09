/**
 * Single source of truth for queue names and job payloads.
 * Imported by the API (producers) and the worker (consumers) so the contract
 * can never drift. See docs/13-queues.md.
 */

export const QUEUES = {
  film: "film-queue",
  scene: "scene-queue",
  video: "video-queue",
  audio: "audio-queue",
  render: "render-queue",
  lora: "lora-queue",
  localize: "localize-queue",
  voiceLab: "voice-lab-queue",
  voiceEngine: "voice-engine-queue",
  social: "social-queue",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface FilmJob {
  projectId: string;
}

export interface SceneJob {
  projectId: string;
  sceneId: string;
  index: number;
}

export interface VideoJob {
  projectId: string;
  sceneId: string;
  shotId: string;
  modelId: string; // resolved from project/tier; e.g. "wan-2.1" | "hunyuan"
}

export type AudioKindJob = "voice" | "music" | "sfx" | "ambience";

export interface AudioJob {
  projectId: string;
  sceneId: string;
  kind: AudioKindJob;
  /** dialogue line id / music cue id / sfx cue id depending on kind. */
  refId?: string;
}

/** Voice Lab (docs/29; W15): speak a reading on the Voice Engine, or animate
 *  a portrait photo into a talking-avatar video. (Voices enroll via voice.enroll.) */
export interface VoiceLabJob {
  kind: "speak" | "avatar";
  /** voiceovers.id for speak, avatar_videos.id for avatar. */
  id: string;
}

/** Voice Engine (W7, docs/51): one voice_jobs row — enroll, synthesis or batch. */
export interface VoiceEngineJob {
  jobId: string;
}

/** Social Launchpad (docs/31): generate the per-platform kit, then post. */
export interface SocialJob {
  kind: "kit" | "launch";
  /** social_launches.id */
  id: string;
}

/** final = assemble and deliver the master; upscale = the 4K master from it (docs/33). */
export interface RenderJob {
  projectId: string;
  kind: "final" | "upscale";
  /** Render from this approved timeline (W19: a locked film); absent = from the current scenes. */
  timelineId?: string;
}

/** Train a per-character LoRA from the character's reference frames (docs/28). */
export interface LoraJob {
  characterId: string;
  projectId?: string;
}

/** Produce subtitle (and optionally dubbed) variants per language (docs/29). */
export interface LocalizeJob {
  projectId: string;
  languages: string[]; // target language codes; e.g. ["es", "fr", "sw"]
}

export interface JobPayloads {
  [QUEUES.film]: FilmJob;
  [QUEUES.scene]: SceneJob;
  [QUEUES.video]: VideoJob;
  [QUEUES.audio]: AudioJob;
  [QUEUES.render]: RenderJob;
  [QUEUES.lora]: LoraJob;
  [QUEUES.localize]: LocalizeJob;
  [QUEUES.voiceLab]: VoiceLabJob;
  [QUEUES.voiceEngine]: VoiceEngineJob;
  [QUEUES.social]: SocialJob;
}
