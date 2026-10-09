import { describe, expect, it } from "vitest";
import { assembleReferencePack, endFrameKey } from "./reference-pack";
import { imageProvider, imageProviderStatuses } from "../images/providers";

describe("reference pack (W6)", () => {
  it("orders seed → previous end frame → wardrobe → identity, dedups, caps and lists what was dropped", () => {
    const p = assembleReferencePack({ seed: "s", previousEndFrame: "e", wardrobe: ["w1", "s"], identity: ["i1", "i2", "i3"], max: 4 });
    expect(p.keys).toEqual(["s", "e", "w1", "i1"]);
    expect(p.roles).toEqual({ s: "seed", e: "previous_end_frame", w1: "wardrobe", i1: "identity" });
    expect(p.dropped).toEqual(["i2", "i3"]);
  });
  it("works with nothing", () => {
    expect(assembleReferencePack({})).toEqual({ keys: [], roles: {}, dropped: [] });
    expect(endFrameKey("p", "s")).toBe("projects/p/frames/s-end.jpg");
  });
});

describe("image provider registry (W6)", () => {
  const put = async (k: string) => k;
  it("uses OpenAI when configured; says why when not", () => {
    expect(imageProvider(put, { OPENAI_API_KEY: "k", S3_BUCKET: "b" }).provider?.id).toBe("openai-image");
    expect(imageProvider(put, {})).toEqual({ provider: null, reason: "openai: not configured" });
    expect(imageProvider(put, { IMAGE_PROVIDERS: "none", OPENAI_API_KEY: "k", S3_BUCKET: "b" }).reason).toMatch(/disabled/);
  });
  it("ComfyUI is listed but gated on Phase 1 — never used, never silently skipped", () => {
    const env = { IMAGE_PROVIDERS: "comfyui,openai", OPENAI_API_KEY: "k", S3_BUCKET: "b" };
    expect(imageProvider(put, env).provider?.id).toBe("openai-image");
    expect(imageProviderStatuses(env)[0]).toMatchObject({ id: "comfyui", configured: false, gated: expect.stringMatching(/Phase 1/) });
    expect(imageProvider(put, { IMAGE_PROVIDERS: "comfyui" }).reason).toMatch(/comfyui: ComfyUI runtime waits on Phase 1/);
  });
});
