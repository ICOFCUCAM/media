import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { GatewayAdmin } from "./admin";
import { ImageGatewayAuthority, imageAuthzDigest, type ImagePayload, type ImageRunResult } from "./image-authority";
import { MemoryGatewayStore } from "./memory";
import { parseSigningKey, sha256Hex, verifyExecutionToken } from "./token";
import { GatewayDeniedError, type MediaPresigner, type RuntimeDeployment, type RuntimeManifest } from "./types";

const KEY = parseSigningKey(`k1:${Buffer.alloc(32, 5).toString("base64url")}`);
const IMAGE = `icofcucam/cineforge-gpu-image@sha256:${"cd".repeat(32)}`;
const URL_ = "https://pod-img-8000.proxy.runpod.net";
const PROJECT = "11111111-2222-3333-4444-555555555555";
const T2I_SHA = "1".repeat(64);
const REF_SHA = "2".repeat(64);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const MODELS = [
  { role: "qwen-image.diffusion", id: "Comfy-Org/Qwen-Image_ComfyUI:split_files/diffusion_models/qwen_image_fp8_e4m3fn.safetensors", revision: "c".repeat(40), weights: "a".repeat(64) },
  { role: "qwen-image-edit-2511.diffusion", id: "Comfy-Org/Qwen-Image-Edit_ComfyUI:split_files/diffusion_models/qwen_image_edit_2511_bf16.safetensors", revision: "d".repeat(40), weights: "b".repeat(64) },
  { role: "qwen2.5-vl-7b.text-encoder", id: "Comfy-Org/Qwen-Image_ComfyUI:split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors", revision: "c".repeat(40), weights: "e".repeat(64) },
  { role: "qwen-image.vae", id: "Comfy-Org/Qwen-Image_ComfyUI:split_files/vae/qwen_image_vae.safetensors", revision: "c".repeat(40), weights: "f".repeat(64) },
];
const MANIFEST: RuntimeManifest = {
  authzVersion: 2,
  runtime: "comfyui@8ff6dc384ba5c410266b40e137799e049459d4f2",
  models: MODELS,
  workflows: [
    { id: "cineforge.still.t2i", version: 1, sha256: T2I_SHA, models: ["qwen-image.diffusion", "qwen-image.vae", "qwen2.5-vl-7b.text-encoder"] },
    { id: "cineforge.still.ref", version: 1, sha256: REF_SHA, models: ["qwen-image-edit-2511.diffusion", "qwen-image.vae", "qwen2.5-vl-7b.text-encoder"] },
  ],
  registrySha256: "9".repeat(64),
};

function deployment(over: Partial<RuntimeDeployment> = {}): RuntimeDeployment {
  return { id: "dep-img-1", modelId: "comfyui-image", baseUrl: URL_, runpodPodId: "pod-img", status: "approved", enforcement: "enforce",
    approvedImage: IMAGE, manifest: MANIFEST, ...over };
}

class FakePresigner implements MediaPresigner {
  readonly kind = "fake";
  objects = new Map<string, Uint8Array>();
  async presignGet(key: string, ttl: number) { return `https://store.example/get/${key}?ttl=${ttl}`; }
  async presignPut(key: string, ct: string, ttl: number) { return `https://store.example/put/${key}?ct=${ct}&ttl=${ttl}`; }
  async head(key: string) { const o = this.objects.get(key); return o ? { size: o.length } : null; }
}

let store: MemoryGatewayStore;
let presigner: FakePresigner;
let running: string | null;

function authority(over: Partial<ConstructorParameters<typeof ImageGatewayAuthority>[0]> = {}) {
  return new ImageGatewayAuthority({
    store, signingKey: KEY, presigner, attestor: { runningImage: async () => running }, log: () => {},
    readBack: async (url) => presigner.objects.get(url.replace("https://store.example/get/", "").replace(/\?.*$/, "")) ?? new Uint8Array(),
    ...over,
  });
}

const PAYLOAD: ImagePayload = { workflow: { id: "cineforge.still.t2i", version: 1 }, prompt: "a lighthouse", seed: 7, width: 1344, height: 768 };
const OUT = `projects/${PROJECT}/seeds/shot-1.png`;

function result(over: Partial<ImageRunResult> = {}): ImageRunResult {
  return { imageKey: OUT, imageBytes: PNG.length, sha256: sha256Hex(PNG), seed: 7, width: 1344, height: 768, gpuMs: 900,
    workflow: { id: "cineforge.still.t2i", version: 1, sha256: T2I_SHA }, graphSha256: "3".repeat(64), runtime: MANIFEST.runtime,
    models: [], execution: { mode: "real" }, realExecution: true, ...over };
}

beforeEach(async () => {
  store = new MemoryGatewayStore();
  presigner = new FakePresigner();
  running = IMAGE;
  await store.saveDeployment(deployment());
});

describe("ImageGatewayAuthority — the authorized path", () => {
  it("binds deployment, scope image:run, job, body and the approved workflow hash + models", async () => {
    const call = await authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT });
    const claims = verifyExecutionToken(call.headers.authorization!.slice(7), KEY.publicKeyB64)!;
    const body = JSON.parse(call.body);
    expect(claims).toMatchObject({ aud: "dep-img-1", scope: "image:run", sub: body.jobId, bh: sha256Hex(call.body) });
    expect(body.output).toEqual({ imageKey: OUT, imageUploadUrl: `https://store.example/put/${OUT}?ct=image/png&ttl=1800` });
    expect(body).not.toHaveProperty("inputUrls");
    const expected = imageAuthzDigest({ workflow: MANIFEST.workflows![0]!, runtime: MANIFEST.runtime,
      models: [MODELS[0]!, MODELS[3]!, MODELS[2]!], loras: [], width: 1344, height: 768 });
    expect(claims.authz).toBe(expected);
    expect(call.workflow.sha256).toBe(T2I_SHA);
    const g = store.grants.get(body.jobId)!;
    expect(g).toMatchObject({ scope: "image:run", outcome: "issued", projectId: PROJECT, outputKeys: [OUT], authzDigest: expected });
  });

  it("the digest is the one the GPU computes (golden vector shared with apps/gpu-image)", () => {
    const fx = JSON.parse(readFileSync(resolve(__dirname, "../../../../apps/gpu-image/tests/fixtures/image_authz.json"), "utf8"));
    const [id, rest] = (fx.input.workflow as string).split("@");
    const [version, sha256] = rest!.split("#");
    expect(imageAuthzDigest({ workflow: { id: id!, version: Number(version), sha256: sha256!, models: [] }, runtime: fx.input.runtime,
      models: fx.input.models, loras: fx.input.loras, width: fx.input.width, height: fx.input.height })).toBe(fx.digest);
  });

  it("reference stills: caller-signed URLs pass through; project inputs are presigned here", async () => {
    const p: ImagePayload = { ...PAYLOAD, workflow: { id: "cineforge.still.ref", version: 1 }, referenceImageKeys: ["ref-0.png", `projects/${PROJECT}/wardrobe/w.png`] };
    const call = await authority().prepareImage({ baseUrl: URL_, payload: p, outputKey: OUT, inputUrls: { "ref-0.png": "https://signed.example/a?sig=1" } });
    expect(JSON.parse(call.body).inputUrls).toEqual({ "ref-0.png": "https://signed.example/a?sig=1",
      [`projects/${PROJECT}/wardrobe/w.png`]: `https://store.example/get/projects/${PROJECT}/wardrobe/w.png?ttl=900` });
    expect(call.workflow.id).toBe("cineforge.still.ref");
  });

  it("accepts a result only when the stored still is the granted key, size, PNG and hash", async () => {
    const call = await authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT });
    presigner.objects.set(OUT, PNG);
    await expect(call.grant.complete(result())).resolves.toMatchObject({ imageKey: OUT });
    expect([...store.grants.values()][0]).toMatchObject({ outcome: "completed", outputBytes: PNG.length, gpuMs: 900 });
  });

  it.each([
    ["OUTPUT_KEY_MISMATCH", () => result({ imageKey: `projects/${PROJECT}/elsewhere.png` }), PNG],
    ["OUTPUT_NOT_VERIFIED", () => result({ imageBytes: 99 }), PNG],
    ["OUTPUT_NOT_PNG", () => result({ sha256: sha256Hex(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])) }), new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])],
    ["OUTPUT_HASH_MISMATCH", () => result({ sha256: "0".repeat(64) }), PNG],
    ["WORKFLOW_MISMATCH", () => result({ workflow: { id: "cineforge.still.ref", version: 1, sha256: REF_SHA } }), PNG],
  ])("rejects %s", async (code, make, stored) => {
    const call = await authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT });
    presigner.objects.set(OUT, stored);
    await expect(call.grant.complete(make())).rejects.toMatchObject({ code });
    expect([...store.grants.values()][0]).toMatchObject({ outcome: "rejected", errorCode: code });
  });
});

describe("ImageGatewayAuthority — refusals (every mode: there is no unsigned image path)", () => {
  it.each([
    ["UNREGISTERED_DEPLOYMENT", async () => { store.deployments.clear(); }],
    ["DEPLOYMENT_NOT_APPROVED", async () => { await store.saveDeployment(deployment({ status: "pending", enforcement: "report" })); }],
    ["WORKFLOW_NOT_AUTHORIZED", async () => { await store.saveDeployment(deployment({ enforcement: "report", manifest: { ...MANIFEST, workflows: [] } })); }],
  ])("%s", async (code, setup) => {
    await setup();
    await expect(authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT })).rejects.toMatchObject({ code });
    expect(store.events.at(-1)).toMatchObject({ type: "dispatch.denied", code });
  });

  it("an unknown workflow version or a manifest without its model is refused, never substituted", async () => {
    await expect(authority().prepareImage({ baseUrl: URL_, payload: { ...PAYLOAD, workflow: { id: "cineforge.still.t2i", version: 2 } }, outputKey: OUT }))
      .rejects.toMatchObject({ code: "WORKFLOW_NOT_AUTHORIZED" });
    await store.saveDeployment(deployment({ manifest: { ...MANIFEST, models: MODELS.slice(1) } }));
    await expect(authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT })).rejects.toMatchObject({ code: "WORKFLOW_NOT_AUTHORIZED" });
  });

  it("outputs and inputs stay inside the project's folder", async () => {
    await expect(authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: "_generated/x.png" })).rejects.toMatchObject({ code: "OUTPUT_OUT_OF_SCOPE" });
    await expect(authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: `projects/${PROJECT}/../other/x.png` })).rejects.toMatchObject({ code: "OUTPUT_OUT_OF_SCOPE" });
    const p = { ...PAYLOAD, workflow: { id: "cineforge.still.ref", version: 1 }, referenceImageKeys: ["projects/someone-else/face.png"] };
    await expect(authority().prepareImage({ baseUrl: URL_, payload: p, outputKey: OUT })).rejects.toMatchObject({ code: "INPUT_OUT_OF_SCOPE" });
  });

  it("LoRAs must be content-addressed", async () => {
    const p = { ...PAYLOAD, loraKeys: [`projects/${PROJECT}/loras/x.safetensors`] };
    await expect(authority().prepareImage({ baseUrl: URL_, payload: p, outputKey: OUT })).rejects.toMatchObject({ code: "LORA_UNHASHED" });
  });

  it("enforce: the pod must run the approved image digest; report records it instead", async () => {
    running = `icofcucam/cineforge-gpu-image@sha256:${"ee".repeat(32)}`;
    await expect(authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT })).rejects.toMatchObject({ code: "IMAGE_DIGEST_MISMATCH" });
    await store.saveDeployment(deployment({ enforcement: "report" }));
    const call = await authority().prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT });
    expect(call.mode).toBe("report");
    expect(store.events.some((e) => e.type === "dispatch.would_deny" && e.code === "IMAGE_DIGEST_MISMATCH")).toBe(true);
  });

  it("no signing key or presigner: refused", async () => {
    await expect(authority({ signingKey: null }).prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT })).rejects.toBeInstanceOf(GatewayDeniedError);
    await expect(authority({ presigner: null }).prepareImage({ baseUrl: URL_, payload: PAYLOAD, outputKey: OUT })).rejects.toMatchObject({ code: "NO_PRESIGNER" });
  });

  it("status tokens only for an approved deployment", async () => {
    expect((await authority().statusHeaders(URL_)).authorization).toMatch(/^Bearer /);
    expect(await authority().statusHeaders("https://unknown")).toEqual({});
  });
});

describe("GatewayAdmin records and compares the image runtime's workflows", () => {
  const caps = (manifest: unknown, over: Record<string, unknown> = {}) => ({ model: "comfyui-image", deploymentId: "dep-img-1", gatewayMode: "enforce", manifest, ...over });
  const podManifest = { ...MANIFEST, models: MODELS.map((m) => ({ ...m, pinned: true })) };

  it("approve keeps the workflow hashes; enforce refuses a pod whose workflows changed", async () => {
    await store.saveDeployment(deployment({ status: "pending", enforcement: "report", manifest: null, approvedImage: null }));
    let current: unknown = podManifest;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/capabilities")) return new Response(JSON.stringify(caps(current)));
      void init;
      return new Response("", { status: 401 });
    }) as unknown as typeof fetch;
    const admin = new GatewayAdmin({ store, signingKey: KEY, attestor: { runningImage: async () => IMAGE }, actor: "operator:test", fetchImpl });
    const approved = await admin.approve("dep-img-1", IMAGE);
    expect(approved.manifest?.workflows?.map((w) => w.sha256)).toEqual([T2I_SHA, REF_SHA]);
    expect(approved.manifest?.registrySha256).toBe("9".repeat(64));
    current = { ...podManifest, workflows: [{ ...MANIFEST.workflows![0]!, sha256: "4".repeat(64) }, MANIFEST.workflows![1]] };
    await expect(admin.enforce("dep-img-1")).rejects.toMatchObject({ code: "MANIFEST_MISMATCH" });
    current = podManifest;
    await expect(admin.enforce("dep-img-1")).resolves.toMatchObject({ deployment: { enforcement: "enforce" } });
  });
});
