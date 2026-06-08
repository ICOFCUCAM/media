import {
  VideoModelAdapter,
  ShotRequest,
  ShotResult,
  ModelCapabilities,
  HealthStatus,
} from "../types";
import { RunpodClient } from "../runpod-client";

/**
 * Wan 2.1 — the PRIMARY model. Self-hosted on a RunPod A40 48GB GPU worker.
 * Default for all tiers; cheapest GPU-seconds per shot.
 */
export class WanAdapter implements VideoModelAdapter {
  readonly id = "wan-2.1";

  constructor(private readonly gpu: RunpodClient) {}

  capabilities(): ModelCapabilities {
    return {
      id: this.id,
      displayName: "Wan 2.1",
      class: "primary",
      maxDurationSec: 5, // per-clip; scenes stitch multiple clips
      resolutions: [
        { width: 832, height: 480 },
        { width: 1280, height: 720 },
      ],
      supportsReferenceImage: true,
      supportsSeed: true,
      tiers: ["FREE", "CREATOR", "STUDIO", "ENTERPRISE"],
    };
  }

  estimateCost(req: ShotRequest): number {
    // Rough GPU-ms estimate on A40 48GB; calibrate from real telemetry.
    const pixels = req.width * req.height;
    const base = 9_000; // ms baseline per ~5s clip @ 480p
    const resFactor = pixels / (832 * 480);
    return Math.round(base * resFactor * (req.durationSec / 5));
  }

  async generate(req: ShotRequest, signal?: AbortSignal): Promise<ShotResult> {
    const out = await this.gpu.generate(
      {
        prompt: req.prompt,
        negativePrompt: req.negativePrompt,
        seed: req.seed,
        durationSec: req.durationSec,
        width: req.width,
        height: req.height,
        fps: req.fps ?? 16,
        referenceImageKeys: req.referenceImageKeys,
        camera: req.camera as unknown as Record<string, unknown>,
        extra: req.extra,
      },
      signal,
    );
    return {
      videoKey: out.videoKey,
      thumbnailKey: out.thumbnailKey,
      seed: out.seed,
      gpuMs: out.gpuMs,
      width: out.width,
      height: out.height,
      durationSec: out.durationSec,
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    const h = await this.gpu.health();
    return { healthy: h.status === "ok" || h.status === "healthy", modelLoaded: h.modelLoaded };
  }
}
