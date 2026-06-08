import { VideoModelAdapter, ModelCapabilities } from "./types";
import { RunpodClient } from "./runpod-client";
import { WanAdapter } from "./wan/wan.adapter";
import { HunyuanAdapter } from "./hunyuan/hunyuan.adapter";

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
  RUNPOD_API_KEY?: string;
}

/**
 * Default registry: Wan 2.1 (primary) + Hunyuan Video (premium), both backed by
 * RunPod A40 48GB GPU workers.
 */
export function buildDefaultRegistry(env: BuildRegistryEnv): ModelRegistry {
  const wanGpu = new RunpodClient({ baseUrl: env.WAN_GPU_URL, apiKey: env.RUNPOD_API_KEY });
  const hunyuanGpu = new RunpodClient({ baseUrl: env.HUNYUAN_GPU_URL, apiKey: env.RUNPOD_API_KEY });

  return new ModelRegistry()
    .register(new WanAdapter(wanGpu))
    .register(new HunyuanAdapter(hunyuanGpu));
}
