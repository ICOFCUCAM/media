/**
 * Image providers (DirectorOS Part 2 §106; W6). One registry for every still
 * CineForge generates — seed frames, wardrobe references — instead of each
 * call site building its own client.
 *
 *   IMAGE_PROVIDERS   ordered list, default "openai". The first configured
 *                     provider that is not gated is used.
 *
 *   openai   GPT-image (API). Configured with OPENAI_API_KEY and storage.
 *   comfyui  self-hosted ComfyUI workflows (docs/38 Phases 6–8). GATED: no
 *            ComfyUI or model work until Phase 1 (GPU execution security,
 *            docs/39) is operationally complete — listed so the registry and
 *            the Capability Registry say so, never silently skipped.
 */
import { buildOpenAIProviders } from "@cineforge/model-adapters";

export interface ImageProvider {
  readonly id: string;
  /** Generate a still from `prompt` and store it at `key`; returns the stored key. */
  generate(prompt: string, key: string, size: { width: number; height: number }): Promise<string>;
}

export interface ImageProviderStatus {
  id: string;
  configured: boolean;
  gated: string | null;
}

type Env = Record<string, string | undefined>;
type Put = (key: string, bytes: Uint8Array, contentType: string) => Promise<string>;

const KNOWN: Record<string, (env: Env, put: Put) => { status: ImageProviderStatus; provider: ImageProvider | null }> = {
  openai: (env, put) => {
    const configured = Boolean(env.OPENAI_API_KEY && env.S3_BUCKET);
    return {
      status: { id: "openai", configured, gated: null },
      provider: configured
        ? {
            id: "openai-image",
            async generate(prompt, key, size) {
              const { image } = buildOpenAIProviders(env as never, (bytes, ct) => put(key, bytes, ct));
              if (!image) throw new Error("image provider unavailable");
              return (await image.generate({ prompt, width: size.width, height: size.height })).imageKey;
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

export function imageProviderStatuses(env: Env = process.env): ImageProviderStatus[] {
  const ids = (env.IMAGE_PROVIDERS ?? "openai").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.map((id) => KNOWN[id]?.(env, async () => "").status ?? { id, configured: false, gated: "unknown image provider" });
}

/** The image provider to use, or null with the reason (recorded by the caller). */
export function imageProvider(put: Put, env: Env = process.env): { provider: ImageProvider | null; reason: string | null } {
  if (env.IMAGE_PROVIDERS?.trim() === "none") return { provider: null, reason: "image generation disabled (IMAGE_PROVIDERS=none)" };
  const ids = (env.IMAGE_PROVIDERS ?? "openai").split(",").map((s) => s.trim()).filter(Boolean);
  const reasons: string[] = [];
  for (const id of ids) {
    const built = KNOWN[id]?.(env, put);
    if (!built) { reasons.push(`${id}: unknown`); continue; }
    if (built.status.gated) { reasons.push(`${id}: ${built.status.gated}`); continue; }
    if (built.provider) return { provider: built.provider, reason: null };
    reasons.push(`${id}: not configured`);
  }
  return { provider: null, reason: reasons.join("; ") || "no image provider listed" };
}
