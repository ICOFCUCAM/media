import type { HealthStatus, ModelCapabilities, ShotRequest, ShotResult, VideoModelAdapter } from "../types";
import type { RunpodClient } from "../runpod-client";
import { estimateShotMs, MODEL_VERSIONS } from "../cost";

/**
 * Wan 2.2 (W28; docs/38 §E: the license-safe production candidate, Apache-2.0).
 * Self-hosted on the same GPU service as Wan 2.1 with MODEL_NAME=wan-2.2:
 * the TI2V-5B model makes 720p at 24 fps from text or animates the shot's
 * approved still (image-to-video); the 14B A14B image-to-video model can be
 * added on an 80 GB GPU. Same gateway, same job contract as Wan 2.1.
 */
export class Wan22Adapter implements VideoModelAdapter {
  readonly id = "wan-2.2";

  constructor(private readonly gpu: RunpodClient) {}

  capabilities(): ModelCapabilities {
    return {
      id: this.id,
      displayName: "Wan 2.2",
      version: MODEL_VERSIONS[this.id],
      class: "primary",
      maxDurationSec: 5,
      resolutions: [
        { width: 1280, height: 704 },
        { width: 704, height: 1280 },
      ],
      supportsReferenceImage: true,
      supportsReferenceVideo: false,
      supportsLora: true,
      supportsSeed: true,
      tiers: ["FREE", "CREATOR", "STUDIO", "ENTERPRISE"],
    };
  }

  estimateCost(req: ShotRequest): number {
    return estimateShotMs(this.id, req);
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
        fps: req.fps ?? 24, // Wan 2.2 TI2V-5B is a 24 fps model
        referenceImageKeys: req.referenceImageKeys,
        referenceVideoKeys: req.referenceVideoKeys,
        videoOp: req.videoOp,
        motionStrength: req.motionStrength,
        loraKeys: req.loraKeys,
        loraSha256: req.loraSha256,
        camera: req.camera as unknown as Record<string, unknown>,
        extra: req.extra,
      },
      signal,
      req.job,
    );
    return {
      videoKey: out.videoKey, thumbnailKey: out.thumbnailKey, seed: out.seed, gpuMs: out.gpuMs,
      width: out.width, height: out.height, durationSec: out.durationSec,
      timing: out.timing, execution: out.execution, realExecution: out.realExecution,
    };
  }

  runtimeCapabilities(): Promise<Record<string, unknown> | null> {
    return this.gpu.capabilities();
  }

  async healthcheck(): Promise<HealthStatus> {
    const h = await this.gpu.health();
    return { healthy: h.status === "ok" || h.status === "healthy", modelLoaded: h.modelLoaded };
  }
}
