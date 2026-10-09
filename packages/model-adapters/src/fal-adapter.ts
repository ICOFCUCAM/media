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
import { providerUrl } from "@cineforge/shared";

export interface FalAdapterOptions {
  apiKey: string;
  /** Registry id (what project.modelId routes on). */
  id?: string;
  /** fal queue model paths. */
  t2vModel?: string;
  i2vModel?: string;
  /** Video-to-video (variations / restyle / remaster of an uploaded clip). */
  v2vModel?: string;
  timeoutMs?: number;
  /** Seed still bytes — uploaded to fal's CDN so the model can always fetch it
   *  (our bucket may be private). Preferred over resolveImageUrl. */
  getImageBytes?: (key: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
  /** Reference-video bytes (video-to-video conditioning) — same CDN handoff. */
  getVideoBytes?: (key: string) => Promise<{ bytes: Uint8Array; contentType: string }>;
  /** Fallback: a public/CDN URL for the seed still (used only if no getImageBytes). */
  resolveImageUrl?: (key: string) => Promise<string>;
  /** Persist the finished clip into our storage; returns the key. */
  saveVideo: (key: string, bytes: Uint8Array, contentType: string) => Promise<string>;
  fetchImpl?: typeof fetch;
}

/** fal endpoints, from FAL_QUEUE_URL / FAL_STORAGE_URL (docs/38 §AF). */
const queueBase = () => providerUrl("fal_queue");
const storageInitiate = () => `${providerUrl("fal_storage")}/storage/upload/initiate?storage_type=fal-cdn-v3`;

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
      supportsReferenceVideo: true, // v2v via FAL_V2V_MODEL (Luma Ray-2 Modify default)
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

    // Resolve the seed still to a URL fal can definitely fetch. Preferred path
    // uploads the bytes to fal's own CDN (our bucket may be private — a public
    // bucket URL gives Kling a file_download_error). If we can't get a usable
    // image, fall through to text-to-video rather than failing the shot.
    const seedKey = req.referenceVideoKeys?.length ? undefined : req.referenceImageKeys?.[0];
    let imageUrl: string | undefined;
    if (seedKey) {
      try {
        if (this.opts.getImageBytes) {
          const { bytes, contentType } = await this.opts.getImageBytes(seedKey);
          try {
            imageUrl = await this.uploadToFalCdn(bytes, contentType, signal);
          } catch {
            // One retry — CDN initiate/PUT can hiccup under parallel shots.
            await new Promise((r) => setTimeout(r, 2000));
            imageUrl = await this.uploadToFalCdn(bytes, contentType, signal);
          }
        } else if (this.opts.resolveImageUrl) {
          imageUrl = await this.opts.resolveImageUrl(seedKey);
        }
      } catch (e) {
        console.warn(`[fal] seed image unusable, using text-to-video:`, e instanceof Error ? e.message : e);
      }
    }
    // Video-to-video (docs/26 ops: variations/restyle/remaster of an uploaded
    // clip): the reference video takes priority over everything else. The clip
    // ships to fal's CDN and the v2v model re-renders it under the prompt.
    let videoUrl2v: string | undefined;
    const refVideoKey = req.referenceVideoKeys?.[0];
    if (refVideoKey && this.opts.getVideoBytes) {
      try {
        const { bytes, contentType } = await this.opts.getVideoBytes(refVideoKey);
        videoUrl2v = await this.uploadToFalCdn(bytes, contentType, signal);
      } catch (e) {
        // Without the source clip a "variation" is meaningless — fail loudly
        // rather than silently producing an unrelated text-to-video.
        throw new Error(`reference video unusable for video-to-video: ${e instanceof Error ? e.message : e}`);
      }
    }

    const useV2v = Boolean(videoUrl2v);
    const useI2v = !useV2v && Boolean(imageUrl);
    // NB: Kling v2.1 "standard" exists only as image-to-video on fal;
    // text-to-video lives under v1.6 standard (v2.1 t2v is master-tier only).
    // V2V default: Luma Ray-2 Modify (restyle/variations of a source clip).
    const model = useV2v
      ? (this.opts.v2vModel ?? "fal-ai/luma-dream-machine/ray-2/modify")
      : useI2v
        ? (this.opts.i2vModel ?? "fal-ai/kling-video/v2.1/standard/image-to-video")
        : (this.opts.t2vModel ?? "fal-ai/kling-video/v1.6/standard/text-to-video");

    const input: Record<string, unknown> = useV2v
      ? { prompt: req.prompt.slice(0, 2000), video_url: videoUrl2v }
      : {
          prompt: req.prompt.slice(0, 2000),
          duration: req.durationSec > 5 ? "10" : "5",
          negative_prompt: req.negativePrompt,
          aspect_ratio: req.height > req.width ? "9:16" : "16:9",
        };
    if (useI2v) input.image_url = imageUrl;

    // 1) Submit to the queue.
    const submitted = (await this.api(`${queueBase()}/${model}`, { method: "POST", body: JSON.stringify(input) }, signal)) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };
    if (!submitted.request_id) throw new Error(`fal submit returned no request_id (${JSON.stringify(submitted).slice(0, 200)})`);
    const statusUrl = submitted.status_url ?? `${queueBase()}/${model}/requests/${submitted.request_id}/status`;
    const responseUrl = submitted.response_url ?? `${queueBase()}/${model}/requests/${submitted.request_id}`;

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

  /** Upload bytes to fal's CDN and return a fal-hosted URL the models can fetch. */
  private async uploadToFalCdn(bytes: Uint8Array, contentType: string, signal?: AbortSignal): Promise<string> {
    const ext = contentType.includes("jpeg") ? "jpg" : contentType.split("/")[1] ?? "png";
    const init = (await this.api(
      storageInitiate(),
      { method: "POST", body: JSON.stringify({ content_type: contentType, file_name: `seed.${ext}` }) },
      signal,
    )) as { upload_url?: string; file_url?: string };
    if (!init.upload_url || !init.file_url) throw new Error(`fal storage initiate returned no urls`);
    const put = await this.fetch(init.upload_url, {
      method: "PUT",
      body: Buffer.from(bytes),
      headers: { "content-type": contentType },
      signal,
    });
    if (!put.ok) throw new Error(`fal storage upload ${put.status}`);
    return init.file_url;
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

// ── Standalone fal helpers (Voice Lab and other non-video fal models) ───────

async function falApi(apiKey: string, url: string, init: { method: string; body?: string }, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    signal,
    headers: { "content-type": "application/json", authorization: `Key ${apiKey}` },
  });
  if (!res.ok) throw new Error(`fal ${init.method} ${url.split("?")[0]} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Upload bytes to fal's CDN; returns a URL any fal model can read. */
export async function falUploadBytes(apiKey: string, bytes: Uint8Array, contentType: string, fileName = "upload.bin", signal?: AbortSignal): Promise<string> {
  const init = (await falApi(
    apiKey,
    storageInitiate(),
    { method: "POST", body: JSON.stringify({ content_type: contentType, file_name: fileName }) },
    signal,
  )) as { upload_url?: string; file_url?: string };
  if (!init.upload_url || !init.file_url) throw new Error("fal storage initiate returned no urls");
  const put = await fetch(init.upload_url, { method: "PUT", body: Buffer.from(bytes), headers: { "content-type": contentType }, signal });
  if (!put.ok) throw new Error(`fal storage upload ${put.status}`);
  return init.file_url;
}

/** Run a fal queue model to completion and return its result object. */
export async function falRunQueue(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  const submitted = (await falApi(apiKey, `${queueBase()}/${model}`, { method: "POST", body: JSON.stringify(input) }, opts.signal)) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  if (!submitted.request_id) throw new Error(`fal submit returned no request_id`);
  const statusUrl = submitted.status_url ?? `${queueBase()}/${model}/requests/${submitted.request_id}/status`;
  const responseUrl = submitted.response_url ?? `${queueBase()}/${model}/requests/${submitted.request_id}`;
  for (;;) {
    if (opts.signal?.aborted) throw new Error("fal aborted");
    if (Date.now() > deadline) throw new Error(`fal timed out (${model})`);
    const st = (await falApi(apiKey, statusUrl, { method: "GET" }, opts.signal)) as { status?: string; error?: unknown };
    if (st.status === "COMPLETED") break;
    if (st.status === "FAILED" || st.status === "CANCELLED")
      throw new Error(`fal ${st.status}: ${JSON.stringify(st.error ?? "").slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  return (await falApi(apiKey, responseUrl, { method: "GET" }, opts.signal)) as Record<string, unknown>;
}

/** Find the first URL-ish string in a fal result (audio/video/file outputs). */
export function falFindUrl(obj: unknown, depth = 0): string | undefined {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.url === "string") return rec.url;
  if (typeof rec.audio_url === "string") return rec.audio_url;
  for (const v of Object.values(rec)) {
    const found = falFindUrl(v, depth + 1);
    if (found) return found;
  }
  return undefined;
}
