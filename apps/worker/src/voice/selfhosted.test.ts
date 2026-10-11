/**
 * The self-hosted voice adapter against the REAL Gateway Authority (in-memory
 * store) and a fake GPU voice service that checks every execution token the
 * way apps/gpu-voice does: signature, deployment, scope, grant, body hash and
 * the voice authz digest recomputed from its own manifest and the request.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  GatewayAuthority,
  MemoryGatewayStore,
  parseSigningKey,
  sha256Hex,
  verifyExecutionToken,
  voiceAuthzDigest,
  type MediaPresigner,
} from "@cineforge/model-adapters";
import { SelfHostedVoiceEngine, ownerOf, type SelfHostedDeps, type VoiceStorage } from "./selfhosted";

const KEY = parseSigningKey(`k1:${Buffer.alloc(32, 11).toString("base64url")}`);
const BASE = "https://voice-qwen-8000.proxy.runpod.net";
const REV = "c".repeat(40);
const IMAGE = `me/cineforge-gpu-voice-qwen3-tts@sha256:${"ab".repeat(32)}`;
const MODELS = [{ role: "tts", id: "Qwen/Qwen3-TTS-12Hz-1.7B-Base", revision: REV, weights: "f".repeat(64) }];
const ENV = { VOICE_GPU_QWEN3_URL: BASE, VOICE_GPU_QWEN3_REVISION: REV };
const U = "user-1";

let dir = "";
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "cf-selfhosted-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/** Object storage behind the presigned URLs, shared by the worker and the fake pod. */
class Store implements MediaPresigner, VoiceStorage {
  readonly kind = "fake";
  objects = new Map<string, Buffer>();
  deleted: string[] = [];
  async presignGet(key: string) { return `https://store/get/${key}`; }
  async presignPut(key: string) { return `https://store/put/${key}`; }
  async head(key: string) { const b = this.objects.get(key); return b ? { size: b.length } : null; }
  async download(key: string, path: string) { const b = this.objects.get(key); if (!b) throw new Error(`no ${key}`); await writeFile(path, b); }
  async upload(path: string, key: string) { this.objects.set(key, await readFile(path)); }
  async deleteKeys(keys: string[]) { for (const k of keys) { this.objects.delete(k); this.deleted.push(k); } }
}

interface PodOpts { real?: boolean; revision?: string; model?: string; async?: boolean; tamper?: boolean }

/** A fake apps/gpu-voice pod: verifies tokens like app/server.py and does the I/O through the URLs. */
function pod(store: Store, opts: PodOpts = {}) {
  const seen: { path: string; scope: string; sub: string }[] = [];
  const tasks = new Map<string, unknown>();
  const real = opts.real ?? true;
  const caps = { model: opts.model ?? "qwen3-tts", realExecution: real, execution: real ? "real" : "placeholder",
    manifest: { authzVersion: 1, runtime: "qwen-tts@0.1.1", models: [{ ...MODELS[0]!, revision: opts.revision ?? REV, pinned: true }] } };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const check = (init: RequestInit | undefined, scope: string) => {
    const auth = new Headers(init?.headers).get("authorization");
    const claims = auth ? verifyExecutionToken(auth.replace("Bearer ", ""), KEY.publicKeyB64) : null;
    if (!claims) return { error: json(401, { detail: { error: "MISSING_TOKEN" } }) };
    if (claims.aud !== "dep-qwen" || claims.scope !== scope) return { error: json(403, { detail: { error: "WRONG_SCOPE" } }) };
    if (claims.bh !== sha256Hex(String(init?.body ?? ""))) return { error: json(403, { detail: { error: "BODY_MISMATCH" } }) };
    return { claims };
  };
  const get = (url: string) => store.objects.get(url.replace("https://store/get/", ""))!;
  const put = (url: string, b: Buffer) => store.objects.set(url.replace("https://store/put/", ""), b);
  const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const finish = (init: RequestInit | undefined, result: unknown) => {
    if (!opts.async || new Headers(init?.headers).get("x-cineforge-async") !== "1") return json(200, result);
    const id = `t${tasks.size + 1}`;
    tasks.set(id, result);
    return json(202, { taskId: id });
  };
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.slice(BASE.length);
    if (path === "/capabilities" || path === "/health" || path.startsWith("/v1/jobs/")) {
      const c = check(init, "status");
      if (c.error) return c.error;
      if (path === "/capabilities") return json(200, caps);
      if (path === "/health") return json(200, { status: "ok", execution: caps.execution });
      return json(200, { status: "done", result: tasks.get(path.split("/").pop()!) });
    }
    const body = JSON.parse(String(init?.body));
    const op = { "/v1/voices/enroll": ["voice:enroll", "enroll"], "/v1/speech": ["voice:run", "speak"], "/v1/similarity": ["voice:score", "score"], "/v1/voices/evict": ["voice:evict", null] }[path];
    if (!op) return json(404, {});
    const c = check(init, op[0]!);
    if (c.error) return c.error;
    seen.push({ path, scope: c.claims!.scope, sub: c.claims!.sub });
    if (c.claims!.sub !== body.jobId && op[1]) return json(403, { detail: { error: "JOB_MISMATCH" } });
    if (op[1]) {
      const inputs = path === "/v1/voices/enroll" ? [body.reference] : path === "/v1/speech" ? [body.voice] : [body.reference, ...body.candidates];
      const expect = voiceAuthzDigest({ engine: "qwen3-tts", operation: op[1] as "enroll", runtime: "qwen-tts@0.1.1", models: MODELS,
        inputs: inputs.map((i: { key: string; sha256: string }) => ({ key: i.key, sha256: i.sha256 })) });
      if (c.claims!.authz !== expect) return json(403, { detail: { error: "AUTHZ_MISMATCH" } });
      for (const i of inputs) if (sha(get(body.inputUrls[i.key])) !== i.sha256) return json(409, { detail: { error: "INPUT_INTEGRITY" } });
    }
    if (path === "/v1/voices/enroll") {
      const art = Buffer.from(`artifact-of:${body.voiceId}`);
      put(body.output.uploadUrl, art);
      return finish(init, { artifactType: "speaker_embedding", artifactKey: opts.tamper ? `voices/${U}/elsewhere.bin` : body.output.key, artifactBytes: art.length,
        artifactSha256: sha(art), metadata: { mode: body.referenceText ? "icl" : "x_vector_only" }, gpuMs: 900, realExecution: real, execution: { mode: caps.execution } });
    }
    if (path === "/v1/speech") {
      const items = body.items.map((it: { id: string; text: string }) => {
        const wav = Buffer.from(`RIFF:${it.text}`);
        put(body.outputs[it.id].uploadUrl, wav);
        return { id: it.id, key: body.outputs[it.id].key, bytes: wav.length, durationSec: 1, sampleRate: 24000 };
      });
      return finish(init, { items, gpuMs: 1500, realExecution: real, execution: { mode: caps.execution, vramPeakMb: 6100 } });
    }
    if (path === "/v1/similarity") {
      const scores = Object.fromEntries(body.candidates.map((cd: { key: string }, n: number) => [cd.key, 0.9 - n * 0.1]));
      return finish(init, { scores, gpuMs: 40, realExecution: real });
    }
    return json(200, { evicted: 1 });
  }) as typeof fetch;
  return { fetch: f, seen };
}

let store: Store;
let gw: MemoryGatewayStore;

function engine(p: ReturnType<typeof pod>, env: Record<string, string> = ENV) {
  const authority = new GatewayAuthority({ store: gw, signingKey: KEY, presigner: store, attestor: { runningImage: async () => IMAGE }, log: () => {} });
  const deps: SelfHostedDeps = { authorizer: async () => authority, storage: async () => store, fetch: p.fetch, sleep: async () => {}, now: () => Date.now() };
  return new SelfHostedVoiceEngine("qwen3-tts", env, deps);
}

beforeEach(async () => {
  store = new Store();
  gw = new MemoryGatewayStore();
  await gw.saveDeployment({ id: "dep-qwen", modelId: "qwen3-tts", baseUrl: BASE, runpodPodId: "pod", status: "approved", enforcement: "enforce",
    approvedImage: IMAGE, manifest: { authzVersion: 1, runtime: "qwen-tts@0.1.1", models: MODELS } });
  store.objects.set(`voices/${U}/sample.wav`, Buffer.from("owner's own recording"));
});

async function enrolled(e: SelfHostedVoiceEngine) {
  const ref = join(dir, "ref.wav");
  await writeFile(ref, store.objects.get(`voices/${U}/sample.wav`)!);
  return e.enrollVoice({ voiceId: "v1", language: "en", referencePath: ref, userId: U, referenceKey: `voices/${U}/sample.wav`, referenceText: "hello" });
}

describe("self-hosted voice engine (docs/74)", () => {
  it("enrolls through a signed, digest-bound grant; the artifact lands in the owner's voices/ folder", async () => {
    const p = pod(store);
    const r = await enrolled(engine(p));
    const a = r.artifacts[0]!;
    expect(a.artifactType).toBe("speaker_embedding");
    expect(a.uri).toMatch(new RegExp(`^voices/${U}/v1/engines/qwen3-tts/g_[0-9a-f-]+\\.safetensors$`));
    expect(store.objects.has(a.uri)).toBe(true);
    expect(a.metadata).toMatchObject({ mode: "icl", engineVersion: `Qwen/Qwen3-TTS-12Hz-1.7B-Base@${REV.slice(0, 12)}`, realExecution: true });
    expect(a.metadata!.sha256).toBe(createHash("sha256").update(store.objects.get(a.uri)!).digest("hex"));
    const grant = [...gw.grants.values()].find((g) => g.scope === "voice:enroll")!;
    expect(grant).toMatchObject({ outcome: "completed", inputKeys: [`voices/${U}/sample.wav`], outputKeys: [a.uri], gpuMs: 900 });
  });

  it("speaks many lines in one GPU job, downloads each, then removes the hand-off objects", async () => {
    const p = pod(store, { async: true });
    const e = engine(p);
    const voice = (await enrolled(e)).artifacts[0]!;
    const reqs = ["One.", "Two.", "Three."].map((text, i) => ({ text, language: "en", voice, outPath: join(dir, `line-${i}`) }));
    const out = await e.synthesizeBatch(reqs);
    expect(out.map((o) => o.format)).toEqual(["wav", "wav", "wav"]);
    expect(await readFile(out[2]!.path, "utf8")).toBe("RIFF:Three.");
    expect(p.seen.filter((s) => s.path === "/v1/speech")).toHaveLength(1);
    expect([...store.objects.keys()].some((k) => k.includes("/tmp/"))).toBe(false);
    expect(e.lastVramPeakMb).toBe(6100);
    // A different language is a separate job (one voice, language and style per job).
    await e.synthesizeBatch([{ ...reqs[0]!, language: "fr" }, reqs[1]!]);
    expect(p.seen.filter((s) => s.path === "/v1/speech")).toHaveLength(3);
  });

  it("refuses a placeholder pod, another checkpoint revision, or another engine", async () => {
    await expect(enrolled(engine(pod(store, { real: false })))).rejects.toThrow(/no real model execution/);
    await expect(enrolled(engine(pod(store, { revision: "d".repeat(40) })))).rejects.toThrow(/configured for Qwen\/Qwen3-TTS-12Hz-1.7B-Base@c+/);
    await expect(enrolled(engine(pod(store, { model: "cosyvoice-3" })))).rejects.toThrow(/runs cosyvoice-3, not qwen3-tts/);
    // Local wiring only: placeholder allowed explicitly.
    const r = await enrolled(engine(pod(store, { real: false }), { ...ENV, VOICE_GPU_ALLOW_PLACEHOLDER: "1" }));
    expect(r.artifacts[0]!.metadata).toMatchObject({ realExecution: false });
  });

  it("an output written anywhere but the granted key is refused", async () => {
    await expect(enrolled(engine(pod(store, { tamper: true })))).rejects.toThrow(/not the granted/);
  });

  it("enrolls only the owner's own stored recording, and needs the pinned revision", async () => {
    const e = engine(pod(store));
    const ref = join(dir, "r2.wav");
    await writeFile(ref, "x");
    await expect(e.enrollVoice({ voiceId: "v1", language: "en", referencePath: ref, userId: U, referenceKey: "voices/someone-else/a.wav" })).rejects.toThrow(/owner's own stored recording/);
    await expect(e.enrollVoice({ voiceId: "v1", language: "en", referencePath: ref })).rejects.toThrow(/owner's own/);
    await expect(enrolled(engine(pod(store), { VOICE_GPU_QWEN3_URL: BASE }))).rejects.toThrow(/VOICE_GPU_QWEN3_REVISION not set/);
  });

  it("speaks only enrolled voices", async () => {
    await expect(engine(pod(store)).synthesize({ text: "Hi", language: "en", voice: null, outPath: join(dir, "x") })).rejects.toThrow(/only enrolled voices/);
  });

  it("an artifact without a recorded hash is hashed from storage before it is authorized", async () => {
    const p = pod(store);
    const e = engine(p);
    const voice = (await enrolled(e)).artifacts[0]!;
    const out = await e.synthesize({ text: "Hello.", language: "en", voice: { artifactType: voice.artifactType, uri: voice.uri }, outPath: join(dir, "h") });
    expect(await readFile(out.path, "utf8")).toBe("RIFF:Hello.");
  });

  it("scores voice similarity of recordings against the reference with one deployment", async () => {
    const e = engine(pod(store));
    const a = join(dir, "a.wav"), b = join(dir, "b.wav");
    await writeFile(a, "A");
    await writeFile(b, "B");
    const r = await e.similarity(`voices/${U}/sample.wav`, [a, b]);
    expect(r.scores).toEqual([0.9, 0.8]);
    expect(r.scorer).toMatch(/qwen3-tts speaker encoder/);
    expect([...store.objects.keys()].some((k) => k.includes("/tmp/similarity-"))).toBe(false);
  });

  it("deleteVoice erases the stored artifact and evicts it from the warm cache; never outside voices/", async () => {
    const p = pod(store);
    const e = engine(p);
    const voice = (await enrolled(e)).artifacts[0]!;
    await e.deleteVoice(voice);
    expect(store.objects.has(voice.uri)).toBe(false);
    expect(p.seen.at(-1)).toMatchObject({ path: "/v1/voices/evict", scope: "voice:evict" });
    await expect(e.deleteVoice({ artifactType: "speaker_embedding", uri: "projects/p/x.bin" })).rejects.toThrow(/not an owner's voices/);
  });

  it("health reports the deployment's engine and checkpoint", async () => {
    expect(await engine(pod(store)).health()).toMatchObject({ ok: true, detail: expect.stringMatching(/Qwen3-TTS-12Hz-1.7B-Base@c+ \(real\)/) });
    expect((await engine(pod(store, { real: false })).health()).ok).toBe(false);
  });

  it("ownerOf reads only voices/<owner>/ keys", () => {
    expect(ownerOf("voices/u1/a.wav")).toBe("u1");
    expect(ownerOf("voices/u1/../u2/a.wav")).toBeNull();
    expect(ownerOf("audio/x.wav")).toBeNull();
  });
});
