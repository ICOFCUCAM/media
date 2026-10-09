/**
 * Provider endpoints from the environment (docs/38 §AF checklist 2). Every
 * call site that talks to an AI, compute, email or stock provider reads its
 * base URL here, so a deployment can point at a proxy, a regional endpoint or
 * a test double without a code change. The public defaults live in this one
 * table and nowhere else. (Social platforms a film is published TO are
 * destinations, not interchangeable providers, and stay with their adapters.)
 */

export const PROVIDER_HOSTS = {
  openai: { env: "OPENAI_BASE_URL", default: "https://api.openai.com/v1" },
  fal_queue: { env: "FAL_QUEUE_URL", default: "https://queue.fal.run" },
  fal_storage: { env: "FAL_STORAGE_URL", default: "https://rest.alpha.fal.ai" },
  runpod: { env: "RUNPOD_API_URL", default: "https://api.runpod.io" },
  resend: { env: "RESEND_API_URL", default: "https://api.resend.com" },
  pexels: { env: "PEXELS_API_URL", default: "https://api.pexels.com" },
  pixabay: { env: "PIXABAY_API_URL", default: "https://pixabay.com/api" },
} as const;

export type ProviderHost = keyof typeof PROVIDER_HOSTS;

/** The provider's base URL (no trailing slash). A configured value must be an absolute http(s) URL. */
export function providerUrl(id: ProviderHost, env: Record<string, string | undefined> = process.env): string {
  const h = PROVIDER_HOSTS[id];
  const raw = env[h.env]?.trim();
  if (!raw) return h.default;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${h.env} must be an absolute URL, got ${JSON.stringify(raw)}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${h.env} must be http(s), got ${u.protocol}`);
  return raw.replace(/\/+$/, "");
}
