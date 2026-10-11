import { describe, expect, it } from "vitest";
import { GatewayDeniedError, type ComfyImageRequest, type ImageRunResult } from "@cineforge/model-adapters";
import { STILL_NEGATIVE } from "@cineforge/movie";

import { comfyImageProvider } from "./comfyui";
import { imageGenerationRow, recordImageGeneration } from "./ledger";
import { imageProvider, sha256Hex, withFallback, type ImageProvider } from "./providers";

const ENV = { IMAGE_PROVIDERS: "comfyui,fal,openai", COMFYUI_GPU_URL: "https://pod-img", GPU_JWT_SIGNING_KEY: "k1:x", S3_BUCKET: "b", S3_ACCESS_KEY: "a" };
const KEY = "projects/11111111-2222-3333-4444-555555555555/seeds/shot-1.png";

function runner(over: (req: ComfyImageRequest) => Partial<ImageRunResult> | Error = () => ({})) {
  const calls: ComfyImageRequest[] = [];
  return {
    calls,
    async generate(req: ComfyImageRequest): Promise<ImageRunResult> {
      calls.push(req);
      const o = over(req);
      if (o instanceof Error) throw o;
      const ref = req.payload.workflow.id === "cineforge.still.ref";
      return {
        imageKey: req.outputKey, imageBytes: 100, sha256: "a".repeat(64), seed: req.payload.seed, width: req.payload.width, height: req.payload.height,
        gpuMs: 1200, workflow: { id: req.payload.workflow.id, version: 1, sha256: (ref ? "2" : "1").repeat(64), modelLabel: ref ? "qwen-image-edit-2511" : "qwen-image" },
        graphSha256: "3".repeat(64), runtime: "comfyui@8ff6dc384ba5c410266b40e137799e049459d4f2", models: [],
        execution: { mode: "real", referencesUsed: req.payload.referenceImageKeys?.length ?? 0 }, realExecution: true, ...o,
      };
    },
  };
}

describe("the comfyui image provider (docs/73)", () => {
  it("is used first when listed and configured, and records seed, model, workflow and runtime", async () => {
    const r = runner();
    const { provider } = imageProvider(async (k) => k, ENV, undefined, r);
    expect(provider).toMatchObject({ id: "comfyui-image", seeds: true, references: true });
    const img = await provider!.generate("a lighthouse at dusk", KEY, { width: 1920, height: 1080 }, { seed: 42 });
    expect(r.calls[0]).toMatchObject({
      outputKey: KEY,
      payload: { workflow: { id: "cineforge.still.t2i", version: 1 }, prompt: "a lighthouse at dusk", negativePrompt: STILL_NEGATIVE, seed: 42, width: 1920, height: 1072 },
    });
    expect(r.calls[0]!.inputUrls).toBeUndefined();
    expect(img).toEqual({
      key: KEY, provider: "comfyui-image", model: "qwen-image", seed: 42, sha256: "a".repeat(64), promptSha256: sha256Hex("a lighthouse at dusk"),
      width: 1920, height: 1072, workflow: { id: "cineforge.still.t2i", version: 1, sha256: "1".repeat(64) }, runtime: "comfyui@8ff6dc384ba5c410266b40e137799e049459d4f2",
    });
    const row = imageGenerationRow("p", "seed_frame", "shot-1", img);
    expect(row).toMatchObject({ provider: "comfyui-image", model: "qwen-image", seed: 42n, workflowId: "cineforge.still.t2i", workflowVersion: 1,
      workflowSha256: "1".repeat(64), runtime: "comfyui@8ff6dc384ba5c410266b40e137799e049459d4f2" });
  });

  it("reference URLs go to the reference workflow as one-time inputs (first three)", async () => {
    const r = runner();
    const refs = ["https://s/a?sig", "https://s/b?sig", "https://s/c?sig", "https://s/d?sig"];
    const img = await comfyImageProvider(ENV, r).generate("Maya on the quay", KEY, { width: 1280, height: 720 }, { seed: 3, referenceUrls: refs });
    expect(r.calls[0]!.payload).toMatchObject({ workflow: { id: "cineforge.still.ref", version: 1 }, referenceImageKeys: ["ref-0.png", "ref-1.png", "ref-2.png"] });
    expect(r.calls[0]!.inputUrls).toEqual({ "ref-0.png": refs[0], "ref-1.png": refs[1], "ref-2.png": refs[2] });
    expect(img).toMatchObject({ model: "qwen-image-edit-2511", referencesUsed: 3, referenceGap: expect.stringContaining("1 not used") });
  });

  it("when the reference workflow fails the still is drawn from text and the reason is kept", async () => {
    const r = runner((req) => (req.payload.workflow.id === "cineforge.still.ref" ? new Error("gpu-image /images 500: COMFYUI_EXECUTION_ERROR") : {}));
    const img = await comfyImageProvider(ENV, r).generate("p", KEY, { width: 1024, height: 1024 }, { referenceUrls: ["https://s/a"] });
    expect(r.calls.map((c) => c.payload.workflow.id)).toEqual(["cineforge.still.ref", "cineforge.still.t2i"]);
    expect(img).toMatchObject({ referencesUsed: 0, referenceGap: expect.stringContaining("COMFYUI_EXECUTION_ERROR") });
  });

  it("a gateway refusal is never papered over by another workflow", async () => {
    const r = runner(() => new GatewayDeniedError("WORKFLOW_NOT_AUTHORIZED"));
    await expect(comfyImageProvider(ENV, r).generate("p", KEY, { width: 512, height: 512 }, { referenceUrls: ["https://s/a"] })).rejects.toBeInstanceOf(GatewayDeniedError);
    expect(r.calls).toHaveLength(1);
  });

  it("a placeholder still is refused unless ALLOW_PLACEHOLDER_MEDIA=1", async () => {
    const r = runner(() => ({ realExecution: false, execution: { mode: "placeholder" } }));
    await expect(comfyImageProvider(ENV, r).generate("p", KEY, { width: 512, height: 512 })).rejects.toThrow(/PLACEHOLDER_RESULT/);
    await expect(comfyImageProvider({ ...ENV, ALLOW_PLACEHOLDER_MEDIA: "1" }, r).generate("p", KEY, { width: 512, height: 512 })).resolves.toMatchObject({ provider: "comfyui-image" });
  });

  it("when the runtime fails the next provider draws the still (fallback chain)", async () => {
    const r = runner(() => new Error("gpu-image /images 503: MODEL_LOADING"));
    const fal: ImageProvider = { id: "fal-image", model: "m", seeds: true, references: true,
      generate: async (prompt, key, size) => ({ key, provider: "fal-image", model: "m", seed: 1, sha256: null, promptSha256: sha256Hex(prompt), width: size.width, height: size.height }) };
    const out = await withFallback([comfyImageProvider(ENV, r), fal]).generate("x", KEY, { width: 512, height: 512 });
    expect(out.provider).toBe("fal-image");
  });

  it("the ledger keeps the still when the workflow columns are not migrated yet", async () => {
    const rows: Record<string, unknown>[] = [];
    const db = { imageGeneration: { create: async (a: { data: Record<string, unknown> }) => {
      if ("workflowId" in a.data) throw new Error("P2022: The column `workflow_id` does not exist in the current database.");
      rows.push(a.data);
      return {};
    } } };
    const img = { key: KEY, provider: "comfyui-image", model: "qwen-image", seed: 1, sha256: null, promptSha256: "x".repeat(64), width: 1, height: 1,
      workflow: { id: "cineforge.still.t2i", version: 1, sha256: "1".repeat(64) }, runtime: "comfyui@x" };
    expect(await recordImageGeneration(db, imageGenerationRow("p", "seed_frame", "s", img))).toBe("recorded");
    expect(rows[0]).not.toHaveProperty("workflowId");
    expect(rows[0]).toMatchObject({ provider: "comfyui-image", storageKey: KEY });
  });
});
