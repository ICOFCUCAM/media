/**
 * Image providers (DirectorOS Part 2 §69, §95, §106; W6, W17). One registry for
 * every still CineForge generates — seed frames and candidates, wardrobe,
 * location and prop references — instead of each call site building its own
 * client. Every provider returns what it made: the stored key, the provider
 * and model, the seed it drew with (null when the provider takes none), the
 * stored object's sha256 and the prompt's sha256 — the Image Engine's record.
 *
 *   IMAGE_PROVIDERS   ordered list, default "openai,fal". Every configured,
 *                     ungated provider is used in that order: when one fails
 *                     (a revoked key, an outage) the still is drawn by the next,
 *                     and the record names the provider that made it.
 *
 *   openai   GPT-image (API). Configured with OPENAI_API_KEY and storage. No seeds.
 *   fal      a hosted text-to-image model on fal (FAL_IMAGE_MODEL, default
 *            Flux dev). Configured with FAL_KEY and storage. Takes a seed, so a
 *            still can be drawn again exactly.
 *   comfyui  self-hosted ComfyUI workflows (docs/38 Phases 6–8). GATED: no
 *            ComfyUI or model work until Phase 1 (GPU execution security,
 *            docs/39) is operationally complete — listed so the registry and
 *            the Capability Registry say so, never silently skipped.
 */
import { createHash } from "node:crypto";
import { buildOpenAIProviders, falFindUrl, falRunQueue } from "@cineforge/model-adapters";

export interface GeneratedImage {
  key: string;
  provider: string;
  model: string | null;
  /** The seed the still was drawn with; null when the provider takes none. */
  seed: number | null;
  /** sha256 of the stored bytes. */
  sha256: string | null;
  promptSha256: string;
  width: number;
  height: number;
  /** Reference images the still was conditioned on (W24); 0 or absent = text only. */
  referencesUsed?: number;
  /** Why references that were asked for were not used. */
  referenceGap?: string;
}

export interface ImageProvider {
  readonly id: string;
  readonly model: string | null;
  /** Whether a seed reproduces a still. */
  readonly seeds: boolean;
  /** Whether it can condition a still on reference images (W24). */
  readonly references?: boolean;
  /** Generate a still from `prompt` and store it at `key` (conditioned on `referenceUrls` when it can). */
  generate(prompt: string, key: string, size: { width: number; height: number }, opts?: ImageOptions): Promise<GeneratedImage>;
}

export interface ImageOptions {
  seed?: number;
  /** Readable URLs of reference images (identity, wardrobe, set, look), most important first. */
  referenceUrls?: string[];
}

/** The aspect ratios multi-reference models take; the nearest to a size (pure). */
const ASPECTS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"] as const;
export function nearestAspect(width: number, height: number): (typeof ASPECTS)[number] {
  const r = width / height;
  const ratio = (a: string) => { const [x, y] = a.split(":").map(Number); return x! / y!; };
  return ASPECTS.reduce((best, a) => (Math.abs(Math.log(ratio(a) / r)) < Math.abs(Math.log(ratio(best) / r)) ? a : best), ASPECTS[0]);
}

/** Most reference images one still is conditioned on. */
export const MAX_REFERENCE_IMAGES = 4;

export interface ImageProviderStatus {
  id: string;
  configured: boolean;
  gated: string | null;
}

type Env = Record<string, string | undefined>;
type Put = (key: string, bytes: Uint8Array, contentType: string) => Promise<string>;

export const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** A put that remembers the sha256 of what it stored, per key. */
function hashingPut(put: Put): { put: Put; sha: Map<string, string> } {
  const sha = new Map<string, string>();
  return { sha, put: async (key, bytes, ct) => { sha.set(key, sha256Hex(bytes)); return put(key, bytes, ct); } };
}

/** fal's text-to-image call, injectable for tests. */
export interface FalImageDeps {
  run(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  fetch(url: string): Promise<{ ok: boolean; status: number; bytes: Uint8Array; contentType: string }>;
}

const defaultFalDeps = (key: string): FalImageDeps => ({
  run: (model, input) => falRunQueue(key, model, input, { timeoutMs: 5 * 60_000 }),
  fetch: async (url) => {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "image/png" };
  },
});

const KNOWN: Record<string, (env: Env, put: Put, fal?: FalImageDeps) => { status: ImageProviderStatus; provider: ImageProvider | null }> = {
  openai: (env, rawPut) => {
    const configured = Boolean(env.OPENAI_API_KEY && env.S3_BUCKET);
    const model = env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
    return {
      status: { id: "openai", configured, gated: null },
      provider: configured
        ? {
            id: "openai-image", model, seeds: false, references: false,
            async generate(prompt, key, size, opts) {
              const { put, sha } = hashingPut(rawPut);
              const { image } = buildOpenAIProviders(env as never, (bytes, ct) => put(key, bytes, ct));
              if (!image) throw new Error("image provider unavailable");
              const out = await image.generate({ prompt, width: size.width, height: size.height });
              return {
                key: out.imageKey, provider: "openai-image", model, seed: null, sha256: sha.get(key) ?? null, promptSha256: sha256Hex(prompt), width: out.width, height: out.height,
                ...(opts?.referenceUrls?.length ? { referencesUsed: 0, referenceGap: "openai-image draws from text only" } : {}),
              };
            },
          }
        : null,
    };
  },
  fal: (env, rawPut, deps) => {
    const configured = Boolean(env.FAL_KEY && env.S3_BUCKET);
    const model = env.FAL_IMAGE_MODEL ?? "fal-ai/flux/dev";
    return {
      status: { id: "fal", configured, gated: null },
      provider: configured
        ? {
            id: "fal-image", model, seeds: true, references: true,
            async generate(prompt, key, size, opts) {
              const d = deps ?? defaultFalDeps(env.FAL_KEY!);
              const seed = opts?.seed ?? Math.floor(Math.random() * 2 ** 31);
              const refs = (opts?.referenceUrls ?? []).slice(0, MAX_REFERENCE_IMAGES);
              const store = async (result: Record<string, unknown>, used: string, extra: Partial<GeneratedImage>) => {
                const url = falFindUrl(result);
                if (!url) throw new Error(`image model returned no image (${JSON.stringify(result).slice(0, 200)})`);
                const res = await d.fetch(url);
                if (!res.ok) throw new Error(`image download ${res.status}`);
                if (!res.bytes.length) throw new Error("image model returned an empty image");
                const stored = await rawPut(key, res.bytes, res.contentType);
                return { key: stored, provider: "fal-image", model: used, seed, sha256: sha256Hex(res.bytes), promptSha256: sha256Hex(prompt), width: size.width, height: size.height, ...extra };
              };
              // Conditioned on the reference images (W24): who they are, what they wear, the set, the look.
              let gap: string | undefined;
              if (refs.length) {
                const refModel = env.FAL_REFERENCE_IMAGE_MODEL ?? "fal-ai/flux-pro/kontext/multi";
                try {
                  const result = await d.run(refModel, { prompt, image_urls: refs, seed, num_images: 1, aspect_ratio: nearestAspect(size.width, size.height), output_format: "png" });
                  return await store(result, refModel, { referencesUsed: refs.length });
                } catch (e) {
                  gap = `${refModel}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
                }
              }
              const result = await d.run(model, { prompt, image_size: { width: size.width, height: size.height }, seed, num_images: 1, enable_safety_checker: true });
              return store(result, model, refs.length ? { referencesUsed: 0, referenceGap: gap } : {});
            },
          }
        : null,
    };
  },
  comfyui: () => ({
    status: { id: "comfyui", configured: false, gated: "ComfyUI runtime waits on Phase 1 (docs/39) being operationally complete" },
    provider: null,
  }),
};

const DEFAULT_PROVIDERS = "openai,fal";

export function imageProviderStatuses(env: Env = process.env): ImageProviderStatus[] {
  const ids = (env.IMAGE_PROVIDERS ?? DEFAULT_PROVIDERS).split(",").map((s) => s.trim()).filter(Boolean);
  return ids.map((id) => KNOWN[id]?.(env, async () => "").status ?? { id, configured: false, gated: "unknown image provider" });
}

/** The image provider to use, or null with the reason (recorded by the caller). */
export function imageProvider(put: Put, env: Env = process.env, fal?: FalImageDeps): { provider: ImageProvider | null; reason: string | null } {
  if (env.IMAGE_PROVIDERS?.trim() === "none") return { provider: null, reason: "image generation disabled (IMAGE_PROVIDERS=none)" };
  const ids = (env.IMAGE_PROVIDERS ?? DEFAULT_PROVIDERS).split(",").map((s) => s.trim()).filter(Boolean);
  const reasons: string[] = [];
  const usable: ImageProvider[] = [];
  for (const id of ids) {
    const built = KNOWN[id]?.(env, put, fal);
    if (!built) { reasons.push(`${id}: unknown`); continue; }
    if (built.status.gated) { reasons.push(`${id}: ${built.status.gated}`); continue; }
    if (built.provider) usable.push(built.provider);
    else reasons.push(`${id}: not configured`);
  }
  if (!usable.length) return { provider: null, reason: reasons.join("; ") || "no image provider listed" };
  return { provider: usable.length === 1 ? usable[0]! : withFallback(usable), reason: null };
}

/**
 * Providers in order: the first that succeeds makes the still. A failure is
 * not silent: when every provider fails, the error names each one's reason.
 */
export function withFallback(providers: ImageProvider[]): ImageProvider {
  const [first] = providers;
  return {
    id: first!.id,
    model: first!.model,
    seeds: first!.seeds,
    references: providers.some((p) => p.references),
    async generate(prompt, key, size, opts) {
      const failures: string[] = [];
      // With reference images, the providers that can use them go first (W24).
      const order = opts?.referenceUrls?.length ? [...providers.filter((p) => p.references), ...providers.filter((p) => !p.references)] : providers;
      for (const p of order) {
        try {
          return await p.generate(prompt, key, size, opts);
        } catch (e) {
          failures.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
        }
      }
      throw new Error(failures.join(" | "));
    },
  };
}

/** A stable seed for candidate `i` of a subject: the same shot draws the same candidates again. */
export function candidateSeed(subject: string, i: number): number {
  return (parseInt(sha256Hex(subject).slice(0, 8), 16) + i * 7919) % 2 ** 31;
}
