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
import { mintExecutionToken, sha256Hex, type ExecutionScope, type SigningKey, type VoiceExecutionScope } from "./token";
import { voiceAuthzDigest, type VoiceOperation } from "./voice-authz";
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
const SHA256_HEX = /^[0-9a-f]{64}$/;

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
  /** Content hash per LoRA key from Cineforge's registry (authz v2). */
  loraSha256?: Record<string, string>;
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

/**
 * A self-hosted voice call (docs/74). The voice service has no storage
 * credentials and no legacy write path: every object it reads or writes is a
 * one-time URL presigned here, inside the owner's own `voices/<owner>/` folder.
 */
export interface VoicePrepareRequest {
  baseUrl: string;
  path: string;
  scope: VoiceExecutionScope;
  /** The engine the call is for — must be the deployment's model id. */
  engineId: string;
  /** Whose `voices/<owner>/` folder the call may read and write. */
  ownerId: string;
  /** Body fields (the authority adds jobId, inputUrls and the output targets). */
  payload: Record<string, unknown>;
  /** Objects the service reads, bound by content hash in the token's authz. */
  inputs?: { key: string; sha256: string }[];
  /** Objects the service writes; `{grant}` in a key becomes the grant id. */
  outputs?: { name: string; key: string; contentType: string }[];
  /** "output": one target as `output`; "outputs" (default): a name → target map. */
  outputField?: "output" | "outputs";
}

export interface VoiceGrantHandle {
  readonly id: string;
  /** name → granted output key. */
  readonly outputKeys: Record<string, string>;
  /** Verify every granted output exists with the reported size, then record the grant completed. */
  complete(written: { key: string; bytes?: number }[], gpuMs?: number): Promise<void>;
  fail(code: string): Promise<void>;
}

export interface PreparedVoiceCall {
  body: string;
  headers: Record<string, string>;
  grant: VoiceGrantHandle | null;
  mode: EnforcementMode;
}

export interface VoiceCallAuthorizer {
  prepareVoice(req: VoicePrepareRequest): Promise<PreparedVoiceCall>;
  /** Status / warm tokens (health, capabilities, polls). */
  prepare(req: PrepareRequest): Promise<PreparedCall>;
}

const VOICE_OPERATION: Record<VoiceExecutionScope, VoiceOperation | null> = {
  "voice:enroll": "enroll",
  "voice:run": "speak",
  "voice:score": "score",
  "voice:evict": null,
};

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

export class GatewayAuthority implements GpuCallAuthorizer, VoiceCallAuthorizer {
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
        problems.push(...this.loraProblems(dep, req.payload));
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

  // ── self-hosted voice (docs/74) ─────────────────────────────────────
  async prepareVoice(req: VoicePrepareRequest): Promise<PreparedVoiceCall> {
    let dep: RuntimeDeployment | null = null;
    let registryError = false;
    try {
      dep = await this.opts.store.deploymentByUrl(req.baseUrl);
    } catch (e) {
      registryError = true;
      this.log(JSON.stringify({ event: "gateway.registry_unavailable", error: e instanceof Error ? e.message : String(e) }));
    }
    const mode: EnforcementMode = this.opts.globalMode === "enforce" || dep?.enforcement === "enforce" ? "enforce" : "report";
    const inputs = req.inputs ?? [];
    const own = `voices/${req.ownerId}/`;
    const grantId = `g_${randomUUID()}`;
    const outputs = (req.outputs ?? []).map((o) => ({ ...o, key: o.key.replaceAll("{grant}", grantId) }));

    const problems: string[] = [];
    if (!dep) problems.push(registryError ? "REGISTRY_UNAVAILABLE" : "UNREGISTERED_DEPLOYMENT");
    else if (dep.status !== "approved") problems.push("DEPLOYMENT_NOT_APPROVED");
    if (!this.opts.signingKey) problems.push("NO_SIGNING_KEY");
    if (dep && dep.status === "approved" && !dep.manifest) problems.push("NO_APPROVED_MANIFEST");
    if (dep && dep.modelId !== req.engineId) problems.push("MODEL_NOT_AUTHORIZED");
    if (mode === "enforce" && dep) {
      const imageProblem = await this.checkImage(dep);
      if (imageProblem) problems.push(imageProblem);
    }
    if (!req.ownerId || inputs.some((i) => i.key.includes("..") || !i.key.startsWith(own))) problems.push("INPUT_OUT_OF_SCOPE");
    if (outputs.some((o) => o.key.includes("..") || !o.key.startsWith(own))) problems.push("OUTPUT_OUT_OF_SCOPE");
    if (inputs.some((i) => !SHA256_HEX.test(i.sha256))) problems.push("INPUT_UNHASHED");
    // No legacy path: without one-time URLs the service cannot read or write anything.
    const fatal = (inputs.length || outputs.length) && !this.opts.presigner ? "NO_PRESIGNER" : null;
    if (fatal) problems.push(fatal);

    const record = req.scope !== "voice:evict";
    if (problems.length && (mode === "enforce" || fatal || problems.includes("INPUT_OUT_OF_SCOPE") || problems.includes("OUTPUT_OUT_OF_SCOPE"))) {
      // Out-of-scope storage is refused in every mode: a voice is only ever its owner's.
      const code = fatal ?? problems.find((p) => p.endsWith("_OUT_OF_SCOPE")) ?? problems[0]!;
      await this.event({ type: "dispatch.denied", deploymentId: dep?.id ?? null, grantId: null, code, detail: { problems, path: req.path, engine: req.engineId } });
      if (record) await this.opts.store.insertGrant({ ...this.voiceGrantRow(grantId, dep, req, mode, inputs, outputs), outcome: "denied", errorCode: code });
      throw new GatewayDeniedError(code, problems.join(", "));
    }
    if (problems.length && record) {
      await this.event({ type: "dispatch.would_deny", deploymentId: dep?.id ?? null, grantId, code: problems[0]!, detail: { problems, path: req.path, engine: req.engineId } });
    }

    const presigner = this.opts.presigner;
    const inputUrls: Record<string, string> = {};
    for (const i of inputs) inputUrls[i.key] = await presigner!.presignGet(i.key, INPUT_URL_TTL_SEC);
    const targets: Record<string, { key: string; uploadUrl: string }> = {};
    for (const o of outputs) targets[o.name] = { key: o.key, uploadUrl: await presigner!.presignPut(o.key, o.contentType, OUTPUT_URL_TTL_SEC) };
    const outputField = req.outputField ?? "outputs";
    const outputBody = !outputs.length ? {} : outputField === "output" ? { output: Object.values(targets)[0] } : { outputs: targets };
    const body = JSON.stringify({ ...req.payload, jobId: grantId, ...(inputs.length ? { inputUrls } : {}), ...outputBody });

    const operation = VOICE_OPERATION[req.scope];
    const canSign = dep && dep.status === "approved" && dep.manifest && this.opts.signingKey && dep.modelId === req.engineId;
    let headers: Record<string, string> = {};
    let authz: string | undefined;
    let jti: string | null = null;
    let expiresAt: Date | null = null;
    if (canSign) {
      authz = operation
        ? voiceAuthzDigest({ engine: req.engineId, operation, runtime: dep!.manifest!.runtime, models: dep!.manifest!.models, inputs })
        : undefined;
      const minted = mintExecutionToken({ key: this.opts.signingKey!, deploymentId: dep!.id, subject: grantId, scope: req.scope, body, authz,
        ttlSec: this.opts.tokenTtlSec, now: this.now() / 1000 });
      headers = { authorization: `Bearer ${minted.token}` };
      jti = minted.claims.jti;
      expiresAt = new Date(minted.claims.exp * 1000);
    } else if (record) {
      await this.event({ type: "dispatch.legacy", deploymentId: dep?.id ?? null, grantId, code: problems[0] ?? null, detail: { path: req.path, engine: req.engineId } });
    }
    if (!record) return { body, headers, grant: null, mode };

    const row = this.voiceGrantRow(grantId, dep, req, mode, inputs, outputs);
    row.jti = jti;
    row.authzDigest = authz ?? null;
    row.bodySha256 = sha256Hex(body);
    row.expiresAt = expiresAt;
    await this.audit(() => this.opts.store.insertGrant(row), mode);
    return { body, headers, grant: this.voiceHandle(grantId, dep, outputs, mode), mode };
  }

  private voiceGrantRow(id: string, dep: RuntimeDeployment | null, req: VoicePrepareRequest, mode: EnforcementMode,
    inputs: { key: string }[], outputs: { key: string }[]): GrantRecord {
    return {
      id, jti: null, deploymentId: dep?.id ?? null, shotId: null, projectId: null, scope: req.scope, mode,
      authzDigest: null, bodySha256: null, inputKeys: inputs.map((i) => i.key), outputKeys: outputs.map((o) => o.key),
      imageRef: dep?.approvedImage ?? null, issuedAt: new Date(this.now()), expiresAt: null, outcome: "issued", errorCode: null,
    };
  }

  private voiceHandle(grantId: string, dep: RuntimeDeployment | null, outputs: { name: string; key: string }[], mode: EnforcementMode): VoiceGrantHandle {
    const outputKeys = Object.fromEntries(outputs.map((o) => [o.name, o.key]));
    return {
      id: grantId,
      outputKeys,
      complete: async (written, gpuMs) => {
        let total = 0;
        for (const o of outputs) {
          const w = written.find((x) => x.key === o.key);
          const head = w ? await this.opts.presigner!.head(o.key).catch(() => null) : null;
          const ok = w && head && head.size > 0 && (w.bytes === undefined || w.bytes === head.size);
          if (!ok) {
            if (dep) await this.reject(grantId, dep, w ? "OUTPUT_NOT_VERIFIED" : "OUTPUT_KEY_MISMATCH", mode);
            throw new GatewayDeniedError(w ? "OUTPUT_NOT_VERIFIED" : "OUTPUT_KEY_MISMATCH", `granted output ${o.key} missing or size mismatch`);
          }
          total += head!.size;
        }
        await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "completed", gpuMs: gpuMs ?? null, outputBytes: total, completedAt: new Date(this.now()) }), mode);
      },
      fail: async (code) => {
        await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "failed", errorCode: code, completedAt: new Date(this.now()) }), mode);
      },
    };
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

  /** LoRAs must be content-addressed, which only authz v2 deployments verify. */
  private loraProblems(dep: RuntimeDeployment | null, payload: GeneratePayload): string[] {
    const keys = payload.loraKeys ?? [];
    if (!keys.length || !dep?.manifest) return [];
    if ((dep.manifest.authzVersion ?? 1) < 2) return ["LORA_REQUIRES_AUTHZ_V2"];
    return keys.every((k) => SHA256_HEX.test(payload.loraSha256?.[k] ?? "")) ? [] : ["LORA_UNHASHED"];
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
    const version = dep.manifest!.authzVersion >= 2 ? 2 : 1;
    const authz = authzDigest({
      version,
      workflow: `diffusers.${dep.modelId}.${role}@1`,
      runtime: dep.manifest!.runtime,
      models: [{ role, id: model.id, revision: model.revision, weights: model.weights }],
      loras: (payload.loraKeys ?? []).map((key) => (version === 2 ? { key, sha256: payload.loraSha256?.[key] ?? "" } : key)),
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
