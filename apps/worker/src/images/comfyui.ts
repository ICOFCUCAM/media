/**
 * The `comfyui` image provider: CineForge's own image runtime (apps/gpu-image,
 * ComfyUI on a GPU; docs/73), behind the Media Runtime Gateway.
 *
 *   text only        → registry workflow cineforge.still.t2i@1 (Qwen-Image)
 *   referenceUrls    → cineforge.still.ref@1 (Qwen-Image-Edit-2511, up to 3
 *                      reference images); if that run fails the still is drawn
 *                      from text and the reason is kept (referenceGap)
 *
 * Each still is one signed `image:run` grant: the GPU writes it through a
 * one-time PUT URL to exactly the key the caller asked for, and the result is
 * accepted only after the stored bytes are read back and their sha256 checked.
 * The record names the seed, the model, the registry workflow (id, version,
 * graph hash) and the runtime (ComfyUI commit).
 *
 * Off unless IMAGE_PROVIDERS names `comfyui` and it is configured:
 *   COMFYUI_GPU_URL      the pod's URL (registered with gateway:admin)
 *   GPU_JWT_SIGNING_KEY  the worker's Ed25519 signing key (shared with video)
 *   S3_BUCKET + S3_ACCESS_KEY (+ S3_SECRET_KEY …)  to presign the one-time URLs
 * A placeholder still (a pod in CINEFORGE_PLACEHOLDER=1) is refused unless
 * ALLOW_PLACEHOLDER_MEDIA=1, exactly like placeholder clips.
 */
import { createHash } from "node:crypto";

import {
  COMFY_MAX_REFERENCES,
  COMFY_WORKFLOWS,
  ComfyImageClient,
  fitImageSize,
  GatewayDeniedError,
  type ComfyImageRequest,
  type ImageRunResult,
} from "@cineforge/model-adapters";
import { STILL_NEGATIVE } from "@cineforge/movie";

import type { GeneratedImage, ImageOptions, ImageProvider, ImageProviderStatus } from "./providers";

type Env = Record<string, string | undefined>;

export interface ComfyRunner {
  generate(req: ComfyImageRequest): Promise<ImageRunResult>;
}

const REQUIRED = ["COMFYUI_GPU_URL", "GPU_JWT_SIGNING_KEY", "S3_BUCKET", "S3_ACCESS_KEY"] as const;

export function comfyuiStatus(env: Env): ImageProviderStatus & { missing: string[] } {
  const missing = REQUIRED.filter((k) => !env[k]);
  return { id: "comfyui", configured: missing.length === 0, gated: null, missing };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const clients = new Map<string, Promise<ComfyRunner>>();
/** One client per pod URL (its authority caches the image attestation). */
function defaultRunner(env: Env): Promise<ComfyRunner> {
  const url = env.COMFYUI_GPU_URL!;
  let c = clients.get(url);
  if (!c) {
    // Lazy: the gateway store loads Prisma; nothing is imported until a still is drawn.
    c = import("../gateway").then(({ buildImageGatewayAuthority }) =>
      new ComfyImageClient({ baseUrl: url, authorizer: buildImageGatewayAuthority(env as NodeJS.ProcessEnv) }));
    clients.set(url, c);
  }
  return c;
}

export function comfyImageProvider(env: Env, runner?: ComfyRunner): ImageProvider {
  const allowPlaceholder = env.ALLOW_PLACEHOLDER_MEDIA === "1";
  const run = async (req: ComfyImageRequest) => (runner ?? (await defaultRunner(env))).generate(req);

  const draw = async (prompt: string, key: string, size: { width: number; height: number }, seed: number, refs: string[]): Promise<ImageRunResult> => {
    const fitted = fitImageSize(size.width, size.height);
    const inputUrls = Object.fromEntries(refs.map((u, i) => [`ref-${i}.png`, u]));
    const out = await run({
      payload: {
        workflow: refs.length ? COMFY_WORKFLOWS.reference : COMFY_WORKFLOWS.textToImage,
        prompt, negativePrompt: STILL_NEGATIVE, seed, width: fitted.width, height: fitted.height,
        ...(refs.length ? { referenceImageKeys: Object.keys(inputUrls) } : {}),
      },
      outputKey: key,
      ...(refs.length ? { inputUrls } : {}),
    });
    if (!out.realExecution && !allowPlaceholder) {
      // Never self-certify (DOS-70): a placeholder still is not a still.
      throw new Error("PLACEHOLDER_RESULT: the image runtime ran no model (CINEFORGE_PLACEHOLDER pod)");
    }
    return out;
  };

  const toImage = (out: ImageRunResult, prompt: string, extra: Partial<GeneratedImage>): GeneratedImage => ({
    key: out.imageKey,
    provider: "comfyui-image",
    model: out.workflow.modelLabel ?? out.workflow.id,
    seed: out.seed,
    sha256: out.sha256,
    promptSha256: sha(prompt),
    width: out.width,
    height: out.height,
    workflow: { id: out.workflow.id, version: out.workflow.version, sha256: out.workflow.sha256 },
    runtime: out.runtime,
    ...extra,
  });

  return {
    id: "comfyui-image",
    model: "qwen-image",
    seeds: true,
    references: true,
    async generate(prompt: string, key: string, size: { width: number; height: number }, opts?: ImageOptions): Promise<GeneratedImage> {
      const seed = opts?.seed ?? Math.floor(Math.random() * 2 ** 31);
      const asked = opts?.referenceUrls ?? [];
      const refs = asked.slice(0, COMFY_MAX_REFERENCES);
      let gap: string | undefined;
      if (refs.length) {
        try {
          const out = await draw(prompt, key, size, seed, refs);
          return toImage(out, prompt, {
            referencesUsed: Number(out.execution?.referencesUsed ?? refs.length),
            ...(asked.length > refs.length ? { referenceGap: `the reference workflow takes ${COMFY_MAX_REFERENCES} images; ${asked.length - refs.length} not used` } : {}),
          });
        } catch (e) {
          // A gateway refusal is not a model failure: it is never papered over by another workflow.
          if (e instanceof GatewayDeniedError) throw e;
          gap = `cineforge.still.ref: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
        }
      }
      const out = await draw(prompt, key, size, seed, []);
      return toImage(out, prompt, refs.length ? { referencesUsed: 0, referenceGap: gap } : {});
    },
  };
}

/**
 * The image runtime's own /capabilities (status-scope token), for the
 * Capability Registry. Null when not listed, not configured or unreachable:
 * a stopped pod is simply not verified, never reported as working.
 */
export async function comfyCapabilities(env: Env): Promise<Record<string, unknown> | null> {
  const listed = (env.IMAGE_PROVIDERS ?? "").split(",").map((s) => s.trim()).includes("comfyui");
  if (!listed || !comfyuiStatus(env).configured) return null;
  try {
    const client = (await defaultRunner(env)) as ComfyRunner & { capabilities?: () => Promise<Record<string, unknown> | null> };
    return (await client.capabilities?.()) ?? null;
  } catch {
    return null;
  }
}
