/**
 * FalAdapter — premium "Cinematic" tier via fal.ai's model marketplace.
 *
 * fal exposes frontier video models (Kling, MiniMax, Veo, …) behind one
 * queue API: submit → poll → download. We default to Kling v2.1 standard,
 * image-to-video when the shot has a seed still (the OpenAI scene painting
 * drives the look) and text-to-video otherwise. Generations run on fal's
 * fleet, so shots render in parallel in ~1-3 wall minutes regardless of our
 * own GPU. The finished clip is mirrored into our storage so the rest of the
 * pipeline (render engine, players) never knows the difference.
 *
 * gpuMs reported is wall time — the billing proxy for an external provider.
 */
import type { HealthStatus, ModelCapabilities, ShotRequest, ShotResult, VideoModelAdapter } from "./types";
import { estimateShotMs } from "./cost";

export interface FalAdapterOptions {
  apiKey: string;
  /** Registry id (what project.modelId routes on). */
  id?: string;
  /** fal queue model paths. */
  t2vModel?: string;
  i2vModel?: string;
  timeoutMs?: number;
  /** Storage key of a seed still → something fal can fetch (URL or data URI). */
  resolveImageUrl?: (key: string) => Promise<string>;
  /** Persist the finished clip into our storage; returns the key. */
  saveVideo: (key: string, bytes: Uint8Array, contentType: string) => Promise<string>;
  fetchImpl?: typeof fetch;
}

const QUEUE = "https://queue.fal.run";

export class FalAdapter implements VideoModelAdapter {
  readonly id: string;
  readonly name = "Cinematic (fal.ai)";
  private readonly fetch: typeof fetch;

  constructor(private readonly opts: FalAdapterOptions) {
    this.id = opts.id ?? "cinematic";
    this.fetch = opts.fetchImpl ?? fetch;
  }

  capabilities(): ModelCapabilities {
    return {
      id: this.id,
      displayName: this.name,
      version: "fal-kling-2.1",
      class: "external",
      maxDurationSec: 10,
      resolutions: [
        { width: 1280, height: 720 },
        { width: 720, height: 1280 },
      ],
      supportsReferenceImage: true,
      supportsReferenceVideo: false,
      supportsLora: false, // hosted providers can't load our private LoRA artifacts
      supportsSeed: true,
      tiers: ["STUDIO", "ENTERPRISE"],
    };
  }

  // External providers bill per generation in USD; surface a GPU-ms-equivalent
  // so quota/pre-flight checks (docs/24 §C8) stay uniform.
  estimateCost(req: ShotRequest): number {
    return estimateShotMs("wan-2.1", req);
  }

  async healthcheck(): Promise<HealthStatus> {
    return { healthy: true, modelLoaded: true, detail: "fal.ai queue (per-job errors surface on submit)" };
  }

  async generate(req: ShotRequest, signal?: AbortSignal): Promise<ShotResult> {
    const start = Date.now();
    const deadline = start + (this.opts.timeoutMs ?? 12 * 60_000);

    const seedKey = req.referenceImageKeys?.[0];
    const useI2v = Boolean(seedKey && this.opts.resolveImageUrl);
    const model = useI2v
      ? (this.opts.i2vModel ?? "fal-ai/kling-video/v2.1/standard/image-to-video")
      : (this.opts.t2vModel ?? "fal-ai/kling-video/v2.1/standard/text-to-video");

    const input: Record<string, unknown> = {
      prompt: req.prompt.slice(0, 2000),
      duration: req.durationSec > 5 ? "10" : "5",
      negative_prompt: req.negativePrompt,
      aspect_ratio: req.height > req.width ? "9:16" : "16:9",
    };
    if (useI2v) input.image_url = await this.opts.resolveImageUrl!(seedKey!);

    // 1) Submit to the queue.
    const submitted = (await this.api(`${QUEUE}/${model}`, { method: "POST", body: JSON.stringify(input) }, signal)) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };
    if (!submitted.request_id) throw new Error(`fal submit returned no request_id (${JSON.stringify(submitted).slice(0, 200)})`);
    const statusUrl = submitted.status_url ?? `${QUEUE}/${model}/requests/${submitted.request_id}/status`;
    const responseUrl = submitted.response_url ?? `${QUEUE}/${model}/requests/${submitted.request_id}`;

    // 2) Poll until done.
    for (;;) {
      if (signal?.aborted) throw new Error("fal generation aborted");
      if (Date.now() > deadline) throw new Error(`fal generation timed out (${model})`);
      const st = (await this.api(statusUrl, { method: "GET" }, signal)) as { status?: string; error?: unknown };
      if (st.status === "COMPLETED") break;
      if (st.status === "FAILED" || st.status === "CANCELLED")
        throw new Error(`fal generation ${st.status}: ${JSON.stringify(st.error ?? "").slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 3000));
    }

    // 3) Fetch the result; find the clip URL across model output shapes.
    const result = (await this.api(responseUrl, { method: "GET" }, signal)) as Record<string, unknown>;
    const videoUrl = findVideoUrl(result);
    if (!videoUrl) throw new Error(`fal result has no video url (${JSON.stringify(result).slice(0, 300)})`);

    // 4) Mirror into our storage.
    const res = await this.fetch(videoUrl, { signal });
    if (!res.ok) throw new Error(`fal clip download ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const key = `_generated/${this.id}/${submitted.request_id}.mp4`;
    await this.opts.saveVideo(key, bytes, "video/mp4");

    return {
      videoKey: key,
      seed: req.seed ?? 0,
      gpuMs: Date.now() - start,
      width: req.width,
      height: req.height,
      durationSec: req.durationSec,
    };
  }

  private async api(url: string, init: { method: string; body?: string }, signal?: AbortSignal): Promise<unknown> {
    const res = await this.fetch(url, {
      ...init,
      signal,
      headers: { "content-type": "application/json", authorization: `Key ${this.opts.apiKey}` },
    });
    if (!res.ok) throw new Error(`fal ${init.method} ${url.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}

/** Output shapes vary per model: {video:{url}}, {video_url}, {output:{video:{url}}}… */
function findVideoUrl(obj: unknown, depth = 0): string | undefined {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.url === "string" && rec.url.includes(".mp4")) return rec.url;
  if (typeof rec.video_url === "string") return rec.video_url;
  for (const v of Object.values(rec)) {
    const found = findVideoUrl(v, depth + 1);
    if (found) return found;
  }
  return undefined;
}
