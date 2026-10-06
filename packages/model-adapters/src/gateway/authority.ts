/**
 * Gateway Authority — the Cineforge half of the Media Runtime Gateway
 * (docs/38 §O, §P, §AV.2, §AV.3; docs/39).
 *
 * For every GPU call it:
 *   1. resolves the target URL to a registered, approved deployment;
 *   2. authorizes the Cineforge job (shot state, project state, model, input keys);
 *   3. checks the deployment runs its approved immutable image (enforce);
 *   4. binds outputs to keys Cineforge chooses, and presigns one-time I/O URLs;
 *   5. computes the workflow + model authorization digest from the approved manifest;
 *   6. mints a short-lived Ed25519 token bound to deployment, scope, job, body and digest;
 *   7. writes the audit trail, and verifies the result before it is accepted.
 *
 * Mode per deployment: `report` (default) observes and records but never blocks
 * — today's pipeline keeps working; `enforce` refuses anything that fails.
 * Turning a deployment to `enforce` is a separate, audited operator action
 * (apps/worker/src/gateway/admin.ts), never a side effect of deploying code.
 */
import { randomUUID } from "node:crypto";

import { authzDigest, secondsToMicros } from "./authz";
import { mintExecutionToken, sha256Hex, type ExecutionScope, type SigningKey } from "./token";
import {
  GatewayDeniedError,
  IMMUTABLE_IMAGE,
  type EnforcementMode,
  type GatewayEvent,
  type GatewayStore,
  type GrantRecord,
  type ImageAttestor,
  type JobContext,
  type MediaPresigner,
  type RuntimeDeployment,
} from "./types";

export const INPUT_URL_TTL_SEC = 15 * 60;
export const OUTPUT_URL_TTL_SEC = 30 * 60;
const IMAGE_ATTEST_CACHE_MS = 60_000;

/** Body fields the authority adds/reads; the rest is the existing generate payload. */
export interface GeneratePayload {
  prompt: string;
  durationSec: number;
  width: number;
  height: number;
  fps?: number;
  referenceImageKeys?: string[];
  referenceVideoKeys?: string[];
  loraKeys?: string[];
  [k: string]: unknown;
}

export interface GenerateResult {
  videoKey: string;
  thumbnailKey?: string | null;
  gpuMs: number;
  videoBytes?: number;
}

export interface PrepareRequest {
  baseUrl: string;
  path: string;
  scope: ExecutionScope;
  payload?: GeneratePayload; // generate only
  job?: JobContext; // generate only
}

export interface GrantHandle {
  readonly id: string;
  readonly outputKeys: { video: string; thumbnail: string };
  complete(result: GenerateResult): Promise<GenerateResult>;
  fail(code: string): Promise<void>;
}

export interface PreparedCall {
  body: string | undefined;
  headers: Record<string, string>;
  grant: GrantHandle | null;
  mode: EnforcementMode;
}

export interface GpuCallAuthorizer {
  prepare(req: PrepareRequest): Promise<PreparedCall>;
}

export interface GatewayAuthorityOptions {
  store: GatewayStore;
  signingKey: SigningKey | null;
  presigner: MediaPresigner | null;
  attestor: ImageAttestor | null;
  /** Global floor: `enforce` makes every deployment enforce, `report` defers to each deployment. */
  globalMode?: EnforcementMode;
  /** Extra read-only input prefixes allowed besides `projects/{projectId}/` (legacy outputs). */
  legacyInputPrefixes?: string[];
  tokenTtlSec?: number;
  now?: () => number; // ms
  log?: (line: string) => void;
}

export class GatewayAuthority implements GpuCallAuthorizer {
  private readonly attestCache = new Map<string, { image: string | null; at: number }>();
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: GatewayAuthorityOptions) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((l) => console.log(l));
  }

  async prepare(req: PrepareRequest): Promise<PreparedCall> {
    let dep: RuntimeDeployment | null = null;
    let registryError = false;
    try {
      dep = await this.opts.store.deploymentByUrl(req.baseUrl);
    } catch (e) {
      // e.g. migration not applied yet: report mode must keep working.
      registryError = true;
      this.log(JSON.stringify({ event: "gateway.registry_unavailable", error: e instanceof Error ? e.message : String(e) }));
    }
    const mode: EnforcementMode =
      this.opts.globalMode === "enforce" || dep?.enforcement === "enforce" ? "enforce" : "report";

    // Every problem found before dispatch: fatal in enforce, recorded in report.
    const problems: string[] = [];
    if (!dep) problems.push(registryError ? "REGISTRY_UNAVAILABLE" : "UNREGISTERED_DEPLOYMENT");
    else if (dep.status !== "approved") problems.push("DEPLOYMENT_NOT_APPROVED");
    if (!this.opts.signingKey) problems.push("NO_SIGNING_KEY");
    if (dep && dep.status === "approved" && !dep.manifest) problems.push("NO_APPROVED_MANIFEST");
    if (mode === "enforce" && dep) {
      const imageProblem = await this.checkImage(dep);
      if (imageProblem) problems.push(imageProblem);
    }
    if (req.scope === "video:run") {
      if (!req.job || !req.payload) problems.push("NO_JOB_CONTEXT");
      else {
        problems.push(...this.authorizeJob(req.job, req.payload, dep));
        if (dep?.manifest && !workflowRole(dep, req.payload)) problems.push("MODEL_NOT_AUTHORIZED");
      }
      if (!this.opts.presigner) problems.push("NO_PRESIGNER");
    }

    if (problems.length && mode === "enforce") {
      await this.event({ type: "dispatch.denied", deploymentId: dep?.id ?? null, grantId: null, code: problems[0]!,
        detail: { problems, path: req.path, shotId: req.job?.shotId ?? null } });
      if (req.scope === "video:run") {
        await this.opts.store.insertGrant(this.grantRow({ id: `g_${randomUUID()}`, dep, req, mode, outcome: "denied", errorCode: problems[0]! }));
      }
      throw new GatewayDeniedError(problems[0]!, problems.join(", "));
    }
    // Report mode records generation calls only; status/warm probes just log.
    const record = req.scope === "video:run";
    if (problems.length && record) {
      await this.event({ type: "dispatch.would_deny", deploymentId: dep?.id ?? null, grantId: null, code: problems[0]!,
        detail: { problems, path: req.path, shotId: req.job?.shotId ?? null } });
    }

    // Report mode without the means to sign: today's unsigned request, recorded.
    const canSign = dep && dep.status === "approved" && this.opts.signingKey && (req.scope !== "video:run" || (dep.manifest && this.opts.presigner && req.job && req.payload && workflowRole(dep, req.payload)));
    if (!canSign) {
      if (record) await this.event({ type: "dispatch.legacy", deploymentId: dep?.id ?? null, grantId: null, code: problems[0] ?? null,
        detail: { path: req.path, shotId: req.job?.shotId ?? null } });
      return { body: req.payload ? JSON.stringify(req.payload) : undefined, headers: {}, grant: null, mode };
    }

    if (req.scope !== "video:run") {
      const body = "";
      const { token } = mintExecutionToken({ key: this.opts.signingKey!, deploymentId: dep!.id, subject: `call_${randomUUID()}`,
        scope: req.scope, body, ttlSec: this.opts.tokenTtlSec, now: this.now() / 1000 });
      return { body: undefined, headers: { authorization: `Bearer ${token}` }, grant: null, mode };
    }
    return this.prepareGenerate(dep!, req.job!, req.payload!, mode, req);
  }

  // ── job authorization ───────────────────────────────────────────────
  private authorizeJob(job: JobContext, payload: GeneratePayload, dep: RuntimeDeployment | null): string[] {
    const out: string[] = [];
    if (job.shotStatus !== "GENERATING") out.push("JOB_NOT_GENERATING");
    if (job.projectStatus === "PAUSED" || job.projectStatus === "FAILED") out.push("PROJECT_NOT_ACTIVE");
    if (dep && dep.modelId !== job.modelId) out.push("MODEL_NOT_AUTHORIZED");
    const allowed = [`projects/${job.projectId}/`, ...(this.opts.legacyInputPrefixes ?? [])];
    for (const key of inputKeys(payload)) {
      if (key.includes("..") || !allowed.some((p) => key.startsWith(p))) {
        out.push("INPUT_OUT_OF_SCOPE");
        break;
      }
    }
    return out;
  }

  private async checkImage(dep: RuntimeDeployment): Promise<string | null> {
    if (!dep.approvedImage || !IMMUTABLE_IMAGE.test(dep.approvedImage)) return "NO_APPROVED_IMAGE_DIGEST";
    if (!this.opts.attestor) return "NO_IMAGE_ATTESTOR";
    const hit = this.attestCache.get(dep.id);
    let image = hit && this.now() - hit.at < IMAGE_ATTEST_CACHE_MS ? hit.image : undefined;
    if (image === undefined) {
      try {
        image = await this.opts.attestor.runningImage(dep);
      } catch {
        image = null;
      }
      this.attestCache.set(dep.id, { image, at: this.now() });
    }
    if (!image) return "IMAGE_UNATTESTED";
    return image === dep.approvedImage ? null : "IMAGE_DIGEST_MISMATCH";
  }

  // ── generate ────────────────────────────────────────────────────────
  private async prepareGenerate(
    dep: RuntimeDeployment,
    job: JobContext,
    payload: GeneratePayload,
    mode: EnforcementMode,
    req: PrepareRequest,
  ): Promise<PreparedCall> {
    const presigner = this.opts.presigner!;
    const grantId = `g_${randomUUID()}`;
    const outputKeys = {
      video: `projects/${job.projectId}/video/${grantId}.mp4`,
      thumbnail: `projects/${job.projectId}/video/${grantId}.thumb.jpg`,
    };
    const keys = inputKeys(payload);
    const inputUrls: Record<string, string> = {};
    for (const k of keys) inputUrls[k] = await presigner.presignGet(k, INPUT_URL_TTL_SEC);
    const output = {
      videoKey: outputKeys.video,
      videoUploadUrl: await presigner.presignPut(outputKeys.video, "video/mp4", OUTPUT_URL_TTL_SEC),
      thumbnailKey: outputKeys.thumbnail,
      thumbnailUploadUrl: await presigner.presignPut(outputKeys.thumbnail, "image/jpeg", OUTPUT_URL_TTL_SEC),
    };

    const fps = payload.fps ?? 16;
    const { role, model } = workflowRole(dep, payload)!;
    const authz = authzDigest({
      workflow: `diffusers.${dep.modelId}.${role}@1`,
      runtime: dep.manifest!.runtime,
      models: [{ role, id: model.id, revision: model.revision, weights: model.weights }],
      loras: payload.loraKeys ?? [],
      timing: { durationUs: secondsToMicros(payload.durationSec), fps, width: payload.width, height: payload.height },
    });

    const body = JSON.stringify({ ...payload, fps, jobId: grantId, inputUrls, output });
    const { token, claims } = mintExecutionToken({ key: this.opts.signingKey!, deploymentId: dep.id, subject: grantId,
      scope: "video:run", body, authz, ttlSec: this.opts.tokenTtlSec, now: this.now() / 1000 });

    const row = this.grantRow({ id: grantId, dep, req, mode, outcome: "issued", errorCode: null });
    row.jti = claims.jti;
    row.authzDigest = authz ?? null;
    row.bodySha256 = sha256Hex(body);
    row.inputKeys = keys;
    row.outputKeys = [outputKeys.video, outputKeys.thumbnail];
    row.expiresAt = new Date(claims.exp * 1000);
    await this.audit(() => this.opts.store.insertGrant(row), mode);

    return { body, headers: { authorization: `Bearer ${token}` }, grant: this.handle(grantId, dep, outputKeys, mode), mode };
  }

  private handle(grantId: string, dep: RuntimeDeployment, outputKeys: { video: string; thumbnail: string }, mode: EnforcementMode): GrantHandle {
    return {
      id: grantId,
      outputKeys,
      complete: async (result) => {
        if (result.videoKey !== outputKeys.video) {
          if (mode === "enforce") {
            await this.reject(grantId, dep, "OUTPUT_KEY_MISMATCH", mode);
            throw new GatewayDeniedError("OUTPUT_KEY_MISMATCH", "result does not name the granted output key");
          }
          // Report mode: an older pod still writes its own key. Accept, but record it.
          await this.event({ type: "output.legacy", deploymentId: dep.id, grantId, code: "OUTPUT_KEY_MISMATCH", detail: { returnedKey: result.videoKey } });
          await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "completed_unverified", gpuMs: result.gpuMs, completedAt: new Date(this.now()) }), mode);
          return result;
        }
        const head = await this.opts.presigner!.head(outputKeys.video).catch(() => null);
        const sizeOk = head && head.size > 0 && (result.videoBytes === undefined || result.videoBytes === head.size);
        if (!sizeOk) {
          await this.reject(grantId, dep, "OUTPUT_NOT_VERIFIED", mode);
          if (mode === "enforce") throw new GatewayDeniedError("OUTPUT_NOT_VERIFIED", "granted output missing or size mismatch");
          return result;
        }
        const thumbnailKey = result.thumbnailKey === outputKeys.thumbnail ? outputKeys.thumbnail : null;
        await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "completed", gpuMs: result.gpuMs, outputBytes: head!.size, completedAt: new Date(this.now()) }), mode);
        return { ...result, videoKey: outputKeys.video, thumbnailKey };
      },
      fail: async (code) => {
        await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "failed", errorCode: code, completedAt: new Date(this.now()) }), mode);
      },
    };
  }

  private async reject(grantId: string, dep: RuntimeDeployment, code: string, mode: EnforcementMode) {
    await this.event({ type: "output.rejected", deploymentId: dep.id, grantId, code, detail: {} });
    await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "rejected", errorCode: code, completedAt: new Date(this.now()) }), mode);
  }

  // ── audit helpers ───────────────────────────────────────────────────
  private grantRow(a: { id: string; dep: RuntimeDeployment | null; req: PrepareRequest; mode: EnforcementMode; outcome: GrantRecord["outcome"]; errorCode: string | null }): GrantRecord {
    return {
      id: a.id,
      jti: null,
      deploymentId: a.dep?.id ?? null,
      shotId: a.req.job?.shotId ?? null,
      projectId: a.req.job?.projectId ?? null,
      scope: a.req.scope,
      mode: a.mode,
      authzDigest: null,
      bodySha256: null,
      inputKeys: a.req.payload ? inputKeys(a.req.payload) : [],
      outputKeys: [],
      imageRef: a.dep?.approvedImage ?? null,
      issuedAt: new Date(this.now()),
      expiresAt: null,
      outcome: a.outcome,
      errorCode: a.errorCode,
    };
  }

  /** Audit writes are mandatory in enforce mode; in report mode a failed write is logged, not fatal. */
  private async audit(write: () => Promise<void>, mode: EnforcementMode) {
    try {
      await write();
    } catch (e) {
      if (mode === "enforce") throw new GatewayDeniedError("AUDIT_WRITE_FAILED", e instanceof Error ? e.message : String(e));
      this.log(JSON.stringify({ event: "gateway.audit_write_failed", error: e instanceof Error ? e.message : String(e) }));
    }
  }

  private async event(e: Omit<GatewayEvent, "actor">) {
    const ev: GatewayEvent = { ...e, actor: "cineforge-worker" };
    this.log(JSON.stringify({ event: `gateway.${ev.type}`, deployment: ev.deploymentId, grant: ev.grantId, code: ev.code }));
    try {
      await this.opts.store.insertEvent(ev);
    } catch (err) {
      this.log(JSON.stringify({ event: "gateway.audit_write_failed", error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

/**
 * The workflow the approved manifest authorizes for this request — the same
 * choice the GPU worker makes (reference frame + I2V model → i2v, else t2v).
 * Null when the manifest has no model for it: never substitute another.
 */
export function workflowRole(dep: RuntimeDeployment, p: GeneratePayload) {
  const role = (p.referenceImageKeys?.length ?? 0) > 0 && dep.manifest?.models.some((m) => m.role === "i2v") ? "i2v" : "t2v";
  const model = dep.manifest?.models.find((m) => m.role === role);
  return model ? { role, model } : null;
}

export function inputKeys(p: GeneratePayload): string[] {
  return [...new Set([...(p.referenceImageKeys ?? []), ...(p.referenceVideoKeys ?? []), ...(p.loraKeys ?? [])])];
}
