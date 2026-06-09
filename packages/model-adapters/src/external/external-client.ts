/**
 * Generic client for an EXTERNAL hosted video API (text-to-video and
 * image-to-video). Unlike the self-hosted Wan/Hunyuan workers — which run on a
 * RunPod GPU you operate — an external provider is one you "drop a key into".
 *
 * The provider must speak this small contract (or sit behind a thin shim):
 *
 *   POST {baseUrl}/generate
 *     { prompt, negative_prompt?, seed?, seconds, width, height, fps?, image_url? }
 *   → 200 { status: "succeeded", video_url, seed? }            // synchronous
 *     or  { id }                                                // asynchronous
 *
 *   GET {baseUrl}/tasks/{id}
 *   → { status: "processing" | "succeeded" | "failed", video_url?, error? }
 *
 * Seed frames are passed as a URL (image_url): the worker resolves a private
 * storage key to a signed URL via `resolveImageUrl`. The finished clip is
 * mirrored into our own storage via `upload` (so DB rows reference our keys,
 * not a vendor URL); without `upload` the remote URL is returned as the key.
 */

export interface ExternalVideoClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Private storage key → a URL the provider can fetch (e.g. a signed URL). */
  resolveImageUrl?: (key: string) => Promise<string>;
  /** Private storage key → a URL for a reference video (video-to-video). */
  resolveVideoUrl?: (key: string) => Promise<string>;
  /** Persist the finished clip to our storage; return its key. */
  upload?: (videoUrl: string) => Promise<string>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export interface ExternalGenerateInput {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  durationSec: number;
  width: number;
  height: number;
  fps?: number;
  /** Seed frame storage key — present for image-to-video. */
  imageKey?: string;
  /** Reference video storage key — present for video-to-video (motion style). */
  videoKey?: string;
  /** Video-to-video operation + strength. */
  videoOp?: string;
  motionStrength?: number;
}

export interface ExternalGenerateOutput {
  /** Our storage key if `upload` was provided, else the provider's video URL. */
  videoKey: string;
  videoUrl: string;
  seed: number;
  durationSec: number;
  width: number;
  height: number;
}

interface ProviderResponse {
  id?: string;
  status?: string;
  video_url?: string;
  seed?: number;
  error?: string;
}

export class ExternalVideoClient {
  private readonly fetch: typeof fetch;
  constructor(private readonly opts: ExternalVideoClientOptions) {
    if (!opts.baseUrl) throw new Error("ExternalVideoClient: baseUrl required");
    this.fetch = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiKey) h["authorization"] = `Bearer ${this.opts.apiKey}`;
    return h;
  }

  async generate(input: ExternalGenerateInput, signal?: AbortSignal): Promise<ExternalGenerateOutput> {
    const ctrl = new AbortController();
    const timeoutMs = this.opts.timeoutMs ?? 15 * 60_000;
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    if (signal) signal.addEventListener("abort", () => ctrl.abort());
    try {
      const imageUrl = input.imageKey && this.opts.resolveImageUrl ? await this.opts.resolveImageUrl(input.imageKey) : undefined;
      const resolveVideo = this.opts.resolveVideoUrl ?? this.opts.resolveImageUrl;
      const referenceVideoUrl = input.videoKey && resolveVideo ? await resolveVideo(input.videoKey) : undefined;

      const submit = await this.post(`${this.opts.baseUrl}/generate`, {
        prompt: input.prompt,
        negative_prompt: input.negativePrompt,
        seed: input.seed,
        seconds: input.durationSec,
        width: input.width,
        height: input.height,
        fps: input.fps,
        image_url: imageUrl,
        reference_video_url: referenceVideoUrl,
        operation: input.videoOp,
        motion_strength: input.motionStrength,
      }, ctrl.signal);

      const final = submit.video_url ? submit : await this.poll(submit, ctrl.signal);
      if (!final.video_url) throw new Error(`external provider returned no video_url (status ${final.status ?? "unknown"})`);

      const videoUrl = final.video_url;
      const videoKey = this.opts.upload ? await this.opts.upload(videoUrl) : videoUrl;
      const seed = final.seed ?? submit.seed ?? input.seed ?? Math.floor(Math.random() * 1_000_000_000);

      return { videoKey, videoUrl, seed, durationSec: input.durationSec, width: input.width, height: input.height };
    } finally {
      clearTimeout(t);
    }
  }

  private async poll(initial: ProviderResponse, signal: AbortSignal): Promise<ProviderResponse> {
    if (!initial.id) return initial;
    const interval = this.opts.pollIntervalMs ?? 3_000;
    // The outer AbortController bounds total time; loop until terminal status.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal.aborted) throw new Error("external provider: timed out");
      const res = await this.get(`${this.opts.baseUrl}/tasks/${initial.id}`, signal);
      if (res.status === "succeeded") return res;
      if (res.status === "failed") throw new Error(`external provider failed: ${res.error ?? "unknown error"}`);
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  private async post(url: string, body: unknown, signal: AbortSignal): Promise<ProviderResponse> {
    const res = await this.fetch(url, { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`external provider POST ${res.status}: ${await res.text()}`);
    return (await res.json()) as ProviderResponse;
  }

  private async get(url: string, signal: AbortSignal): Promise<ProviderResponse> {
    const res = await this.fetch(url, { headers: this.headers(), signal });
    if (!res.ok) throw new Error(`external provider GET ${res.status}: ${await res.text()}`);
    return (await res.json()) as ProviderResponse;
  }

  async health(): Promise<{ healthy: boolean; detail?: string }> {
    try {
      const res = await this.fetch(`${this.opts.baseUrl}/health`, { headers: this.headers() });
      return { healthy: res.ok, detail: res.ok ? undefined : `status ${res.status}` };
    } catch (e) {
      return { healthy: false, detail: e instanceof Error ? e.message : "unreachable" };
    }
  }
}
