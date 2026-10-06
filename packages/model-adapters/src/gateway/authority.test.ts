import { describe, expect, it, beforeEach } from "vitest";

import { GatewayAuthority, type GeneratePayload } from "./authority";
import { MemoryGatewayStore } from "./memory";
import { parseSigningKey, verifyExecutionToken, sha256Hex } from "./token";
import { GatewayDeniedError, type JobContext, type MediaPresigner, type RuntimeDeployment } from "./types";

const KEY = parseSigningKey(`k1:${Buffer.alloc(32, 3).toString("base64url")}`);
const IMAGE = `icofcucam/cineforge-gpu@sha256:${"ab".repeat(32)}`;
const URL_ = "https://pod-1-8000.proxy.runpod.net";

function deployment(over: Partial<RuntimeDeployment> = {}): RuntimeDeployment {
  return {
    id: "dep-wan-1",
    modelId: "wan-2.1",
    baseUrl: URL_,
    runpodPodId: "pod-1",
    status: "approved",
    enforcement: "enforce",
    approvedImage: IMAGE,
    manifest: {
      authzVersion: 1,
      runtime: "diffusers@0.33.1",
      models: [{ role: "t2v", id: "Wan-AI/Wan2.1-T2V-1.3B-Diffusers", revision: "a".repeat(40), weights: "f".repeat(64) }],
    },
    ...over,
  };
}

const JOB: JobContext = { shotId: "shot-1", projectId: "p1", shotStatus: "GENERATING", projectStatus: "GENERATING", modelId: "wan-2.1" };
const PAYLOAD: GeneratePayload = { prompt: "x", durationSec: 5, width: 832, height: 480, fps: 16, referenceImageKeys: ["projects/p1/seeds/s.png"] };

class FakePresigner implements MediaPresigner {
  readonly kind = "fake";
  objects = new Map<string, number>();
  async presignGet(key: string, ttl: number) { return `https://store.example/get/${key}?ttl=${ttl}`; }
  async presignPut(key: string, ct: string, ttl: number) { return `https://store.example/put/${key}?ct=${ct}&ttl=${ttl}`; }
  async head(key: string) { const s = this.objects.get(key); return s ? { size: s } : null; }
}

let store: MemoryGatewayStore;
let presigner: FakePresigner;
let running: string | null;

function authority(over: Partial<ConstructorParameters<typeof GatewayAuthority>[0]> = {}) {
  return new GatewayAuthority({
    store, signingKey: KEY, presigner, attestor: { runningImage: async () => running }, log: () => {}, ...over,
  });
}

beforeEach(async () => {
  store = new MemoryGatewayStore();
  presigner = new FakePresigner();
  running = IMAGE;
  await store.saveDeployment(deployment());
});

describe("GatewayAuthority — authorized path", () => {
  it("issues a deployment-, job-, body- and digest-bound Ed25519 token and records the grant", async () => {
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    const token = call.headers.authorization!.replace("Bearer ", "");
    const claims = verifyExecutionToken(token, KEY.publicKeyB64)!;
    const body = JSON.parse(call.body!);
    expect(claims.aud).toBe("dep-wan-1");
    expect(claims.sub).toBe(body.jobId);
    expect(claims.scope).toBe("video:run");
    expect(claims.bh).toBe(sha256Hex(call.body!));
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300);
    expect(claims.authz).toMatch(/^[0-9a-f]{64}$/);
    // Cineforge chooses the output key under the project; inputs are presigned.
    expect(body.output.videoKey).toBe(`projects/p1/video/${body.jobId}.mp4`);
    expect(body.inputUrls["projects/p1/seeds/s.png"]).toContain("ttl=900");
    expect(body.output.videoUploadUrl).toContain("ttl=1800");
    const g = store.grants.get(body.jobId)!;
    expect(g).toMatchObject({ outcome: "issued", deploymentId: "dep-wan-1", shotId: "shot-1", jti: claims.jti, authzDigest: claims.authz, imageRef: IMAGE, mode: "enforce" });
  });

  it("accepts only the granted, verified output and records completion", async () => {
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    const key = call.grant!.outputKeys.video;
    presigner.objects.set(key, 1234);
    const res = await call.grant!.complete({ videoKey: key, thumbnailKey: null, gpuMs: 900, videoBytes: 1234 });
    expect(res.videoKey).toBe(key);
    expect(store.grants.get(call.grant!.id)).toMatchObject({ outcome: "completed", gpuMs: 900, outputBytes: 1234 });
  });

  it("status and warm calls get scoped tokens without a body", async () => {
    const call = await authority().prepare({ baseUrl: URL_, path: "/health", scope: "status" });
    const claims = verifyExecutionToken(call.headers.authorization!.slice(7), KEY.publicKeyB64)!;
    expect(claims.scope).toBe("status");
    expect(claims.bh).toBe(sha256Hex(""));
    expect(call.body).toBeUndefined();
  });

  it("uses the i2v model only when the approved manifest has one", async () => {
    const withI2v = deployment();
    withI2v.manifest!.models.push({ role: "i2v", id: "Wan-AI/Wan2.1-I2V-14B-480P-Diffusers", revision: "b".repeat(40), weights: "e".repeat(64) });
    await store.saveDeployment(withI2v);
    const a = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    await store.saveDeployment(deployment());
    const b = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    expect(store.grants.get(a.grant!.id)!.authzDigest).not.toBe(store.grants.get(b.grant!.id)!.authzDigest);
  });
});

describe("GatewayAuthority — enforce mode rejects before any GPU call", () => {
  const cases: [string, () => Promise<void>, string][] = [
    ["deployment not approved", async () => { await store.saveDeployment(deployment({ status: "pending" })); }, "DEPLOYMENT_NOT_APPROVED"],
    ["no approved immutable image", async () => { await store.saveDeployment(deployment({ approvedImage: "icofcucam/cineforge-gpu:latest" })); }, "NO_APPROVED_IMAGE_DIGEST"],
    ["running image digest differs", async () => { running = `icofcucam/cineforge-gpu@sha256:${"cd".repeat(32)}`; }, "IMAGE_DIGEST_MISMATCH"],
    ["running image is a mutable tag", async () => { running = "icofcucam/cineforge-gpu:latest"; }, "IMAGE_DIGEST_MISMATCH"],
    ["running image unknown", async () => { running = null; }, "IMAGE_UNATTESTED"],
  ];
  for (const [label, setup, code] of cases) {
    it(label, async () => {
      await setup();
      await expect(authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB }))
        .rejects.toMatchObject({ code });
      expect(store.events.at(-1)).toMatchObject({ type: "dispatch.denied", code });
    });
  }

  it("unregistered deployment (needs the global enforce floor: it has no row to carry a mode)", async () => {
    store.deployments.clear();
    await expect(authority({ globalMode: "enforce" }).prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB }))
      .rejects.toMatchObject({ code: "UNREGISTERED_DEPLOYMENT" });
  });

  it("job not in GENERATING state", async () => {
    await expect(authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: { ...JOB, shotStatus: "READY" } }))
      .rejects.toMatchObject({ code: "JOB_NOT_GENERATING" });
    expect([...store.grants.values()].at(-1)).toMatchObject({ outcome: "denied", errorCode: "JOB_NOT_GENERATING", shotId: "shot-1" });
  });

  it("model not authorized for the deployment", async () => {
    await expect(authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: { ...JOB, modelId: "hunyuan" } }))
      .rejects.toMatchObject({ code: "MODEL_NOT_AUTHORIZED" });
  });

  it("input from another project", async () => {
    const p = { ...PAYLOAD, referenceImageKeys: ["projects/OTHER/seeds/s.png"] };
    await expect(authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: p, job: JOB }))
      .rejects.toMatchObject({ code: "INPUT_OUT_OF_SCOPE" });
  });

  it("path traversal in an input key", async () => {
    const p = { ...PAYLOAD, loraKeys: ["projects/p1/../OTHER/lora.safetensors"] };
    await expect(authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: p, job: JOB }))
      .rejects.toMatchObject({ code: "INPUT_OUT_OF_SCOPE" });
  });

  it("no signing key", async () => {
    await expect(authority({ signingKey: null }).prepare({ baseUrl: URL_, path: "/health", scope: "status" }))
      .rejects.toBeInstanceOf(GatewayDeniedError);
  });

  it("result naming a different output key is rejected and audited", async () => {
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    presigner.objects.set("projects/OTHER/video/x.mp4", 10);
    await expect(call.grant!.complete({ videoKey: "projects/OTHER/video/x.mp4", gpuMs: 1 })).rejects.toMatchObject({ code: "OUTPUT_KEY_MISMATCH" });
    expect(store.grants.get(call.grant!.id)).toMatchObject({ outcome: "rejected", errorCode: "OUTPUT_KEY_MISMATCH" });
  });

  it("missing output object is rejected", async () => {
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    await expect(call.grant!.complete({ videoKey: call.grant!.outputKeys.video, gpuMs: 1 })).rejects.toMatchObject({ code: "OUTPUT_NOT_VERIFIED" });
  });

  it("audit write failure blocks dispatch in enforce", async () => {
    store.insertGrant = async () => { throw new Error("db down"); };
    await expect(authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB }))
      .rejects.toMatchObject({ code: "AUDIT_WRITE_FAILED" });
  });
});

describe("GatewayAuthority — LoRAs are content-addressed (authz v2)", () => {
  const LORA = "projects/p1/identities/c1/v1/lora.safetensors";
  const v2 = () => {
    const d = deployment();
    d.manifest!.authzVersion = 2;
    return d;
  };
  const withLora = (sha?: string): GeneratePayload => ({ ...PAYLOAD, loraKeys: [LORA], ...(sha ? { loraSha256: { [LORA]: sha } } : {}) });

  it("binds the LoRA's content hash into the token's digest and the signed body", async () => {
    await store.saveDeployment(v2());
    const a = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: withLora("ab".repeat(32)), job: JOB });
    const b = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: withLora("cd".repeat(32)), job: JOB });
    expect(JSON.parse(a.body!).loraSha256).toEqual({ [LORA]: "ab".repeat(32) });
    expect(store.grants.get(a.grant!.id)!.authzDigest).not.toBe(store.grants.get(b.grant!.id)!.authzDigest);
  });

  it("enforce: a LoRA without a recorded content hash is denied", async () => {
    await store.saveDeployment(v2());
    await expect(authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: withLora(), job: JOB }))
      .rejects.toMatchObject({ code: "LORA_UNHASHED" });
  });

  it("enforce: a deployment still on authz v1 may not run LoRAs (filename binding only)", async () => {
    await expect(authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: withLora("ab".repeat(32)), job: JOB }))
      .rejects.toMatchObject({ code: "LORA_REQUIRES_AUTHZ_V2" });
  });

  it("report: an unhashed LoRA is recorded as would-deny, the call still goes out", async () => {
    await store.saveDeployment({ ...v2(), enforcement: "report" });
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: withLora(), job: JOB });
    expect(call.headers.authorization).toBeDefined();
    expect(store.events.at(-1)).toMatchObject({ type: "dispatch.would_deny", code: "LORA_UNHASHED" });
  });
});

describe("GatewayAuthority — report mode never blocks today's pipeline", () => {
  beforeEach(async () => { await store.saveDeployment(deployment({ enforcement: "report" })); });

  it("records would-deny problems but still signs the call", async () => {
    running = null;
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: { ...JOB, shotStatus: "READY" } });
    expect(call.mode).toBe("report");
    expect(call.headers.authorization).toBeDefined();
    expect(store.events.at(-1)).toMatchObject({ type: "dispatch.would_deny", code: "JOB_NOT_GENERATING" });
  });

  it("unregistered deployment sends today's unsigned request and records it", async () => {
    store.deployments.clear();
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    expect(call.headers).toEqual({});
    expect(JSON.parse(call.body!)).toEqual(PAYLOAD);
    expect(store.events.map((e) => e.type)).toContain("dispatch.legacy");
  });

  it("a legacy pod's own output key is accepted but recorded as unverified", async () => {
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    const res = await call.grant!.complete({ videoKey: "_generated/wan-2.1/abc.mp4", gpuMs: 5 });
    expect(res.videoKey).toBe("_generated/wan-2.1/abc.mp4");
    expect(store.grants.get(call.grant!.id)!.outcome).toBe("completed_unverified");
    expect(store.events.at(-1)).toMatchObject({ type: "output.legacy" });
  });

  it("registry unavailable (e.g. migration not applied yet) keeps today's call working", async () => {
    store.deploymentByUrl = async () => { throw new Error('relation "runtime_deployments" does not exist'); };
    const call = await authority().prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB });
    expect(call.headers).toEqual({});
    expect(JSON.parse(call.body!)).toEqual(PAYLOAD);
  });

  it("registry unavailable under the global enforce floor is a denial", async () => {
    store.deploymentByUrl = async () => { throw new Error("db down"); };
    await expect(authority({ globalMode: "enforce" }).prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB }))
      .rejects.toMatchObject({ code: "REGISTRY_UNAVAILABLE" });
  });

  it("status probes in report mode do not write audit events", async () => {
    store.deployments.clear();
    await authority().prepare({ baseUrl: URL_, path: "/health", scope: "status" });
    expect(store.events).toEqual([]);
  });

  it("global enforce overrides a report deployment", async () => {
    running = null;
    await expect(authority({ globalMode: "enforce" }).prepare({ baseUrl: URL_, path: "/generate", scope: "video:run", payload: PAYLOAD, job: JOB }))
      .rejects.toMatchObject({ code: "IMAGE_UNATTESTED" });
  });
});
