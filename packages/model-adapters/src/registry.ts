import { VideoModelAdapter, ModelCapabilities } from "./types";
import { RunpodClient } from "./runpod-client";
import type { GpuCallAuthorizer } from "./gateway/authority";
import { WanAdapter } from "./wan/wan.adapter";
import { HunyuanAdapter } from "./hunyuan/hunyuan.adapter";
import { ExternalApiAdapter } from "./external/external.adapter";
import { FalAdapter } from "./fal-adapter";

/**
 * Central registry of video models. The API/worker resolve a model by `id`;
 * the frontend lists `listCapabilities()` at GET /models. New providers
 * (Kling, Veo, CogVideoX) register here and become available everywhere with
 * zero frontend changes.
 */
export class ModelRegistry {
  private adapters = new Map<string, VideoModelAdapter>();

  register(adapter: VideoModelAdapter): this {
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  get(id: string): VideoModelAdapter {
    const a = this.adapters.get(id);
    if (!a) throw new Error(`Unknown modelId "${id}". Registered: ${[...this.adapters.keys()].join(", ")}`);
    return a;
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  listCapabilities(): ModelCapabilities[] {
    return [...this.adapters.values()].map((a) => a.capabilities());
  }
}

export interface BuildRegistryEnv {
  WAN_GPU_URL: string;
  HUNYUAN_GPU_URL: string;
  /** @deprecated Never sent to GPU pods (docs/39 F2); only the RunPod control API uses it. */
  RUNPOD_API_KEY?: string;
}

/**
 * Default registry: Wan 2.1 (primary) + Hunyuan Video (premium), both backed by
 * RunPod A40 48GB GPU workers.
 */
export function buildDefaultRegistry(env: BuildRegistryEnv): ModelRegistry {
  const wanGpu = new RunpodClient({ baseUrl: env.WAN_GPU_URL });
  const hunyuanGpu = new RunpodClient({ baseUrl: env.HUNYUAN_GPU_URL });

  return new ModelRegistry()
    .register(new WanAdapter(wanGpu))
    .register(new HunyuanAdapter(hunyuanGpu));
}

/** Round-robin over a list of worker URLs (docs/24 §C5 multi-GPU dispatch). */
export function roundRobin(urls: string[]): () => string {
  let i = 0;
  return () => urls[i++ % urls.length]!;
}

export interface BuildClusterEnv {
  /** Comma-separated worker URLs per model (falls back to the single URL). */
  WAN_GPU_URLS?: string;
  WAN_GPU_URL?: string;
  HUNYUAN_GPU_URLS?: string;
  HUNYUAN_GPU_URL?: string;
  /** @deprecated Never sent to GPU pods (docs/39 F2); only the RunPod control API uses it. */
  RUNPOD_API_KEY?: string;
  /** Drop-in external provider (text/image-to-video). Keyless models stay self-hosted. */
  EXTERNAL_VIDEO_API_URL?: string;
  EXTERNAL_VIDEO_API_KEY?: string;
  EXTERNAL_VIDEO_MODEL_ID?: string;
  EXTERNAL_VIDEO_MODEL_NAME?: string;
  EXTERNAL_VIDEO_MAX_SEC?: string;
  /** fal.ai premium tier ("cinematic"): one key, frontier models, parallel shots. */
  FAL_KEY?: string;
  FAL_MODEL_ID?: string;
  FAL_T2V_MODEL?: string;
  FAL_I2V_MODEL?: string;
  FAL_V2V_MODEL?: string;
}

/**
 * Runtime hooks the external adapter needs but can't read from env: resolving a
 * private seed-frame key to a fetchable URL, and mirroring the finished clip
 * into our own storage. Supplied by the worker (which owns storage).
 */
export interface ExternalHooks {
  resolveImageUrl?: (key: string) => Promise<string>;
  resolveVideoUrl?: (key: string) => Promise<string>;
  upload?: (videoUrl: string) => Promise<string>;
  /** Persist raw clip bytes into our storage (fal mirrors results); returns the key. */
  saveVideo?: (key: string, bytes: Uint8Array, contentType: string) => Promise<string>;
  /** Read a (small) asset's bytes — fal uploads the seed still to its own CDN. */
  getImageBytes?: (key: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
  /** Read a reference video's bytes for video-to-video conditioning. */
  getVideoBytes?: (key: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
  /** Media Runtime Gateway authority for self-hosted GPU workers (docs/39). */
  gpuAuthorizer?: GpuCallAuthorizer;
}

/**
 * Cluster registry: each model is backed by N workers, dispatched round-robin
 * so a multi-GPU pool is actually utilized. Health/least-load routing plugs in
 * via @cineforge/gpu GpuClusterRouter; this provides the simple default. An
 * external provider is registered automatically when EXTERNAL_VIDEO_API_URL is
 * set — drop a key in and the model appears everywhere.
 */
export function buildClusterRegistry(env: BuildClusterEnv, hooks: ExternalHooks = {}): ModelRegistry {
  const urlsOf = (csv?: string, single?: string) =>
    (csv ?? single ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const wanUrls = urlsOf(env.WAN_GPU_URLS, env.WAN_GPU_URL);
  const hunyuanUrls = urlsOf(env.HUNYUAN_GPU_URLS, env.HUNYUAN_GPU_URL);

  const registry = new ModelRegistry();
  if (wanUrls.length) {
    registry.register(
      new WanAdapter(new RunpodClient({ resolveBaseUrl: roundRobin(wanUrls), authorizer: hooks.gpuAuthorizer })),
    );
  }
  if (hunyuanUrls.length) {
    registry.register(
      new HunyuanAdapter(new RunpodClient({ resolveBaseUrl: roundRobin(hunyuanUrls), authorizer: hooks.gpuAuthorizer })),
    );
  }
  if (env.FAL_KEY && hooks.saveVideo) {
    registry.register(
      new FalAdapter({
        apiKey: env.FAL_KEY,
        id: env.FAL_MODEL_ID,
        t2vModel: env.FAL_T2V_MODEL,
        i2vModel: env.FAL_I2V_MODEL,
        v2vModel: env.FAL_V2V_MODEL,
        getImageBytes: hooks.getImageBytes,
        getVideoBytes: hooks.getVideoBytes,
        resolveImageUrl: hooks.resolveImageUrl,
        saveVideo: hooks.saveVideo,
      }),
    );
  }
  if (env.EXTERNAL_VIDEO_API_URL) {
    registry.register(
      new ExternalApiAdapter({
        id: env.EXTERNAL_VIDEO_MODEL_ID ?? "external-video",
        displayName: env.EXTERNAL_VIDEO_MODEL_NAME ?? "External Video",
        baseUrl: env.EXTERNAL_VIDEO_API_URL,
        apiKey: env.EXTERNAL_VIDEO_API_KEY,
        maxDurationSec: env.EXTERNAL_VIDEO_MAX_SEC ? Number(env.EXTERNAL_VIDEO_MAX_SEC) : undefined,
        resolveImageUrl: hooks.resolveImageUrl,
        resolveVideoUrl: hooks.resolveVideoUrl,
        upload: hooks.upload,
      }),
    );
  }
  return registry;
}
