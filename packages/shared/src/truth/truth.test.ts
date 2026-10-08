import { describe, expect, it } from "vitest";
import { buildCapabilityRegistry, formatsFor, offeredFormats } from "./capabilities";
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
