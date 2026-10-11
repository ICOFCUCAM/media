/**
 * The self-hosted voice path of the Media Runtime Gateway (docs/74):
 *  - voice authz golden vector + a token whose fixture the Python voice
 *    service verifies (apps/gpu-voice/tests/test_voice_crosslang.py);
 *  - prepareVoice: owner-scoped one-time I/O, digest from the approved
 *    manifest, grants recorded and outputs verified.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { GatewayAuthority } from "./authority";
import { MemoryGatewayStore } from "./memory";
import { mintExecutionToken, parseSigningKey, sha256Hex, verifyExecutionToken } from "./token";
import { GatewayDeniedError, type MediaPresigner, type RuntimeDeployment } from "./types";
import { voiceAuthzDigest } from "./voice-authz";

const FIXTURE = fileURLToPath(new URL("../../../../apps/gpu-voice/tests/fixtures/voice_crosslang.json", import.meta.url));
const KEY = parseSigningKey(`k1:${Buffer.alloc(32, 5).toString("base64url")}`);
const IMAGE = `icofcucam/cineforge-gpu-voice-qwen3@sha256:${"cd".repeat(32)}`;
const URL_ = "https://voice-1-8000.proxy.runpod.net";
const MODELS = [{ role: "tts", id: "Qwen/Qwen3-TTS-12Hz-1.7B-Base", revision: "a".repeat(40), weights: "f".repeat(64) }];

export function buildVoiceFixture() {
  const key = parseSigningKey(`kfix:${Buffer.alloc(32, 9).toString("base64url")}`);
  const inputs = [{ key: "voices/u1/v1/sample.wav", sha256: "ab".repeat(32) }];
  const authz = voiceAuthzDigest({ engine: "qwen3-tts", operation: "enroll", runtime: "qwen-tts@0.1.1", models: MODELS, inputs });
  const body = JSON.stringify({ voiceId: "v1", language: "en", reference: inputs[0], referenceText: "Hallo, dette er stemmen min — æøå.",
    jobId: "g_voice_fixture" });
  const { token } = mintExecutionToken({ key, deploymentId: "dep-voice-fixture", subject: "g_voice_fixture", scope: "voice:enroll",
    body, authz, now: 1_800_000_000, jti: "jti-voice-fixture", ttlSec: 120 });
  return { publicKey: `kfix:${key.publicKeyB64}`, deploymentId: "dep-voice-fixture", now: 1_800_000_000, models: MODELS,
    runtime: "qwen-tts@0.1.1", inputs, body, authz, token };
}

describe("voice cross-language contract", () => {
  it("voice authz binds engine, operation, runtime, models and inputs by content hash", () => {
    const base = { engine: "qwen3-tts", operation: "speak" as const, runtime: "qwen-tts@0.1.1", models: MODELS, inputs: [{ key: "k", sha256: "1".repeat(64) }] };
    const d = voiceAuthzDigest(base);
    expect(voiceAuthzDigest({ ...base, inputs: [{ key: "k", sha256: "2".repeat(64) }] })).not.toBe(d);
    expect(voiceAuthzDigest({ ...base, operation: "enroll" })).not.toBe(d);
    expect(voiceAuthzDigest({ ...base, engine: "cosyvoice-3" })).not.toBe(d);
    expect(voiceAuthzDigest({ ...base, models: [{ ...MODELS[0]!, revision: "b".repeat(40) }] })).not.toBe(d);
  });

  it("the minted token and digest equal the committed fixture the Python service verifies", () => {
    const fx = buildVoiceFixture();
    if (process.env.UPDATE_FIXTURES === "1") writeFileSync(FIXTURE, JSON.stringify(fx, null, 2) + "\n");
    expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(fx);
  });
});

class FakePresigner implements MediaPresigner {
  readonly kind = "fake";
  objects = new Map<string, number>();
  async presignGet(key: string) { return `https://store.example/get/${key}`; }
  async presignPut(key: string, ct: string) { return `https://store.example/put/${key}?ct=${ct}`; }
  async head(key: string) { const s = this.objects.get(key); return s ? { size: s } : null; }
}

function deployment(over: Partial<RuntimeDeployment> = {}): RuntimeDeployment {
  return { id: "dep-qwen-1", modelId: "qwen3-tts", baseUrl: URL_, runpodPodId: "pod-v1", status: "approved", enforcement: "enforce",
    approvedImage: IMAGE, manifest: { authzVersion: 1, runtime: "qwen-tts@0.1.1", models: MODELS }, ...over };
}

let store: MemoryGatewayStore;
let presigner: FakePresigner;
const authority = (over: Partial<ConstructorParameters<typeof GatewayAuthority>[0]> = {}) =>
  new GatewayAuthority({ store, signingKey: KEY, presigner, attestor: { runningImage: async () => IMAGE }, log: () => {}, ...over });

const ENROLL = {
  baseUrl: URL_, path: "/v1/voices/enroll", scope: "voice:enroll" as const, engineId: "qwen3-tts", ownerId: "u1",
  payload: { voiceId: "v1", language: "en", reference: { key: "voices/u1/v1/sample.wav", sha256: "ab".repeat(32) } },
  inputs: [{ key: "voices/u1/v1/sample.wav", sha256: "ab".repeat(32) }],
  outputs: [{ name: "artifact", key: "voices/u1/v1/engines/qwen3-tts/{grant}.safetensors", contentType: "application/octet-stream" }],
  outputField: "output" as const,
};

beforeEach(async () => {
  store = new MemoryGatewayStore();
  presigner = new FakePresigner();
  await store.saveDeployment(deployment());
});

describe("GatewayAuthority.prepareVoice", () => {
  it("binds the token to deployment, scope, grant, body and the voice digest from the approved manifest", async () => {
    const call = await authority().prepareVoice(ENROLL);
    const claims = verifyExecutionToken(call.headers.authorization!.replace("Bearer ", ""), KEY.publicKeyB64)!;
    const body = JSON.parse(call.body);
    expect(claims).toMatchObject({ aud: "dep-qwen-1", scope: "voice:enroll", sub: body.jobId, bh: sha256Hex(call.body) });
    expect(claims.authz).toBe(voiceAuthzDigest({ engine: "qwen3-tts", operation: "enroll", runtime: "qwen-tts@0.1.1", models: MODELS, inputs: ENROLL.inputs }));
    expect(body.inputUrls).toEqual({ "voices/u1/v1/sample.wav": "https://store.example/get/voices/u1/v1/sample.wav" });
    expect(body.output.key).toBe(`voices/u1/v1/engines/qwen3-tts/${body.jobId}.safetensors`);
    expect(call.grant!.outputKeys.artifact).toBe(body.output.key);
    expect(store.grants.get(body.jobId)).toMatchObject({ scope: "voice:enroll", outcome: "issued", inputKeys: ["voices/u1/v1/sample.wav"] });

    presigner.objects.set(body.output.key, 42);
    await call.grant!.complete([{ key: body.output.key, bytes: 42 }], 1200);
    expect(store.grants.get(body.jobId)).toMatchObject({ outcome: "completed", outputBytes: 42, gpuMs: 1200 });
  });

  it("refuses another owner's objects in every mode — a voice is only ever its owner's", async () => {
    await store.saveDeployment(deployment({ enforcement: "report" }));
    const theirs = { ...ENROLL, inputs: [{ key: "voices/u2/v9/sample.wav", sha256: "ab".repeat(32) }] };
    await expect(authority().prepareVoice(theirs)).rejects.toMatchObject({ code: "INPUT_OUT_OF_SCOPE" });
    const escape = { ...ENROLL, outputs: [{ name: "artifact", key: "voices/u1/../u2/x.bin", contentType: "x" }] };
    await expect(authority().prepareVoice(escape)).rejects.toMatchObject({ code: "OUTPUT_OUT_OF_SCOPE" });
  });

  it("enforce refuses another engine's deployment, unhashed inputs and an unapproved image", async () => {
    await expect(authority().prepareVoice({ ...ENROLL, engineId: "cosyvoice-3" })).rejects.toMatchObject({ code: "MODEL_NOT_AUTHORIZED" });
    await expect(authority().prepareVoice({ ...ENROLL, inputs: [{ key: "voices/u1/v1/sample.wav", sha256: "" }] })).rejects.toMatchObject({ code: "INPUT_UNHASHED" });
    await expect(authority({ attestor: { runningImage: async () => `x/y@sha256:${"0".repeat(64)}` } }).prepareVoice(ENROLL))
      .rejects.toBeInstanceOf(GatewayDeniedError);
    expect([...store.grants.values()].every((g) => g.outcome === "denied")).toBe(true);
  });

  it("report mode on an unregistered pod sends the unsigned call with its one-time URLs, and records it", async () => {
    const call = await authority().prepareVoice({ ...ENROLL, baseUrl: "https://elsewhere.example" });
    expect(call.headers).toEqual({});
    expect(JSON.parse(call.body).output.uploadUrl).toMatch(/^https:\/\/store\.example\/put\//);
    expect(store.events.map((e) => e.type)).toEqual(["dispatch.would_deny", "dispatch.legacy"]);
  });

  it("without a presigner nothing can be read or written: refused even in report mode", async () => {
    await store.saveDeployment(deployment({ enforcement: "report" }));
    await expect(authority({ presigner: null }).prepareVoice(ENROLL)).rejects.toMatchObject({ code: "NO_PRESIGNER" });
  });

  it("a missing or wrong-sized output fails the grant", async () => {
    const call = await authority().prepareVoice(ENROLL);
    const key = call.grant!.outputKeys.artifact!;
    await expect(call.grant!.complete([{ key, bytes: 42 }])).rejects.toMatchObject({ code: "OUTPUT_NOT_VERIFIED" });
    presigner.objects.set(key, 41);
    await expect(call.grant!.complete([{ key, bytes: 42 }])).rejects.toMatchObject({ code: "OUTPUT_NOT_VERIFIED" });
    await expect(call.grant!.complete([])).rejects.toMatchObject({ code: "OUTPUT_KEY_MISMATCH" });
  });

  it("evict carries a body-bound token without a grant row", async () => {
    const call = await authority().prepareVoice({ baseUrl: URL_, path: "/v1/voices/evict", scope: "voice:evict", engineId: "qwen3-tts", ownerId: "u1",
      payload: { keys: ["voices/u1/v1/engines/qwen3-tts/g_1.safetensors"] } });
    const claims = verifyExecutionToken(call.headers.authorization!.replace("Bearer ", ""), KEY.publicKeyB64)!;
    expect(claims.scope).toBe("voice:evict");
    expect(claims.authz).toBeUndefined();
    expect(call.grant).toBeNull();
    expect(store.grants.size).toBe(0);
  });
});
