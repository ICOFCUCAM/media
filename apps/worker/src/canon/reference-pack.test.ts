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
    expect(imageProvider(put, {})).toEqual({ provider: null, reason: "openai: not configured; fal: not configured" });
    expect(imageProvider(put, { IMAGE_PROVIDERS: "none", OPENAI_API_KEY: "k", S3_BUCKET: "b" }).reason).toMatch(/disabled/);
  });
  it("ComfyUI is used only when listed and configured — never silently skipped (docs/73)", () => {
    const env = { IMAGE_PROVIDERS: "comfyui,openai", OPENAI_API_KEY: "k", S3_BUCKET: "b" };
    expect(imageProvider(put, env).provider?.id).toBe("openai-image");
    expect(imageProviderStatuses(env)[0]).toEqual({ id: "comfyui", configured: false, gated: null });
    expect(imageProvider(put, { IMAGE_PROVIDERS: "comfyui" }).reason).toMatch(/comfyui: not configured \(needs COMFYUI_GPU_URL/);
    const ready = { ...env, COMFYUI_GPU_URL: "https://pod", GPU_JWT_SIGNING_KEY: "k1:x", S3_ACCESS_KEY: "a" };
    expect(imageProviderStatuses(ready)[0]).toEqual({ id: "comfyui", configured: true, gated: null });
    expect(imageProvider(put, ready).provider?.id).toBe("comfyui-image");
    // Not listed: never used, even when configured.
    expect(imageProvider(put, { ...ready, IMAGE_PROVIDERS: "openai" }).provider?.id).toBe("openai-image");
  });
});

describe("camera and style references in the pack (W24)", () => {
  it("orders camera (the scene's establishing frame) before location and style, and keeps their roles", () => {
    const p = assembleReferencePack({ wardrobe: ["w"], camera: ["est"], location: ["loc"], style: ["look"], props: ["prop"], max: 8 });
    expect(p.keys).toEqual(["w", "est", "loc", "look", "prop"]);
    expect(p.roles).toEqual({ w: "wardrobe", est: "camera", loc: "location", look: "style", prop: "prop" });
  });
});
