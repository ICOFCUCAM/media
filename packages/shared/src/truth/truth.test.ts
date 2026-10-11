import { describe, expect, it } from "vitest";
import { buildCapabilityRegistry, formatsFor, offeredFormats, type CapabilityProbe } from "./capabilities";
import { judgeRun, ProductionFailure } from "./degradation";

const shot = { width: 1280, height: 720, durationSec: 5, fps: 16, shotId: "shot-1" };

describe("judgeRun — never self-certify (DOS-70/75)", () => {
  it("placeholder output is a failure in production", () => {
    const r = judgeRun({ mode: "placeholder" }, false, shot);
    expect(r.failure).toBeInstanceOf(ProductionFailure);
    expect(r.failure?.code).toBe("PLACEHOLDER_OUTPUT");
  });

  it("placeholder output is accepted only when explicitly allowed", () => {
    expect(judgeRun({ mode: "placeholder" }, false, shot, { allowPlaceholder: true }).failure).toBeUndefined();
  });

  it("realExecution=false alone is enough to refuse", () => {
    expect(judgeRun(undefined, false, shot).failure?.code).toBe("PLACEHOLDER_OUTPUT");
  });

  it("a provider that does not report is not judged (external APIs)", () => {
    expect(judgeRun(undefined, undefined, shot)).toEqual({ degradations: [] });
  });

  it("clamped resolution and frames become visible degradations", () => {
    const r = judgeRun({ mode: "real", width: 832, height: 480, frames: 25, fps: 16 }, true, shot);
    expect(r.failure).toBeUndefined();
    const codes = r.degradations.map((d) => d.code);
    expect(codes).toEqual(["OUTPUT_CLAMPED", "OUTPUT_CLAMPED"]);
    expect(r.degradations[1]!.message).toContain("1.56 s of the requested 5 s");
    expect(r.degradations.every((d) => d.refId === "shot-1" && d.severity === "major")).toBe(true);
  });

  it("ignored references and skipped LoRAs are reported", () => {
    const r = judgeRun(
      { mode: "real", width: 1280, height: 720, frames: 80, referenceImagesIgnored: 1, cameraIgnored: true,
        lorasSkipped: [{ key: "l", reason: "LORA_LOAD_FAILED" }] },
      true,
      shot,
    );
    expect(r.degradations.map((d) => d.code)).toEqual(["REFERENCE_IGNORED", "LORA_SKIPPED"]);
    expect(r.degradations[0]!.message).toContain("reference image, camera plan");
  });
});

describe("capability registry (DOS-77/78)", () => {
  it("with nothing configured, nothing is offered", () => {
    const reg = buildCapabilityRegistry({ env: {} });
    expect(reg.find((c) => c.capability === "film_planning")?.status).toBe("unavailable");
    expect(reg.find((c) => c.capability === "video_generation")?.realExecution).toBe(false);
    expect(reg.find((c) => c.capability === "lora_training")?.status).toBe("disabled");
    expect(offeredFormats(reg)).toEqual([]);
  });

  it("visual QC is reported from the vision route and the review mode", () => {
    const vq = (env: Record<string, string>, available: boolean) =>
      buildCapabilityRegistry({ env, intelligence: { visual_review: { available, provider: "anthropic:claude-opus-5-5" } } })
        .find((c) => c.capability === "visual_qc")!;
    expect(vq({}, false)).toMatchObject({ status: "unavailable", realExecution: false });
    expect(vq({}, true)).toMatchObject({ status: "experimental", realExecution: true, supports: ["record"] });
    expect(vq({ VISUAL_REVIEW: "enforce" }, true).supports).toEqual(["enforce"]);
    expect(vq({ VISUAL_REVIEW: "off" }, true)).toMatchObject({ status: "disabled", realExecution: false });
  });

  it("voice cloning follows the voice router; a self-hosted engine counts only when configured AND approved", () => {
    const get = (env: Record<string, string>, voice?: CapabilityProbe["voice"]) =>
      buildCapabilityRegistry({ env, voice }).find((c) => c.capability === "voice_cloning")!;
    expect(get({ FAL_KEY: "k" })).toMatchObject({ provider: "fal-minimax", status: "experimental", realExecution: true });
    expect(get({ FAL_KEY: "k", VOICE_ENGINES: "openai-tts:80" })).toMatchObject({ provider: null, status: "unavailable" });
    const env = { VOICE_ENGINES: "qwen3-tts:100,fal-minimax:90" };
    const unknown = get(env);
    expect(unknown).toMatchObject({ status: "unavailable", realExecution: false });
    expect(unknown.note).toMatch(/qwen3-tts: status unknown/);
    expect(unknown.note).not.toMatch(/Phase 1/);
    const notApproved = get(env, [{ id: "qwen3-tts", listed: true, configured: true, approved: false, reason: "not approved — no owner approval" }]);
    expect(notApproved).toMatchObject({ provider: null, status: "unavailable" });
    expect(notApproved.note).toMatch(/qwen3-tts: not approved/);
    const ready = get(env, [{ id: "qwen3-tts", listed: true, configured: true, approved: true, reason: null }]);
    expect(ready).toMatchObject({ provider: "qwen3-tts", status: "experimental", realExecution: true });
    expect(ready.note).toMatch(/self-hosted/);
    // Approved but not configured: still unavailable.
    expect(get(env, [{ id: "qwen3-tts", listed: true, configured: false, approved: true, reason: "not configured" }]).provider).toBeNull();
  });

  it("film voice follows the voice router", () => {
    const get = (env: Record<string, string>) => buildCapabilityRegistry({ env }).find((c) => c.capability === "narration_tts")!;
    expect(get({ FAL_KEY: "k", OPENAI_API_KEY: "k" }).provider).toBe("fal-minimax");
    expect(get({ OPENAI_API_KEY: "k" }).provider).toBe("openai-tts");
    expect(get({ FAL_KEY: "k", VOICE_ENGINES: "openai-tts:80" })).toMatchObject({ provider: null, status: "unavailable" });
  });

  it("a placeholder GPU worker never counts as video generation", () => {
    const reg = buildCapabilityRegistry({ env: {}, gpu: { "wan-2.1": { execution: "placeholder", realExecution: false } } });
    const v = reg.find((c) => c.capability === "video_generation")!;
    expect(v.status).toBe("unavailable");
    expect(v.note).toContain("placeholder");
  });

  it("formats follow the worker's real max resolution; 4K only with the upscaler", () => {
    const gpu = { "wan-2.1": { execution: "real", realExecution: true, maxResolution: [832, 480] as [number, number], supportsLora: true } };
    expect(offeredFormats(buildCapabilityRegistry({ env: {}, gpu }))).toEqual(["480p"]);
    expect(offeredFormats(buildCapabilityRegistry({ env: { FAL_KEY: "k" }, gpu }))).toEqual(["480p", "4k"]);
    expect(formatsFor([1920, 1080])).toEqual(["480p", "720p", "1080p"]);
  });

  it("nothing is production_ready on wiring alone (DOS-73)", () => {
    const reg = buildCapabilityRegistry({
      env: { ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k", FAL_KEY: "k" },
      gpu: { "wan-2.1": { execution: "real", realExecution: true, maxResolution: [1280, 720] } },
    });
    const ready = reg.filter((c) => c.status === "production_ready").map((c) => c.capability);
    expect(ready).toEqual([]);
    expect(reg.find((c) => c.capability === "reference_video_conditioning")?.status).toBe("not_implemented");
  });
});

describe("the self-hosted image runtime capability (docs/73)", () => {
  const CONFIG = { IMAGE_PROVIDERS: "comfyui,fal", COMFYUI_GPU_URL: "https://pod", GPU_JWT_SIGNING_KEY: "k1:x", S3_BUCKET: "b", S3_ACCESS_KEY: "a" };
  const get = (env: Record<string, string>, gpu?: Record<string, { realExecution?: boolean; execution?: string; supportsRefImage?: boolean; supportsLora?: boolean } | null>) => {
    const reg = buildCapabilityRegistry({ env, gpu });
    return { runtime: reg.find((c) => c.capability === "self_hosted_image_runtime")!, seed: reg.find((c) => c.capability === "seed_image_generation")! };
  };

  it("is off unless IMAGE_PROVIDERS names it", () => {
    const { runtime, seed } = get({ FAL_KEY: "k", IMAGE_PROVIDERS: "fal" }, { "comfyui-image": { realExecution: true } });
    expect(runtime).toMatchObject({ status: "disabled", realExecution: false, provider: null });
    expect(seed).toMatchObject({ provider: "fal", status: "experimental" });
  });

  it("listed but not configured: unavailable, saying what it needs; the next provider draws", () => {
    const { runtime, seed } = get({ IMAGE_PROVIDERS: "comfyui,fal", FAL_KEY: "k" });
    expect(runtime).toMatchObject({ status: "unavailable", realExecution: false, note: expect.stringMatching(/needs COMFYUI_GPU_URL/) });
    expect(seed).toMatchObject({ provider: "fal", note: expect.stringMatching(/comfyui: not configured/) });
  });

  it("configured: available only once the pod reports real execution", () => {
    expect(get(CONFIG, { "comfyui-image": { execution: "placeholder", realExecution: false } }).runtime)
      .toMatchObject({ status: "unavailable", realExecution: false, note: expect.stringMatching(/placeholder/) });
    const { runtime, seed } = get(CONFIG, { "comfyui-image": { execution: "real", realExecution: true, supportsRefImage: true, supportsLora: true } });
    expect(runtime).toMatchObject({ status: "experimental", realExecution: true, provider: "comfyui", requiresGpu: true, supports: ["text_to_image", "reference_images", "lora"] });
    expect(seed).toMatchObject({ provider: "comfyui", status: "experimental", realExecution: true });
  });
});
