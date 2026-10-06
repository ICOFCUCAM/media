/**
 * Deployment lifecycle for the Media Runtime Gateway: register → approve →
 * enforce (and back to report). The only way a deployment becomes enforcing,
 * and every step is recorded as a gateway event (docs/39).
 *
 * Enforcement preconditions (all checked live, at the moment of the switch):
 *  1. the deployment is approved, with an approved manifest;
 *  2. its approved image is an immutable `repo@sha256:<digest>` reference;
 *  3. the provider's control plane reports the pod running exactly that image;
 *  4. the pod reports GATEWAY_MODE=enforce, its own DEPLOYMENT_ID, and a
 *     manifest identical to the approved one;
 *  5. the pod rejects an unauthenticated request and a forged token.
 */
import { randomBytes } from "node:crypto";

import { mintExecutionToken, parseSigningKey, type SigningKey } from "./token";
import { IMMUTABLE_IMAGE, type GatewayStore, type ImageAttestor, type RuntimeDeployment, type RuntimeManifest } from "./types";

export interface AdminDeps {
  store: GatewayStore;
  signingKey: SigningKey;
  attestor: ImageAttestor;
  actor: string;
  fetchImpl?: typeof fetch;
}

interface Capabilities {
  model?: string;
  deploymentId?: string | null;
  gatewayMode?: string;
  manifest?: { authzVersion: number; runtime: string; models: { role: string; id: string; revision: string | null; weights: string | null; pinned?: boolean }[] };
  image?: { sourceCommit?: string | null };
}

export class GatewayAdminError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
  }
}

function sameManifest(a: RuntimeManifest, b: RuntimeManifest): boolean {
  const norm = (m: RuntimeManifest) =>
    JSON.stringify({
      v: m.authzVersion,
      r: m.runtime,
      m: [...m.models].map((x) => [x.role, x.id, x.revision, x.weights]).sort(),
    });
  return norm(a) === norm(b);
}

function toManifest(m: NonNullable<Capabilities["manifest"]>): RuntimeManifest {
  return {
    authzVersion: m.authzVersion,
    runtime: m.runtime,
    models: m.models.map((x) => ({ role: x.role, id: x.id, revision: x.revision ?? "", weights: x.weights ?? "" })),
  };
}

export class GatewayAdmin {
  private readonly fetch: typeof fetch;
  constructor(private readonly deps: AdminDeps) {
    this.fetch = deps.fetchImpl ?? fetch;
  }

  private async event(type: "deployment.registered" | "deployment.enforcement_changed", d: RuntimeDeployment, code: string, detail: Record<string, unknown>) {
    await this.deps.store.insertEvent({ type, deploymentId: d.id, grantId: null, code, detail, actor: this.deps.actor });
  }

  private async capabilities(d: RuntimeDeployment): Promise<Capabilities> {
    const { token } = mintExecutionToken({ key: this.deps.signingKey, deploymentId: d.id, subject: `admin_${Date.now()}`, scope: "status", body: "" });
    const res = await this.fetch(`${d.baseUrl.replace(/\/+$/, "")}/capabilities`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new GatewayAdminError("CAPABILITIES_UNAVAILABLE", `GET /capabilities → ${res.status}`);
    return (await res.json()) as Capabilities;
  }

  async register(input: { id: string; modelId: string; baseUrl: string; runpodPodId: string | null }) {
    const existing = await this.deps.store.deploymentById(input.id);
    if (existing && existing.enforcement === "enforce") throw new GatewayAdminError("ENFORCING", "set the deployment to report before re-registering");
    const d: RuntimeDeployment = { ...input, status: "pending", enforcement: "report", manifest: null, approvedImage: null };
    await this.deps.store.saveDeployment(d);
    await this.event("deployment.registered", d, "registered", { modelId: d.modelId, baseUrl: d.baseUrl, runpodPodId: d.runpodPodId });
    return d;
  }

  /** Capture the pod's manifest and approve it together with an immutable image. */
  async approve(id: string, image: string, opts: { allowPlaceholder?: boolean } = {}) {
    const d = await this.require(id);
    if (!IMMUTABLE_IMAGE.test(image)) throw new GatewayAdminError("MUTABLE_IMAGE", "approve only repo@sha256:<digest> references, never a tag");
    const running = await this.deps.attestor.runningImage(d);
    if (running !== image) throw new GatewayAdminError("IMAGE_DIGEST_MISMATCH", `provider reports ${running ?? "nothing"}`);
    const caps = await this.capabilities(d);
    if (caps.deploymentId !== d.id) throw new GatewayAdminError("DEPLOYMENT_ID_MISMATCH", `pod reports ${caps.deploymentId ?? "none"}`);
    if (caps.model !== d.modelId) throw new GatewayAdminError("MODEL_MISMATCH", `pod runs ${caps.model ?? "unknown"}`);
    const m = caps.manifest;
    if (!m) throw new GatewayAdminError("NO_MANIFEST", "pod reported no manifest");
    if (!opts.allowPlaceholder && (m.runtime === "placeholder" || m.models.some((x) => !x.pinned || !x.weights || x.weights === "placeholder"))) {
      throw new GatewayAdminError("UNPINNED_OR_PLACEHOLDER", "every model must be pinned with a resolved weights digest");
    }
    const manifest = toManifest(m);
    const updated: RuntimeDeployment = { ...d, status: "approved", manifest, approvedImage: image };
    await this.deps.store.saveDeployment(updated);
    await this.event("deployment.registered", updated, "approved", { image, manifest, sourceCommit: caps.image?.sourceCommit ?? null });
    return updated;
  }

  /** Switch a deployment to enforce — only when every precondition holds right now. */
  async enforce(id: string) {
    const d = await this.require(id);
    const evidence: Record<string, unknown> = {};
    if (d.status !== "approved" || !d.manifest) throw new GatewayAdminError("NOT_APPROVED", "approve the deployment first");
    if (!d.approvedImage || !IMMUTABLE_IMAGE.test(d.approvedImage)) throw new GatewayAdminError("NO_APPROVED_IMAGE_DIGEST", "no immutable approved image");
    const running = await this.deps.attestor.runningImage(d);
    evidence.runningImage = running;
    if (running !== d.approvedImage) throw new GatewayAdminError("IMAGE_DIGEST_MISMATCH", `provider reports ${running ?? "nothing"}, approved ${d.approvedImage}`);
    const caps = await this.capabilities(d);
    evidence.sourceCommit = caps.image?.sourceCommit ?? null;
    if (caps.gatewayMode !== "enforce") throw new GatewayAdminError("POD_NOT_ENFORCING", `pod GATEWAY_MODE is ${caps.gatewayMode ?? "unknown"}`);
    if (caps.deploymentId !== d.id) throw new GatewayAdminError("DEPLOYMENT_ID_MISMATCH", `pod reports ${caps.deploymentId ?? "none"}`);
    if (!caps.manifest || !sameManifest(toManifest(caps.manifest), d.manifest)) throw new GatewayAdminError("MANIFEST_MISMATCH", "pod manifest differs from the approved manifest");

    // Live probes: the pod must refuse what it is supposed to refuse.
    const base = d.baseUrl.replace(/\/+$/, "");
    const unauth = await this.fetch(`${base}/health`);
    evidence.unauthenticatedStatus = unauth.status;
    if (unauth.status !== 401) throw new GatewayAdminError("PROBE_UNAUTHENTICATED_ACCEPTED", `GET /health without a token → ${unauth.status}`);
    const forgedKey = parseSigningKey(`${this.deps.signingKey.kid}:${randomBytes(32).toString("base64url")}`);
    const forged = mintExecutionToken({ key: forgedKey, deploymentId: d.id, subject: "probe", scope: "status", body: "" }).token;
    const forgedRes = await this.fetch(`${base}/health`, { headers: { authorization: `Bearer ${forged}` } });
    evidence.forgedTokenStatus = forgedRes.status;
    if (forgedRes.status !== 401) throw new GatewayAdminError("PROBE_FORGED_ACCEPTED", `forged token → ${forgedRes.status}`);

    const updated: RuntimeDeployment = { ...d, enforcement: "enforce" };
    await this.deps.store.saveDeployment(updated);
    await this.event("deployment.enforcement_changed", updated, "enforce", evidence);
    return { deployment: updated, evidence };
  }

  async report(id: string, reason: string) {
    const d = await this.require(id);
    const updated: RuntimeDeployment = { ...d, enforcement: "report" };
    await this.deps.store.saveDeployment(updated);
    await this.event("deployment.enforcement_changed", updated, "report", { reason });
    return updated;
  }

  private async require(id: string) {
    const d = await this.deps.store.deploymentById(id);
    if (!d) throw new GatewayAdminError("UNKNOWN_DEPLOYMENT", id);
    return d;
  }
}
