import type { ExecutionReport } from "./types";
/**
 * Thin client for a self-hosted GPU worker running on RunPod (A40 48GB).
 *
 * Works against an on-demand pod that exposes the gpu-worker FastAPI service
 * (see apps/gpu-worker). The worker runs inference, writes the clip, and
 * returns its key + measured gpuMs — so we never pay per-generation vendor
 * fees, only GPU-seconds.
 *
 * Every call goes through the Media Runtime Gateway when an authorizer is
 * configured (docs/39): it chooses the deployment-bound, body-bound execution
 * token and, for generation, the one-time storage URLs and output keys. The
 * RunPod account API key is never sent to a pod.
 */
import type { GpuCallAuthorizer, GrantHandle } from "./gateway/authority";
import type { JobContext } from "./gateway/types";

export interface RunpodClientOptions {
  /** Base URL of the gpu-worker service (serverless endpoint or pod). */
  baseUrl?: string;
  /**
   * Per-call URL resolver for multi-GPU routing (docs/24 §C5). When provided it
   * takes precedence over `baseUrl`, so each request can be routed to a
   * different worker in the pool (round-robin / least-loaded).
   */
  resolveBaseUrl?: () => string;
  /** Media Runtime Gateway authority (apps/worker wires it). */
  authorizer?: GpuCallAuthorizer;
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
  referenceVideoKeys?: string[];
  videoOp?: string;
  motionStrength?: number;
  loraKeys?: string[];
  loraSha256?: Record<string, string>;
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
  videoBytes?: number;
  /**
   * What the worker actually produced, measured from the file (docs/38 §AV.5).
   * Raw wire JSON: Cineforge parses and judges it; absent on older images.
   */
  timing?: unknown;
  /** What actually ran (mode, conditioning, real frames, inputs ignored). Absent on older images. */
  execution?: ExecutionReport;
  /** False for placeholder output. Absent on older images. */
  realExecution?: boolean;
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

  async generate(input: GpuGenerateInput, signal?: AbortSignal, job?: JobContext): Promise<GpuGenerateOutput> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 15 * 60_000);
    if (signal) signal.addEventListener("abort", () => ctrl.abort());
    const base = this.url();
    let grant: GrantHandle | null = null;
    try {
      let body = JSON.stringify(input);
      let auth: Record<string, string> = {};
      if (this.opts.authorizer) {
        const prepared = await this.opts.authorizer.prepare({ baseUrl: base, path: "/generate", scope: "video:run", payload: { ...input }, job });
        body = prepared.body ?? body;
        auth = prepared.headers;
        grant = prepared.grant;
      }
      const res = await fetch(`${base}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", ...auth },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        await grant?.fail(`HTTP_${res.status}`);
        throw new Error(`gpu-worker /generate ${res.status}: ${text}`);
      }
      const out = (await res.json()) as GpuGenerateOutput;
      if (!grant) return out;
      const verified = await grant.complete(out);
      return { ...out, videoKey: verified.videoKey, thumbnailKey: verified.thumbnailKey ?? undefined };
    } catch (e) {
      if (grant && (e as Error)?.name === "AbortError") await grant.fail("ABORTED");
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  private async authHeaders(base: string, path: string, scope: "status" | "warm"): Promise<Record<string, string>> {
    if (!this.opts.authorizer) return {};
    return (await this.opts.authorizer.prepare({ baseUrl: base, path, scope })).headers;
  }

  async health(): Promise<{ status: string; modelLoaded: boolean }> {
    const base = this.url();
    try {
      const res = await fetch(`${base}/health`, { headers: await this.authHeaders(base, "/health", "status") });
      if (!res.ok) return { status: "down", modelLoaded: false };
      return (await res.json()) as { status: string; modelLoaded: boolean };
    } catch {
      return { status: "down", modelLoaded: false };
    }
  }

  /** The worker's runtime identity: model, revisions, gateway mode, source commit, code digest. */
  async capabilities(): Promise<Record<string, unknown> | null> {
    const base = this.url();
    try {
      const res = await fetch(`${base}/capabilities`, { headers: await this.authHeaders(base, "/capabilities", "status") });
      return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  async warm(): Promise<void> {
    const base = this.url();
    await fetch(`${base}/warm`, { method: "POST", headers: await this.authHeaders(base, "/warm", "warm") });
  }
}
