import { describe, expect, it } from "vitest";
import { candidateSeed, imageProvider, nearestAspect, imageProviderStatuses, sha256Hex, withFallback, type FalImageDeps, type ImageProvider } from "./providers";
import { imageGenerationRow } from "./ledger";

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

function falDeps() {
  const inputs: Record<string, unknown>[] = [];
  const deps: FalImageDeps = {
    run: async (_model, input) => { inputs.push(input); return { images: [{ url: "https://fal.media/x.png" }] }; },
    fetch: async () => ({ ok: true, status: 200, bytes: PNG, contentType: "image/png" }),
  };
  return { deps, inputs };
}

describe("the Image Engine's providers (Part 2 §69, §95)", () => {
  it("fal is a second hosted provider: seeded, checksummed, stored where asked", async () => {
    const stored = new Map<string, Uint8Array>();
    const { deps, inputs } = falDeps();
    const { provider } = imageProvider(async (k, b) => { stored.set(k, b); return k; }, { IMAGE_PROVIDERS: "fal,openai", FAL_KEY: "k", S3_BUCKET: "b" }, deps);
    expect(provider).toMatchObject({ id: "fal-image", model: "fal-ai/flux/dev", seeds: true });
    const img = await provider!.generate("a lighthouse at dusk", "seeds/s1.png", { width: 1280, height: 720 }, { seed: 42 });
    expect(inputs[0]).toMatchObject({ prompt: "a lighthouse at dusk", image_size: { width: 1280, height: 720 }, seed: 42 });
    expect(img).toEqual({ key: "seeds/s1.png", provider: "fal-image", model: "fal-ai/flux/dev", seed: 42, sha256: sha256Hex(PNG), promptSha256: sha256Hex("a lighthouse at dusk"), width: 1280, height: 720 });
    expect(stored.get("seeds/s1.png")).toEqual(PNG);
  });

  it("an empty or missing image is a failure, never a stored blank", async () => {
    const { deps } = falDeps();
    deps.fetch = async () => ({ ok: true, status: 200, bytes: new Uint8Array(), contentType: "image/png" });
    const { provider } = imageProvider(async (k) => k, { IMAGE_PROVIDERS: "fal", FAL_KEY: "k", S3_BUCKET: "b" }, deps);
    await expect(provider!.generate("x", "k", { width: 8, height: 8 })).rejects.toThrow(/empty image/);
    deps.run = async () => ({ status: "done" });
    await expect(provider!.generate("x", "k", { width: 8, height: 8 })).rejects.toThrow(/no image/);
  });

  it("the registry keeps its order and says why a provider is not used; ComfyUI stays gated", () => {
    expect(imageProvider(async (k) => k, { IMAGE_PROVIDERS: "fal,openai", OPENAI_API_KEY: "k", S3_BUCKET: "b" }).provider?.id).toBe("openai-image");
    expect(imageProvider(async (k) => k, { IMAGE_PROVIDERS: "comfyui,fal" })).toEqual({ provider: null, reason: expect.stringMatching(/comfyui: ComfyUI runtime waits on Phase 1.*fal: not configured/) });
    expect(imageProviderStatuses({ IMAGE_PROVIDERS: "openai,fal", FAL_KEY: "k", S3_BUCKET: "b" })).toEqual([
      { id: "openai", configured: false, gated: null }, { id: "fal", configured: true, gated: null },
    ]);
  });

  it("a shot's candidates have stable, distinct seeds", () => {
    expect(candidateSeed("shot-1", 0)).toBe(candidateSeed("shot-1", 0));
    expect(new Set([0, 1, 2, 3].map((i) => candidateSeed("shot-1", i))).size).toBe(4);
    expect(candidateSeed("shot-1", 0)).not.toBe(candidateSeed("shot-2", 0));
  });

  it("the ledger row carries what made the still and what it shows", () => {
    const img = { key: "k", provider: "fal-image", model: "fal-ai/flux/dev", seed: 7, sha256: "a".repeat(64), promptSha256: "b".repeat(64), width: 1280, height: 720 };
    expect(imageGenerationRow("p", "seed_candidate", "shot-1", img, { candidate: 2, chosen: true })).toMatchObject({ seed: 7n, candidate: 2, chosen: true, sha256: "a".repeat(64) });
    expect(imageGenerationRow("p", "location_reference", "loc_harbour", { ...img, seed: null }, { canonDigest: "c".repeat(64) })).toMatchObject({ seed: null, candidate: null, chosen: null, canonDigest: "c".repeat(64) });
  });
});

describe("provider fallback (a revoked key must not cost every reference still)", () => {
  const p = (id: string, fail?: string): ImageProvider => ({
    id, model: `${id}-m`, seeds: false,
    async generate(_prompt, key) {
      if (fail) throw new Error(fail);
      return { key, provider: id, model: `${id}-m`, seed: null, sha256: null, promptSha256: "x", width: 1, height: 1 };
    },
  });

  it("the next provider draws the still when the first fails, and the record names it", async () => {
    const out = await withFallback([p("openai-image", "OpenAI images 401: Incorrect API key"), p("fal-image")]).generate("a van", "k.png", { width: 1, height: 1 });
    expect(out.provider).toBe("fal-image");
  });

  it("when every provider fails the error names each reason", async () => {
    await expect(withFallback([p("openai-image", "401"), p("fal-image", "quota")]).generate("x", "k", { width: 1, height: 1 }))
      .rejects.toThrow(/openai-image: 401 \| fal-image: quota/);
  });

  it("by default both OpenAI and fal are tried when both are configured", () => {
    const { provider } = imageProvider(async (k) => k, { OPENAI_API_KEY: "k", FAL_KEY: "f", S3_BUCKET: "b" });
    expect(provider?.id).toBe("openai-image");
    expect(imageProviderStatuses({}).map((x) => x.id)).toEqual(["openai", "fal"]);
  });
});

describe("reference-conditioned stills (W24; Part 1 §34–35)", () => {
  const refs = ["https://s3/ref-wardrobe.png", "https://s3/ref-face.png", "https://s3/ref-set.png", "https://s3/ref-look.png", "https://s3/ref-extra.png"];

  it("fal draws from up to four reference images with its multi-reference model", async () => {
    const models: string[] = [];
    const inputs: Record<string, unknown>[] = [];
    const deps: FalImageDeps = {
      run: async (model, input) => { models.push(model); inputs.push(input); return { images: [{ url: "https://fal.media/x.png" }] }; },
      fetch: async () => ({ ok: true, status: 200, bytes: PNG, contentType: "image/png" }),
    };
    const { provider } = imageProvider(async (k) => k, { IMAGE_PROVIDERS: "fal", FAL_KEY: "k", S3_BUCKET: "b" }, deps);
    expect(provider!.references).toBe(true);
    const img = await provider!.generate("Maya on the quay", "s.png", { width: 1280, height: 720 }, { seed: 3, referenceUrls: refs });
    expect(models).toEqual(["fal-ai/flux-pro/kontext/multi"]);
    expect(inputs[0]).toMatchObject({ prompt: "Maya on the quay", image_urls: refs.slice(0, 4), seed: 3, aspect_ratio: "16:9" });
    expect(img).toMatchObject({ model: "fal-ai/flux-pro/kontext/multi", referencesUsed: 4 });
  });

  it("when the reference model fails, the still is drawn from text and the reason is kept", async () => {
    const models: string[] = [];
    const deps: FalImageDeps = {
      run: async (model) => { models.push(model); if (model.includes("kontext")) throw new Error("422 bad image"); return { images: [{ url: "https://fal.media/x.png" }] }; },
      fetch: async () => ({ ok: true, status: 200, bytes: PNG, contentType: "image/png" }),
    };
    const { provider } = imageProvider(async (k) => k, { IMAGE_PROVIDERS: "fal", FAL_KEY: "k", S3_BUCKET: "b", FAL_REFERENCE_IMAGE_MODEL: "fal-ai/flux-pro/kontext/max/multi" }, deps);
    const img = await provider!.generate("p", "s.png", { width: 720, height: 1280 }, { referenceUrls: refs });
    expect(models).toEqual(["fal-ai/flux-pro/kontext/max/multi", "fal-ai/flux/dev"]);
    expect(img).toMatchObject({ model: "fal-ai/flux/dev", referencesUsed: 0, referenceGap: expect.stringContaining("422 bad image") });
  });

  it("with references, the provider that can use them is tried first", async () => {
    const used: string[] = [];
    const p = (id: string, references: boolean): ImageProvider => ({
      id, model: null, seeds: false, references,
      generate: async (prompt, key, size) => { used.push(id); return { key, provider: id, model: null, seed: null, sha256: null, promptSha256: sha256Hex(prompt), width: size.width, height: size.height }; },
    });
    const chain = withFallback([p("openai-image", false), p("fal-image", true)]);
    await chain.generate("x", "k", { width: 1, height: 1 }, { referenceUrls: ["u"] });
    await chain.generate("x", "k", { width: 1, height: 1 });
    expect(used).toEqual(["fal-image", "openai-image"]);
  });

  it("the nearest supported aspect ratio", () => {
    expect([nearestAspect(1920, 1080), nearestAspect(1080, 1920), nearestAspect(1024, 1024), nearestAspect(1080, 1350), nearestAspect(2560, 1080)])
      .toEqual(["16:9", "9:16", "1:1", "3:4", "21:9"]);
  });
});
