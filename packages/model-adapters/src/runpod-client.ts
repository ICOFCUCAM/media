/**
 * Thin client for a self-hosted GPU worker running on RunPod (A40 48GB).
 *
 * Works against either a RunPod Serverless endpoint or an on-demand pod that
 * exposes the gpu-worker FastAPI service (see apps/gpu-worker). The worker runs
 * inference, uploads the clip to S3, and returns the S3 key + measured gpuMs —
 * so we never pay per-generation vendor fees, only GPU-seconds.
 */

export interface RunpodClientOptions {
  /** Base URL of the gpu-worker service (serverless endpoint or pod). */
  baseUrl?: string;
  /**
   * Per-call URL resolver for multi-GPU routing (docs/24 §C5). When provided it
   * takes precedence over `baseUrl`, so each request can be routed to a
   * different worker in the pool (round-robin / least-loaded).
   */
  resolveBaseUrl?: () => string;
  apiKey?: string; // RunPod token when calling the serverless API
  timeoutMs?: number;
}

export interface GpuGenerateInput {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  durationSec: number;
  width: number;
  height: number;
  fps?: number;
  referenceImageKeys?: string[];
  camera?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface GpuGenerateOutput {
  videoKey: string;
  thumbnailKey?: string;
  seed: number;
  gpuMs: number;
  width: number;
  height: number;
  durationSec: number;
}

export class RunpodClient {
  constructor(private readonly opts: RunpodClientOptions) {
    if (!opts.baseUrl && !opts.resolveBaseUrl) {
      throw new Error("RunpodClient: provide baseUrl or resolveBaseUrl");
    }
  }

  /** Resolve the target worker URL for this call (routing-aware). */
  private url(): string {
    return this.opts.resolveBaseUrl ? this.opts.resolveBaseUrl() : this.opts.baseUrl!;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiKey) h["authorization"] = `Bearer ${this.opts.apiKey}`;
    return h;
  }

  async generate(input: GpuGenerateInput, signal?: AbortSignal): Promise<GpuGenerateOutput> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 15 * 60_000);
    if (signal) signal.addEventListener("abort", () => ctrl.abort());
    try {
      const res = await fetch(`${this.url()}/generate`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(input),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`gpu-worker /generate ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as GpuGenerateOutput;
    } finally {
      clearTimeout(t);
    }
  }

  async health(): Promise<{ status: string; modelLoaded: boolean }> {
    const res = await fetch(`${this.url()}/health`, { headers: this.headers() });
    if (!res.ok) return { status: "down", modelLoaded: false };
    return (await res.json()) as { status: string; modelLoaded: boolean };
  }

  async warm(): Promise<void> {
    await fetch(`${this.url()}/warm`, { method: "POST", headers: this.headers() });
  }
}
