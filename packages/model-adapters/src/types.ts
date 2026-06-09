/**
 * Video model abstraction layer.
 *
 * The frontend and scene pipeline only ever depend on this interface + a
 * `modelId` string. Adding a new provider (Kling, Veo, CogVideoX, ...) means
 * writing a new adapter and registering it — no API or frontend changes.
 *
 * Primary model:  Wan 2.1        (self-hosted on RunPod A40 48GB)
 * Premium model:  Hunyuan Video  (self-hosted on RunPod A40 48GB)
 */

export type ShotSize = "EWS" | "WS" | "MS" | "MCU" | "CU" | "ECU";
export type CameraMovement =
  | "static" | "pan" | "tilt" | "dolly" | "crane" | "handheld" | "drone";
export type CameraAngle = "eye" | "low" | "high" | "dutch" | "overhead";

export interface CameraPlan {
  shotSize: ShotSize;
  movement: CameraMovement;
  angle: CameraAngle;
  lens?: string; // "35mm", "anamorphic"
}

export interface ShotRequest {
  /** Fully-composed positive prompt (bible + continuity + camera). */
  prompt: string;
  negativePrompt?: string;
  /** S3/HTTP keys of reference images for identity/location conditioning. */
  referenceImageKeys?: string[];
  /**
   * Storage keys of reference videos for VIDEO-TO-VIDEO conditioning — "use this
   * motion style", or a source clip for variation/extension/remaster/sequel.
   */
  referenceVideoKeys?: string[];
  /** Video-to-video operation when a reference video is present. */
  videoOp?: VideoOp;
  /** 0..1 — how strongly the reference video drives the output (motion fidelity). */
  motionStrength?: number;
  /** Deterministic seed for reproducibility / character anchoring. */
  seed?: number;
  durationSec: number;
  width: number;
  height: number;
  fps?: number;
  camera?: CameraPlan;
  /** Free-form, model-specific knobs (motion strength, guidance, steps). */
  extra?: Record<string, unknown>;
}

/** Video-to-video operations (mirror the Video → Video studio). */
export type VideoOp = "variation" | "extend" | "remaster" | "style" | "sequel";

export interface ShotResult {
  /** S3 key of the generated clip (worker uploaded it). */
  videoKey: string;
  thumbnailKey?: string;
  seed: number;
  /** Measured GPU time used — the billing unit. */
  gpuMs: number;
  width: number;
  height: number;
  durationSec: number;
}

export interface ModelCapabilities {
  id: string;
  displayName: string;
  /** Pinned model version for provenance / cache keys (docs/24 §C7). */
  version?: string;
  /** "primary" (Wan 2.1) | "premium" (Hunyuan) | "external" (future APIs) */
  class: "primary" | "premium" | "external";
  maxDurationSec: number;
  resolutions: Array<{ width: number; height: number }>;
  supportsReferenceImage: boolean;
  /** Whether the model can condition on a reference video (video-to-video). */
  supportsReferenceVideo: boolean;
  supportsSeed: boolean;
  /** Tiers allowed to use this model (see docs/15-monetization.md). */
  tiers: Array<"FREE" | "CREATOR" | "STUDIO" | "ENTERPRISE">;
}

export interface HealthStatus {
  healthy: boolean;
  modelLoaded: boolean;
  detail?: string;
}

/**
 * Every video model implements this. Self-hosted models (Wan, Hunyuan) proxy to
 * a RunPod GPU worker; external models (future) call a vendor API. Either way
 * the contract is identical.
 */
export interface VideoModelAdapter {
  readonly id: string;
  capabilities(): ModelCapabilities;
  /** Submit a shot and resolve when the clip is generated + uploaded to S3. */
  generate(req: ShotRequest, signal?: AbortSignal): Promise<ShotResult>;
  /** Estimate cost in GPU-ms (used for quota checks before queuing). */
  estimateCost(req: ShotRequest): number;
  healthcheck(): Promise<HealthStatus>;
}
