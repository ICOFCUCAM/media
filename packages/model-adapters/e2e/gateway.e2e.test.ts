/**
 * PR 2 acceptance (docs/39): the real Python GPU worker (apps/gpu-worker) in
 * GATEWAY_MODE=enforce, driven by the real TypeScript Gateway Authority.
 *
 *   Cineforge job → authorized token → approved deployment → approved immutable
 *   image digest → GPU verification → authorized execution → audit record
 *
 * and every rejection the acceptance condition lists. Runs when GATEWAY_E2E=1
 * (CI job `gateway-e2e`); needs python3 with the gpu-worker deps and ffmpeg.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyVideoResult, syncPolicy } from "@cineforge/shared";

import {
  GatewayAdmin,
  GatewayAuthority,
  MemoryGatewayStore,
  RunpodClient,
  authzDigest,
  mintExecutionToken,
  parseSigningKey,
  sha256Hex,
  type JobContext,
  type MediaPresigner,
} from "../src";

const RUN = process.env.GATEWAY_E2E === "1";
const WORKER_DIR = fileURLToPath(new URL("../../../apps/gpu-worker", import.meta.url));
const DEPLOYMENT = "dep-e2e-wan";
const IMAGE = `icofcucam/cineforge-gpu@sha256:${"ab".repeat(32)}`;
const KEY = parseSigningKey(`k1:${randomBytes(32).toString("base64url")}`);

/** S3 stand-in: objects + one-time URLs (a signature works once, then is gone). */
class FakeObjectStore implements MediaPresigner {
  readonly kind = "e2e";
  readonly objects = new Map<string, Buffer>();
  private readonly sigs = new Map<string, { key: string; method: string }>();
  writes = 0;
  server!: Server;
  base = "";

  async start() {
    this.server = createServer((req, res) => {
      const u = new URL(req.url!, "http://x");
      const sig = u.searchParams.get("sig") ?? "";
      const grant = this.sigs.get(sig);
      if (!grant || grant.method !== req.method) return res.writeHead(403).end("bad or used signature");
      this.sigs.delete(sig); // one-time
      if (req.method === "GET") {
        const body = this.objects.get(grant.key);
        return body ? res.writeHead(200).end(body) : res.writeHead(404).end();
      }
      if (this.objects.has(grant.key)) return res.writeHead(409).end("exists"); // never overwrite
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        this.objects.set(grant.key, Buffer.concat(chunks));
        this.writes++;
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  private url(key: string, method: string) {
    const sig = randomUUID();
    this.sigs.set(sig, { key, method });
    return `${this.base}/o/${encodeURIComponent(key)}?sig=${sig}`;
  }
  async presignGet(key: string) { return this.url(key, "GET"); }
  async presignPut(key: string) { return this.url(key, "PUT"); }
  async head(key: string) { const b = this.objects.get(key); return b ? { size: b.length } : null; }
}

let pod: ChildProcess;
let podUrl = "";
let podLog = "";
const objects = new FakeObjectStore();
const store = new MemoryGatewayStore();
let runningImage: string | null = IMAGE;
const attestor = { runningImage: async () => runningImage };
const JOB: JobContext = { shotId: randomUUID(), projectId: randomUUID(), shotStatus: "GENERATING", projectStatus: "GENERATING", modelId: "wan-2.1" };

function authority() {
  return new GatewayAuthority({ store, signingKey: KEY, presigner: objects, attestor, globalMode: "enforce", log: () => {} });
}

async function rawGenerate(token: string | null, body: string) {
  const res = await fetch(`${podUrl}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as { detail?: { error?: string }; error?: string } };
}

/** A body + matching authz exactly as the approved deployment would authorize it. */
function approvedRequest(jobId: string, over: Record<string, unknown> = {}) {
  const dep = store.deployments.get(DEPLOYMENT)!;
  const m = dep.manifest!.models[0]!;
  const authz = authzDigest({
    workflow: "diffusers.wan-2.1.t2v@1", runtime: dep.manifest!.runtime,
    models: [{ role: "t2v", id: m.id, revision: m.revision, weights: m.weights }], loras: [],
    timing: { durationUs: 1_000_000, fps: 8, width: 64, height: 64 },
  });
  const body = JSON.stringify({
    jobId, prompt: "probe", durationSec: 1, width: 64, height: 64, fps: 8,
    output: { videoKey: `projects/${JOB.projectId}/video/${jobId}.mp4`, videoUploadUrl: `${objects.base}/o/x?sig=none` },
    ...over,
  });
  return { body, authz };
}

describe.runIf(RUN)("Media Runtime Gateway — end-to-end acceptance (enforce)", () => {
  beforeAll(async () => {
    await objects.start();
    const port = 18000 + Math.floor(Math.random() * 1000);
    podUrl = `http://127.0.0.1:${port}`;
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp",
      GATEWAY_MODE: "enforce", DEPLOYMENT_ID: DEPLOYMENT, GPU_JWT_PUBLIC_KEYS: `k1:${KEY.publicKeyB64}`,
      MODEL_NAME: "wan-2.1", CINEFORGE_PLACEHOLDER: "1", GATEWAY_ALLOW_HTTP_STORAGE: "1",
      CINEFORGE_SOURCE_COMMIT: "e2e", PYTHONUNBUFFERED: "1",
    }; // deliberately no S3_* / AWS_* — enforce mode refuses to start with them
    pod = spawn(process.env.GATEWAY_E2E_PYTHON ?? "python3", ["-m", "uvicorn", "app.server:app", "--host", "127.0.0.1", "--port", String(port)], { cwd: WORKER_DIR, env });
    pod.stdout?.on("data", (d) => (podLog += d));
    pod.stderr?.on("data", (d) => (podLog += d));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${podUrl}/livez`)).ok) break;
      } catch { /* starting */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect((await fetch(`${podUrl}/livez`)).ok, podLog).toBe(true);

    // Operator flow: register → approve (manifest + immutable image) → enforce (live probes).
    const admin = new GatewayAdmin({ store, signingKey: KEY, attestor, actor: "operator:e2e" });
    await admin.register({ id: DEPLOYMENT, modelId: "wan-2.1", baseUrl: podUrl, runpodPodId: "pod-e2e" });
    await admin.approve(DEPLOYMENT, IMAGE, { allowPlaceholder: true });
    const { evidence } = await admin.enforce(DEPLOYMENT);
    expect(evidence).toMatchObject({ runningImage: IMAGE, unauthenticatedStatus: 401, forgedTokenStatus: 401, sourceCommit: "e2e" });
    objects.objects.set(`projects/${JOB.projectId}/seeds/s1.png`, Buffer.from("seed-frame"));
  }, 60_000);

  afterAll(() => {
    pod?.kill();
    objects.server?.close();
  });

  it("authorized job: token → approved deployment → approved digest → GPU verification → execution → audit", async () => {
    const client = new RunpodClient({ baseUrl: podUrl, authorizer: authority() });
    const out = await client.generate(
      { prompt: "a lighthouse at dusk", durationSec: 1, width: 64, height: 64, fps: 8, referenceImageKeys: [`projects/${JOB.projectId}/seeds/s1.png`] },
      undefined,
      JOB,
    );
    expect(out.videoKey).toMatch(new RegExp(`^projects/${JOB.projectId}/video/g_[0-9a-f-]+\\.mp4$`));
    expect(objects.objects.get(out.videoKey)!.length).toBeGreaterThan(0);
    // docs/38 §AV.5: the worker measured what it produced; Cineforge judges it.
    const decision = classifyVideoResult({
      timing: out.timing,
      request: { durationUs: 1_000_000n, fps: { num: 8, den: 1 } },
      policy: syncPolicy("cinematic"),
    });
    expect(decision).toMatchObject({ outcome: "ACCEPTED", actualDurationUs: 1_000_000n });
    const grant = [...store.grants.values()].find((g) => g.outputKeys.includes(out.videoKey))!;
    expect(grant).toMatchObject({ outcome: "completed", deploymentId: DEPLOYMENT, shotId: JOB.shotId, projectId: JOB.projectId, imageRef: IMAGE, mode: "enforce" });
    expect(grant.inputKeys).toEqual([`projects/${JOB.projectId}/seeds/s1.png`]);
    expect(grant.authzDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(store.events.some((e) => e.type === "deployment.enforcement_changed" && e.code === "enforce")).toBe(true);
  }, 60_000);

  // ── rejections ─────────────────────────────────────────────────────────
  it("missing credentials", async () => {
    const before = objects.writes;
    expect((await rawGenerate(null, approvedRequest("g_none").body)).json.detail?.error).toBe("MISSING_TOKEN");
    expect(objects.writes).toBe(before);
  });

  it("invalid signature", async () => {
    const { body, authz } = approvedRequest("g_sig");
    const forged = parseSigningKey(`k1:${randomBytes(32).toString("base64url")}`);
    const t = mintExecutionToken({ key: forged, deploymentId: DEPLOYMENT, subject: "g_sig", scope: "video:run", body, authz }).token;
    expect(await rawGenerate(t, body)).toMatchObject({ status: 401, json: { detail: { error: "BAD_SIGNATURE" } } });
  });

  it("expired token", async () => {
    const { body, authz } = approvedRequest("g_exp");
    const t = mintExecutionToken({ key: KEY, deploymentId: DEPLOYMENT, subject: "g_exp", scope: "video:run", body, authz, now: Date.now() / 1000 - 3600 }).token;
    expect(await rawGenerate(t, body)).toMatchObject({ status: 401, json: { detail: { error: "TOKEN_EXPIRED" } } });
  });

  it("replayed token", async () => {
    const t = mintExecutionToken({ key: KEY, deploymentId: DEPLOYMENT, subject: "probe", scope: "status", body: "" }).token;
    expect((await fetch(`${podUrl}/health`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(200);
    expect((await fetch(`${podUrl}/health`, { headers: { authorization: `Bearer ${t}` } })).status).toBe(401);
  });

  it("wrong job binding", async () => {
    const { body, authz } = approvedRequest("g_job_B");
    const t = mintExecutionToken({ key: KEY, deploymentId: DEPLOYMENT, subject: "g_job_A", scope: "video:run", body, authz }).token;
    expect(await rawGenerate(t, body)).toMatchObject({ status: 403, json: { detail: { error: "JOB_MISMATCH" } } });
  });

  it("wrong deployment binding", async () => {
    const { body, authz } = approvedRequest("g_dep");
    const t = mintExecutionToken({ key: KEY, deploymentId: "dep-some-other-pod", subject: "g_dep", scope: "video:run", body, authz }).token;
    expect(await rawGenerate(t, body)).toMatchObject({ status: 403, json: { detail: { error: "WRONG_DEPLOYMENT" } } });
  });

  it("body altered after signing", async () => {
    const { body, authz } = approvedRequest("g_body");
    const t = mintExecutionToken({ key: KEY, deploymentId: DEPLOYMENT, subject: "g_body", scope: "video:run", body, authz }).token;
    expect(await rawGenerate(t, body.replace("probe", "other"))).toMatchObject({ status: 403, json: { detail: { error: "BODY_MISMATCH" } } });
  });

  it("wrong authorization fingerprint (unauthorized model/runtime substitution)", async () => {
    const { body } = approvedRequest("g_fp");
    const otherModel = authzDigest({
      workflow: "diffusers.wan-2.1.t2v@1", runtime: "diffusers@0.33.1",
      models: [{ role: "t2v", id: "Some/Other-Model", revision: "c".repeat(40), weights: "0".repeat(64) }], loras: [],
      timing: { durationUs: 1_000_000, fps: 8, width: 64, height: 64 },
    });
    const t = mintExecutionToken({ key: KEY, deploymentId: DEPLOYMENT, subject: "g_fp", scope: "video:run", body, authz: otherModel }).token;
    expect(await rawGenerate(t, body)).toMatchObject({ status: 403, json: { detail: { error: "AUTHZ_MISMATCH" } } });
  });

  it("unauthorized model for the deployment is refused before any GPU call", async () => {
    const client = new RunpodClient({ baseUrl: podUrl, authorizer: authority() });
    await expect(client.generate({ prompt: "x", durationSec: 1, width: 64, height: 64, fps: 8 }, undefined, { ...JOB, modelId: "hunyuan" }))
      .rejects.toMatchObject({ code: "MODEL_NOT_AUTHORIZED" });
    expect([...store.grants.values()].at(-1)).toMatchObject({ outcome: "denied", errorCode: "MODEL_NOT_AUTHORIZED" });
  });

  it("image digest mismatch blocks dispatch and blocks enforcement", async () => {
    runningImage = `icofcucam/cineforge-gpu@sha256:${"cd".repeat(32)}`;
    try {
      const fresh = authority(); // no cached attestation
      await expect(new RunpodClient({ baseUrl: podUrl, authorizer: fresh }).generate({ prompt: "x", durationSec: 1, width: 64, height: 64, fps: 8 }, undefined, JOB))
        .rejects.toMatchObject({ code: "IMAGE_DIGEST_MISMATCH" });
      const admin = new GatewayAdmin({ store, signingKey: KEY, attestor, actor: "operator:e2e" });
      await expect(admin.enforce(DEPLOYMENT)).rejects.toMatchObject({ code: "IMAGE_DIGEST_MISMATCH" });
    } finally {
      runningImage = IMAGE;
    }
  });

  it("unauthorized GPU requests on every protected route; trainer disabled", async () => {
    for (const [method, path] of [["GET", "/health"], ["GET", "/capabilities"], ["POST", "/warm"], ["POST", "/generate"]] as const) {
      expect((await fetch(`${podUrl}${path}`, { method })).status, path).toBe(401);
    }
    const status = mintExecutionToken({ key: KEY, deploymentId: DEPLOYMENT, subject: "s", scope: "status", body: "" }).token;
    expect((await fetch(`${podUrl}/warm`, { method: "POST", headers: { authorization: `Bearer ${status}` } })).status).toBe(403); // wrong scope
    expect((await fetch(`${podUrl}/train`, { method: "POST" })).status).toBe(503);
    expect(await (await fetch(`${podUrl}/livez`)).text()).toBe("ok");
  });

  // ── authz v2: LoRAs are content-addressed ────────────────────────────────
  const LORA = () => `projects/${JOB.projectId}/identities/c1/v1/lora.safetensors`;
  const loraShot = (sha?: string) => ({
    prompt: "identity lock", durationSec: 1, width: 64, height: 64, fps: 8,
    loraKeys: [LORA()], ...(sha ? { loraSha256: { [LORA()]: sha } } : {}),
  });

  it("the approved manifest is authz v2", () => {
    expect(store.deployments.get(DEPLOYMENT)!.manifest!.authzVersion).toBe(2);
  });

  it("a LoRA whose bytes match its recorded hash is loaded", async () => {
    const bytes = Buffer.from("real-adapter-weights");
    objects.objects.set(LORA(), bytes);
    const out = await new RunpodClient({ baseUrl: podUrl, authorizer: authority() })
      .generate(loraShot(sha256Hex(bytes)), undefined, JOB);
    expect(objects.objects.has(out.videoKey)).toBe(true);
  }, 60_000);

  it("a swapped LoRA (same key, different bytes) is refused by the GPU before loading", async () => {
    objects.objects.set(LORA(), Buffer.from("swapped-weights"));
    const before = objects.writes;
    await expect(new RunpodClient({ baseUrl: podUrl, authorizer: authority() })
      .generate(loraShot(sha256Hex("real-adapter-weights")), undefined, JOB)).rejects.toThrow(/409.*LORA_HASH_MISMATCH/);
    expect(objects.writes).toBe(before); // nothing produced
    expect([...store.grants.values()].at(-1)).toMatchObject({ outcome: "failed", errorCode: "HTTP_409" });
  }, 60_000);

  it("a LoRA with no recorded hash is denied before any GPU call", async () => {
    await expect(new RunpodClient({ baseUrl: podUrl, authorizer: authority() }).generate(loraShot(), undefined, JOB))
      .rejects.toMatchObject({ code: "LORA_UNHASHED" });
  });

    it("every grant is traceable: job, deployment, image, digest, body hash, outcome", async () => {
    const done = [...store.grants.values()].filter((g) => g.outcome === "completed");
    expect(done.length).toBeGreaterThan(0);
    for (const g of done) {
      expect(g.jti && g.deploymentId && g.shotId && g.projectId && g.imageRef && g.authzDigest && g.bodySha256).toBeTruthy();
      expect(g.bodySha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(sha256Hex("")).toHaveLength(64);
  });
});
