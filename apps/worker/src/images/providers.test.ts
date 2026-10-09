import { describe, expect, it } from "vitest";
import { candidateSeed, imageProvider, imageProviderStatuses, sha256Hex, type FalImageDeps } from "./providers";
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
