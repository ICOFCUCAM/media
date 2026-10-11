/**
 * Client for CineForge's self-hosted image runtime (apps/gpu-image: ComfyUI
 * behind CineForge's own API; docs/73). Every call goes through the image
 * gateway authority: a signed `image:run` token per still, one-time I/O URLs,
 * and a result accepted only after the stored still is verified.
 *
 *   POST /images (x-cineforge-async: 1) → 202 {taskId}
 *   GET  /images/jobs/{taskId}           → queued | running | done + result | error
 *
 * Polls carry a fresh status-scope token each. A proxy hiccup while polling
 * (network error, 5xx/524) is retried until the call's timeout; an unknown
 * task (the pod restarted) or a refused poll fails the still.
 */
import type { ImageCallAuthorizer, ImageGrantHandle, ImagePayload, ImageRunResult } from "../gateway/image-authority";

export interface ComfyImageClientOptions {
  baseUrl: string;
  authorizer: ImageCallAuthorizer;
  /** Longest a still may take in all, queueing included (default 20 min). */
  timeoutMs?: number;
  pollMaxMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ComfyImageRequest {
  payload: ImagePayload;
  outputKey: string;
  /** One-time URLs Cineforge already signed for some inputs, by input key. */
  inputUrls?: Record<string, string>;
}

export class ComfyImageError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ComfyImageError";
  }
}

export class ComfyImageClient {
  private readonly fetch: typeof fetch;
  constructor(private readonly opts: ComfyImageClientOptions) {
    this.fetch = opts.fetchImpl ?? fetch;
  }

  private get base() {
    return this.opts.baseUrl.replace(/\/+$/, "");
  }

  async generate(req: ComfyImageRequest, signal?: AbortSignal): Promise<ImageRunResult> {
    const prepared = await this.opts.authorizer.prepareImage({ baseUrl: this.base, payload: req.payload, outputKey: req.outputKey, inputUrls: req.inputUrls });
    const grant = prepared.grant;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 20 * 60_000);
    if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    try {
      const res = await this.fetch(`${this.base}/images`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cineforge-async": "1", ...prepared.headers },
        body: prepared.body,
        signal: ctrl.signal,
      });
      if (!res.ok) await this.fail(grant, res.status, await res.text());
      const out = res.status === 202
        ? await this.awaitTask(((await res.json()) as { taskId: string }).taskId, ctrl.signal, grant)
        : ((await res.json()) as ImageRunResult);
      return await grant.complete(out);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") await grant.fail("ABORTED");
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  private async fail(grant: ImageGrantHandle, status: number, text: string): Promise<never> {
    await grant.fail(`HTTP_${status}`);
    let code = `HTTP_${status}`;
    try {
      const d = JSON.parse(text) as { detail?: { error?: string } };
      code = d.detail?.error ?? code;
    } catch {
      /* not JSON */
    }
    throw new ComfyImageError(status, code, `gpu-image /images ${status}: ${text.slice(0, 300)}`);
  }

  private async awaitTask(taskId: string, signal: AbortSignal, grant: ImageGrantHandle): Promise<ImageRunResult> {
    const path = `/images/jobs/${encodeURIComponent(taskId)}`;
    const max = this.opts.pollMaxMs ?? 3_000;
    for (let wait = Math.min(400, max); ; wait = Math.min(wait * 2, max)) {
      await sleep(wait, signal);
      let res: Response;
      try {
        res = await this.fetch(`${this.base}${path}`, { headers: await this.opts.authorizer.statusHeaders(this.base), signal });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e;
        continue;
      }
      if (res.status >= 500) continue;
      if (!res.ok) await this.fail(grant, res.status, await res.text());
      const state = (await res.json()) as
        | { status: "queued" | "running" }
        | { status: "done"; result: ImageRunResult }
        | { status: "error"; httpStatus: number; detail: unknown };
      if (state.status === "done") return state.result;
      if (state.status === "error") await this.fail(grant, state.httpStatus, JSON.stringify({ detail: state.detail }));
    }
  }

  async capabilities(): Promise<Record<string, unknown> | null> {
    try {
      const res = await this.fetch(`${this.base}/capabilities`, { headers: await this.opts.authorizer.statusHeaders(this.base) });
      return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    }, { once: true });
  });
}

/** The size a registry workflow accepts closest to the one asked for (apps/gpu-image registry.fit_size). */
export function fitImageSize(width: number, height: number, o: { multiple?: number; maxMegapixels?: number; lo?: number; hi?: number } = {}): { width: number; height: number } {
  const multiple = o.multiple ?? 16;
  const lo = o.lo ?? 256;
  const hi = o.hi ?? 2048;
  const scale = Math.min(1, Math.sqrt(((o.maxMegapixels ?? 2.1) * 1_000_000) / Math.max(1, width * height)));
  const snap = (v: number) => Math.max(lo, Math.min(hi, Math.floor(v / multiple) * multiple));
  return { width: snap(width * scale), height: snap(height * scale) };
}

/** Registry workflow ids the worker uses (apps/gpu-image/workflows/manifest.json). */
export const COMFY_WORKFLOWS = {
  textToImage: { id: "cineforge.still.t2i", version: 1 },
  reference: { id: "cineforge.still.ref", version: 1 },
} as const;
/** Reference images the reference workflow takes (TextEncodeQwenImageEditPlus image1..image3). */
export const COMFY_MAX_REFERENCES = 3;
