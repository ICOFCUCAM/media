import {
  VideoModelAdapter,
  ShotRequest,
  ShotResult,
  ModelCapabilities,
  HealthStatus,
} from "../types";
import { RunpodClient } from "../runpod-client";
import { estimateShotMs, MODEL_VERSIONS } from "../cost";

/**
 * Hunyuan Video — the PREMIUM model. Self-hosted on a RunPod A40 48GB GPU
 * worker. Higher fidelity, more GPU-seconds; gated to Studio/Enterprise tiers.
 */
export class HunyuanAdapter implements VideoModelAdapter {
  readonly id = "hunyuan";

  constructor(private readonly gpu: RunpodClient) {}

  capabilities(): ModelCapabilities {
    return {
      id: this.id,
      displayName: "Hunyuan Video",
      version: MODEL_VERSIONS[this.id],
      class: "premium",
      maxDurationSec: 5,
      resolutions: [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
      ],
      supportsReferenceImage: true,
      supportsReferenceVideo: false, // the pod's pipeline has no v2v path (500s) — fal handles it
      supportsLora: true,
      supportsSeed: true,
      tiers: ["STUDIO", "ENTERPRISE"],
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
        fps: req.fps ?? 24,
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
