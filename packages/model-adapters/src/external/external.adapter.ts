import {
  VideoModelAdapter,
  ShotRequest,
  ShotResult,
  ModelCapabilities,
  HealthStatus,
} from "../types";
import { estimateShotMs } from "../cost";
import { ExternalVideoClient } from "./external-client";

export interface ExternalAdapterOptions {
  /** modelId used everywhere (frontend, registry, shots.model_id). */
  id: string;
  displayName: string;
  version?: string;
  baseUrl: string;
  apiKey?: string;
  maxDurationSec?: number;
  tiers?: ModelCapabilities["tiers"];
  /** Whether the provider supports video-to-video (default true). */
  supportsReferenceVideo?: boolean;
  resolveImageUrl?: (key: string) => Promise<string>;
  resolveVideoUrl?: (key: string) => Promise<string>;
  upload?: (videoUrl: string) => Promise<string>;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * EXTERNAL model adapter — wraps a hosted text/image-to-video API behind the
 * same `VideoModelAdapter` contract as the self-hosted Wan/Hunyuan models.
 * "Drop a key in" (EXTERNAL_VIDEO_API_URL + EXTERNAL_VIDEO_API_KEY) and it
 * appears at GET /models and is dispatchable like any other model — no API or
 * frontend changes. Seed frames (image-to-video) flow via
 * `ShotRequest.referenceImageKeys`.
 */
export class ExternalApiAdapter implements VideoModelAdapter {
  readonly id: string;
  private readonly client: ExternalVideoClient;

  constructor(private readonly opts: ExternalAdapterOptions) {
    this.id = opts.id;
    this.client = new ExternalVideoClient({
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      resolveImageUrl: opts.resolveImageUrl,
      resolveVideoUrl: opts.resolveVideoUrl,
      upload: opts.upload,
      timeoutMs: opts.timeoutMs,
      pollIntervalMs: opts.pollIntervalMs,
      fetchImpl: opts.fetchImpl,
    });
  }

  capabilities(): ModelCapabilities {
    return {
      id: this.id,
      displayName: this.opts.displayName,
      version: this.opts.version,
      class: "external",
      maxDurationSec: this.opts.maxDurationSec ?? 10,
      resolutions: [
        { width: 1280, height: 720 },
        { width: 720, height: 1280 },
      ],
      supportsReferenceImage: true,
      supportsReferenceVideo: this.opts.supportsReferenceVideo ?? true,
      supportsLora: false, // hosted providers can't load our private LoRA artifacts
      supportsSeed: true,
      tiers: this.opts.tiers ?? ["CREATOR", "STUDIO", "ENTERPRISE"],
    };
  }

  // External providers bill per generation in USD, not GPU-ms; we surface a
  // GPU-ms-equivalent so quota/pre-flight checks (docs/24 §C8) stay uniform.
  estimateCost(req: ShotRequest): number {
    return estimateShotMs("wan-2.1", req);
  }

  async generate(req: ShotRequest, signal?: AbortSignal): Promise<ShotResult> {
    const out = await this.client.generate(
      {
        prompt: req.prompt,
        negativePrompt: req.negativePrompt,
        seed: req.seed,
        durationSec: req.durationSec,
        width: req.width,
        height: req.height,
        fps: req.fps,
        imageKey: req.referenceImageKeys?.[0],
        videoKey: req.referenceVideoKeys?.[0],
        videoOp: req.videoOp,
        motionStrength: req.motionStrength,
      },
      signal,
    );
    return {
      videoKey: out.videoKey,
      seed: out.seed,
      gpuMs: this.estimateCost(req),
      width: out.width,
      height: out.height,
      durationSec: out.durationSec,
    };
  }

  async healthcheck(): Promise<HealthStatus> {
    const h = await this.client.health();
    return { healthy: h.healthy, modelLoaded: h.healthy, detail: h.detail };
  }
}
