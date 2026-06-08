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

export type AudioKindJob = "voice" | "music" | "sfx";

export interface AudioJob {
  projectId: string;
  sceneId: string;
  kind: AudioKindJob;
  /** dialogue line id / music cue id / sfx cue id depending on kind. */
  refId?: string;
}

export interface RenderJob {
  projectId: string;
  kind: "preview" | "final" | "scene";
  sceneId?: string;
}

export interface JobPayloads {
  [QUEUES.film]: FilmJob;
  [QUEUES.scene]: SceneJob;
  [QUEUES.video]: VideoJob;
  [QUEUES.audio]: AudioJob;
  [QUEUES.render]: RenderJob;
}
