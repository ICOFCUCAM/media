/**
 * The ComfyUI image runtime end to end (docs/73): the real Python service
 * (apps/gpu-image, placeholder runtime, GATEWAY_MODE=enforce) driven by the
 * real TypeScript image authority and client, through a one-time-URL object
 * store.
 *
 *   register → approve (pod manifest incl. workflow hashes) → enforce (live
 *   probes) → signed image:run grant → still written through a one-time URL →
 *   read back and verified → grant completed
 *
 * plus the refusals: no token, a token for another workflow, an approved
 * manifest whose workflow hash differs from the pod's, a workflow the registry
 * does not have. Runs when GATEWAY_E2E=1 (CI job `gateway-e2e`).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  COMFY_WORKFLOWS,
  ComfyImageClient,
  GatewayAdmin,
  ImageGatewayAuthority,
  MemoryGatewayStore,
  imageAuthzDigest,
  mintExecutionToken,
  parseSigningKey,
  type MediaPresigner,
} from "../src";

const RUN = process.env.GATEWAY_E2E === "1";
const SERVICE_DIR = fileURLToPath(new URL("../../../apps/gpu-image", import.meta.url));
const DEPLOYMENT = "dep-e2e-comfy";
const IMAGE = `icofcucam/cineforge-gpu-image@sha256:${"cd".repeat(32)}`;
const KEY = parseSigningKey(`k1:${randomBytes(32).toString("base64url")}`);
const PROJECT = randomUUID();

class OneTimeStore implements MediaPresigner {
  readonly kind = "e2e";
  readonly objects = new Map<string, Buffer>();
  private readonly sigs = new Map<string, { key: string; method: string }>();
  server!: Server;
  base = "";

  async start() {
    this.server = createServer((req, res) => {
      const sig = new URL(req.url!, "http://x").searchParams.get("sig") ?? "";
      const grant = this.sigs.get(sig);
      if (!grant || grant.method !== req.method) return res.writeHead(403).end("bad or used signature");
      this.sigs.delete(sig);
      if (req.method === "GET") {
        const body = this.objects.get(grant.key);
        return body ? res.writeHead(200).end(body) : res.writeHead(404).end();
      }
      if (this.objects.has(grant.key)) return res.writeHead(409).end("exists");
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => { this.objects.set(grant.key, Buffer.concat(chunks)); res.writeHead(200).end(); });
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
const objects = new OneTimeStore();
const store = new MemoryGatewayStore();
const attestor = { runningImage: async () => IMAGE };
const authority = () => new ImageGatewayAuthority({ store, signingKey: KEY, presigner: objects, attestor, globalMode: "enforce", log: () => {} });

describe.runIf(RUN)("ComfyUI image runtime — end-to-end (enforce)", () => {
  beforeAll(async () => {
    await objects.start();
    const port = 19000 + Math.floor(Math.random() * 1000);
    podUrl = `http://127.0.0.1:${port}`;
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp",
      GATEWAY_MODE: "enforce", DEPLOYMENT_ID: DEPLOYMENT, GPU_JWT_PUBLIC_KEYS: `k1:${KEY.publicKeyB64}`,
      CINEFORGE_PLACEHOLDER: "1", GATEWAY_ALLOW_HTTP_STORAGE: "1", CINEFORGE_SOURCE_COMMIT: "e2e", PYTHONUNBUFFERED: "1",
    }; // no storage credentials: enforce refuses to start with them
    pod = spawn(process.env.GATEWAY_E2E_PYTHON ?? "python3", ["-m", "uvicorn", "app.server:app", "--host", "127.0.0.1", "--port", String(port)], { cwd: SERVICE_DIR, env });
    pod.stdout?.on("data", (d) => (podLog += d));
    pod.stderr?.on("data", (d) => (podLog += d));
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${podUrl}/livez`)).ok) break;
      } catch { /* starting */ }
      await new Promise((r) => setTimeout(r, 200));
    }
    expect((await fetch(`${podUrl}/livez`)).ok, podLog).toBe(true);
    const admin = new GatewayAdmin({ store, signingKey: KEY, attestor, actor: "operator:e2e" });
    await admin.register({ id: DEPLOYMENT, modelId: "comfyui-image", baseUrl: podUrl, runpodPodId: "pod-e2e" });
    // The placeholder runtime has no real weights: approving it needs the explicit test-only flag.
    await admin.approve(DEPLOYMENT, IMAGE, { allowPlaceholder: true });
    await admin.enforce(DEPLOYMENT);
  }, 60_000);

  afterAll(() => {
    pod?.kill();
    objects.server?.close();
  });

  it("the approved manifest carries the registry's workflow hashes", () => {
    const m = store.deployments.get(DEPLOYMENT)!.manifest!;
    expect(m.workflows?.map((w) => `${w.id}@${w.version}`).sort()).toEqual(["cineforge.still.ref@1", "cineforge.still.t2i@1"]);
    expect(m.workflows!.every((w) => /^[0-9a-f]{64}$/.test(w.sha256))).toBe(true);
    expect(store.deployments.get(DEPLOYMENT)!.enforcement).toBe("enforce");
  });

  it("draws a still through a signed grant; written once, read back and verified", async () => {
    const key = `projects/${PROJECT}/seeds/shot-1.png`;
    const client = new ComfyImageClient({ baseUrl: podUrl, authorizer: authority(), pollMaxMs: 50 });
    const out = await client.generate({ payload: { workflow: COMFY_WORKFLOWS.textToImage, prompt: "a lighthouse", seed: 5, width: 512, height: 288 }, outputKey: key });
    expect(out).toMatchObject({ imageKey: key, seed: 5, width: 512, height: 288, realExecution: false, runtime: "placeholder" });
    expect(objects.objects.get(key)!.subarray(0, 4).toString("latin1")).toBe("\x89PNG");
    const grant = [...store.grants.values()].find((g) => g.outputKeys[0] === key)!;
    expect(grant).toMatchObject({ scope: "image:run", outcome: "completed", projectId: PROJECT, mode: "enforce" });
  });

  it("reference stills read their inputs through one-time URLs", async () => {
    const ref = `projects/${PROJECT}/wardrobe/w1.png`;
    objects.objects.set(ref, Buffer.from("\x89PNG\r\n\x1a\nref", "latin1"));
    const key = `projects/${PROJECT}/seeds/shot-2.png`;
    const out = await new ComfyImageClient({ baseUrl: podUrl, authorizer: authority(), pollMaxMs: 50 })
      .generate({ payload: { workflow: COMFY_WORKFLOWS.reference, prompt: "Maya", seed: 6, width: 512, height: 512, referenceImageKeys: [ref] }, outputKey: key });
    expect(out.workflow.id).toBe("cineforge.still.ref");
    expect(out.execution).toMatchObject({ referencesGiven: 1 });
  });

  it("refuses: no token, a token for another workflow, a stale approved workflow hash", async () => {
    const dep = store.deployments.get(DEPLOYMENT)!;
    const body = JSON.stringify({ jobId: "g_x", workflow: COMFY_WORKFLOWS.textToImage, prompt: "x", seed: 1, width: 512, height: 512,
      output: { imageKey: `projects/${PROJECT}/x.png`, imageUploadUrl: `${objects.base}/o/x?sig=none` } });
    const post = async (token: string | null) => (await fetch(`${podUrl}/images`, { method: "POST", body,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } }));
    expect((await post(null)).status).toBe(401);
    const refWf = dep.manifest!.workflows!.find((w) => w.id === "cineforge.still.ref")!;
    const wrong = imageAuthzDigest({ workflow: refWf, runtime: dep.manifest!.runtime,
      models: refWf.models.map((k) => dep.manifest!.models.find((m) => m.role === k)!), loras: [], width: 512, height: 512 });
    const tok = mintExecutionToken({ key: KEY, deploymentId: DEPLOYMENT, subject: "g_x", scope: "image:run", body, authz: wrong }).token;
    const r = await post(tok);
    expect(r.status).toBe(403);
    expect(((await r.json()) as { detail: { error: string } }).detail.error).toBe("AUTHZ_MISMATCH");

    // An approved manifest naming another graph hash: the pod refuses the authority's token.
    const saved = structuredClone(dep);
    await store.saveDeployment({ ...dep, manifest: { ...dep.manifest!, workflows: dep.manifest!.workflows!.map((w) => ({ ...w, sha256: "0".repeat(64) })) } });
    await expect(new ComfyImageClient({ baseUrl: podUrl, authorizer: authority(), pollMaxMs: 50 })
      .generate({ payload: { workflow: COMFY_WORKFLOWS.textToImage, prompt: "x", seed: 1, width: 512, height: 512 }, outputKey: `projects/${PROJECT}/y.png` }))
      .rejects.toMatchObject({ status: 403, code: "AUTHZ_MISMATCH" });
    await store.saveDeployment(saved);

    await expect(authority().prepareImage({ baseUrl: podUrl, payload: { workflow: { id: "cineforge.still.t2i", version: 9 }, prompt: "x", seed: 1, width: 512, height: 512 },
      outputKey: `projects/${PROJECT}/z.png` })).rejects.toMatchObject({ code: "WORKFLOW_NOT_AUTHORIZED" });
  });
});
