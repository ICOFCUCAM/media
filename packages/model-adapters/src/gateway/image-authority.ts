/**
 * Image Gateway Authority — the Cineforge half of the Media Runtime Gateway for
 * the self-hosted ComfyUI image runtime (apps/gpu-image; docs/73, docs/39).
 *
 * Same chain as the video path (GatewayAuthority), for one still:
 *   1. the target URL is a registered, approved deployment whose approved
 *      manifest lists the requested registry workflow (id, version, graph hash);
 *   2. the output key is chosen here, inside the project's own folder, and only
 *      a one-time PUT URL for it leaves Cineforge; inputs are one-time GET URLs;
 *   3. the authorization digest binds the workflow id + version + graph hash,
 *      the runtime, the exact model files (repo, revision, weights digest), the
 *      LoRAs by content hash and the size — computed from the APPROVED manifest,
 *      so a pod running another graph or model is refused by the pod itself;
 *   4. an Ed25519 token bound to deployment, scope `image:run`, job and body;
 *   5. the grant is recorded, and the result is accepted only after the stored
 *      object is checked: right key, right size, and its sha256 and PNG
 *      signature as read back from storage.
 *
 * There is no unsigned legacy path for images (the runtime never had one): a
 * call that cannot be signed and presigned is refused in every mode. Report
 * mode differs from enforce only in what it records instead of refusing —
 * today the image-digest attestation.
 */
import { randomUUID } from "node:crypto";

import { authzDigest, type AuthzModel } from "./authz";
import { mintExecutionToken, sha256Hex, type SigningKey } from "./token";
import {
  GatewayDeniedError,
  IMMUTABLE_IMAGE,
  type EnforcementMode,
  type GatewayEvent,
  type GatewayStore,
  type GrantRecord,
  type ImageAttestor,
  type ManifestWorkflow,
  type MediaPresigner,
  type RuntimeDeployment,
} from "./types";

export const IMAGE_INPUT_URL_TTL_SEC = 15 * 60;
export const IMAGE_OUTPUT_URL_TTL_SEC = 30 * 60;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTPUT_KEY = /^projects\/([A-Za-z0-9_-]{1,64})\/[A-Za-z0-9_./-]{1,400}\.png$/;
const ATTEST_CACHE_MS = 60_000;

/** The request body fields Cineforge chooses (the service's ImageRequest, minus what the authority adds). */
export interface ImagePayload {
  workflow: { id: string; version: number };
  prompt: string;
  negativePrompt?: string;
  seed: number;
  width: number;
  height: number;
  steps?: number;
  referenceImageKeys?: string[];
  loraKeys?: string[];
  loraSha256?: Record<string, string>;
  loraScale?: number;
}

export interface PrepareImageRequest {
  baseUrl: string;
  payload: ImagePayload;
  /** Where the still is stored: `projects/<projectId>/….png`. */
  outputKey: string;
  /**
   * Readable one-time URLs Cineforge already signed for some inputs (e.g. the
   * reference stills the caller passes as URLs), by input key. Every other
   * input key must be inside the project's folder and is presigned here.
   */
  inputUrls?: Record<string, string>;
}

/** What the service returns (apps/gpu-image ImageResult). */
export interface ImageRunResult {
  imageKey: string;
  imageBytes: number;
  sha256: string;
  contentType?: string;
  seed: number;
  width: number;
  height: number;
  gpuMs: number;
  workflow: { id: string; version: number; sha256: string; modelLabel?: string };
  graphSha256: string;
  runtime: string;
  models: AuthzModel[];
  execution: Record<string, unknown>;
  realExecution: boolean;
}

export interface ImageGrantHandle {
  readonly id: string;
  readonly outputKey: string;
  /** Verify the stored still; returns the result with the verified key. Throws when it does not hold. */
  complete(result: ImageRunResult): Promise<ImageRunResult>;
  fail(code: string): Promise<void>;
}

export interface PreparedImageCall {
  body: string;
  headers: Record<string, string>;
  grant: ImageGrantHandle;
  mode: EnforcementMode;
  /** The approved workflow (with its graph hash) the token authorizes. */
  workflow: ManifestWorkflow;
  authz: string;
}

export interface ImageCallAuthorizer {
  prepareImage(req: PrepareImageRequest): Promise<PreparedImageCall>;
  /** Status-scope token for /health, /capabilities and job polls ({} when it cannot sign). */
  statusHeaders(baseUrl: string): Promise<Record<string, string>>;
}

export interface ImageGatewayAuthorityOptions {
  store: GatewayStore;
  signingKey: SigningKey | null;
  presigner: MediaPresigner | null;
  attestor: ImageAttestor | null;
  globalMode?: EnforcementMode;
  tokenTtlSec?: number;
  now?: () => number;
  log?: (line: string) => void;
  /** Reads the stored still back for verification (default: fetch through a presigned GET). */
  readBack?: (url: string) => Promise<Uint8Array>;
}

/** The authorization digest of one still (identical to apps/gpu-image Identity.expected_authz). */
export function imageAuthzDigest(a: {
  workflow: ManifestWorkflow;
  runtime: string;
  models: AuthzModel[];
  loras: { key: string; sha256: string }[];
  width: number;
  height: number;
}): string {
  return authzDigest({
    version: 2,
    workflow: `${a.workflow.id}@${a.workflow.version}#${a.workflow.sha256}`,
    runtime: a.runtime,
    models: a.models,
    loras: a.loras,
    // A still has no duration or frame rate; its size is bound.
    timing: { durationUs: 0, fps: 0, width: a.width, height: a.height },
  });
}

/** The approved workflow and its models, or null — never another workflow or model. */
export function approvedWorkflow(dep: RuntimeDeployment, ref: { id: string; version: number }): { workflow: ManifestWorkflow; models: AuthzModel[] } | null {
  const wf = dep.manifest?.workflows?.find((w) => w.id === ref.id && w.version === ref.version);
  if (!wf) return null;
  const models = wf.models.map((key) => dep.manifest!.models.find((m) => m.role === key));
  if (models.some((m) => !m)) return null;
  return { workflow: wf, models: models as AuthzModel[] };
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export class ImageGatewayAuthority implements ImageCallAuthorizer {
  private readonly attestCache = new Map<string, { image: string | null; at: number }>();
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly readBack: (url: string) => Promise<Uint8Array>;

  constructor(private readonly opts: ImageGatewayAuthorityOptions) {
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((l) => console.log(l));
    this.readBack = opts.readBack ?? (async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`read back ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    });
  }

  async statusHeaders(baseUrl: string): Promise<Record<string, string>> {
    const dep = await this.opts.store.deploymentByUrl(baseUrl).catch(() => null);
    if (!dep || dep.status !== "approved" || !this.opts.signingKey) return {};
    const { token } = mintExecutionToken({ key: this.opts.signingKey, deploymentId: dep.id, subject: `call_${randomUUID()}`,
      scope: "status", body: "", ttlSec: this.opts.tokenTtlSec, now: this.now() / 1000 });
    return { authorization: `Bearer ${token}` };
  }

  async prepareImage(req: PrepareImageRequest): Promise<PreparedImageCall> {
    let dep: RuntimeDeployment | null = null;
    let registryError = false;
    try {
      dep = await this.opts.store.deploymentByUrl(req.baseUrl);
    } catch (e) {
      registryError = true;
      this.log(JSON.stringify({ event: "gateway.registry_unavailable", error: e instanceof Error ? e.message : String(e) }));
    }
    const mode: EnforcementMode = this.opts.globalMode === "enforce" || dep?.enforcement === "enforce" ? "enforce" : "report";
    const p = req.payload;
    const projectSeg = OUTPUT_KEY.exec(req.outputKey)?.[1] ?? null;

    // Fatal in every mode: without these the call cannot be signed or its I/O bound.
    const fatal: string[] = [];
    if (!dep) fatal.push(registryError ? "REGISTRY_UNAVAILABLE" : "UNREGISTERED_DEPLOYMENT");
    else if (dep.status !== "approved") fatal.push("DEPLOYMENT_NOT_APPROVED");
    else if (!dep.manifest) fatal.push("NO_APPROVED_MANIFEST");
    if (!this.opts.signingKey) fatal.push("NO_SIGNING_KEY");
    if (!this.opts.presigner) fatal.push("NO_PRESIGNER");
    const approved = dep?.manifest ? approvedWorkflow(dep, p.workflow) : null;
    if (dep?.manifest && !approved) fatal.push("WORKFLOW_NOT_AUTHORIZED");
    if (!projectSeg || req.outputKey.includes("..")) fatal.push("OUTPUT_OUT_OF_SCOPE");
    const keys = inputKeys(p);
    for (const k of keys) {
      if (req.inputUrls?.[k]) continue;
      if (k.includes("..") || !projectSeg || !k.startsWith(`projects/${projectSeg}/`)) {
        fatal.push("INPUT_OUT_OF_SCOPE");
        break;
      }
    }
    if ((p.loraKeys ?? []).some((k) => !SHA256_HEX.test(p.loraSha256?.[k] ?? ""))) fatal.push("LORA_UNHASHED");
    if (dep?.manifest && (dep.manifest.authzVersion ?? 1) < 2 && p.loraKeys?.length) fatal.push("LORA_REQUIRES_AUTHZ_V2");

    // Enforce-only: the pod must run its approved immutable image.
    const recorded: string[] = [];
    if (dep && dep.status === "approved") {
      const imageProblem = await this.checkImage(dep);
      if (imageProblem) (mode === "enforce" ? fatal : recorded).push(imageProblem);
    }

    if (fatal.length) {
      await this.event({ type: "dispatch.denied", deploymentId: dep?.id ?? null, grantId: null, code: fatal[0]!,
        detail: { problems: fatal, path: "/images", workflow: `${p.workflow.id}@${p.workflow.version}` } });
      // Best effort: the refusal below is the answer whether or not this row is written.
      await this.audit(() => this.opts.store.insertGrant(this.grantRow(`g_${randomUUID()}`, dep, mode, projectSeg, "denied", fatal[0]!)), "report");
      throw new GatewayDeniedError(fatal[0]!, fatal.join(", "));
    }
    if (recorded.length) {
      await this.event({ type: "dispatch.would_deny", deploymentId: dep!.id, grantId: null, code: recorded[0]!,
        detail: { problems: recorded, path: "/images" } });
    }

    const presigner = this.opts.presigner!;
    const grantId = `g_${randomUUID()}`;
    const inputUrls: Record<string, string> = {};
    for (const k of keys) inputUrls[k] = req.inputUrls?.[k] ?? (await presigner.presignGet(k, IMAGE_INPUT_URL_TTL_SEC));
    const output = { imageKey: req.outputKey, imageUploadUrl: await presigner.presignPut(req.outputKey, "image/png", IMAGE_OUTPUT_URL_TTL_SEC) };
    const authz = imageAuthzDigest({
      workflow: approved!.workflow, runtime: dep!.manifest!.runtime, models: approved!.models,
      loras: (p.loraKeys ?? []).map((key) => ({ key, sha256: p.loraSha256?.[key] ?? "" })), width: p.width, height: p.height,
    });
    const body = JSON.stringify({ ...p, jobId: grantId, ...(keys.length ? { inputUrls } : {}), output });
    const { token, claims } = mintExecutionToken({ key: this.opts.signingKey!, deploymentId: dep!.id, subject: grantId,
      scope: "image:run", body, authz, ttlSec: this.opts.tokenTtlSec, now: this.now() / 1000 });

    const row = this.grantRow(grantId, dep, mode, projectSeg, "issued", null);
    row.jti = claims.jti;
    row.authzDigest = authz;
    row.bodySha256 = sha256Hex(body);
    // Caller-signed inputs are recorded by key; the URLs themselves are secrets and never stored.
    row.inputKeys = keys;
    row.outputKeys = [req.outputKey];
    row.expiresAt = new Date(claims.exp * 1000);
    await this.audit(() => this.opts.store.insertGrant(row), mode);

    return { body, headers: { authorization: `Bearer ${token}` }, grant: this.handle(grantId, dep!, req.outputKey, mode, p), mode,
      workflow: approved!.workflow, authz };
  }

  private handle(grantId: string, dep: RuntimeDeployment, outputKey: string, mode: EnforcementMode, p: ImagePayload): ImageGrantHandle {
    const presigner = this.opts.presigner!;
    return {
      id: grantId,
      outputKey,
      complete: async (result) => {
        const reject = async (code: string, message: string): Promise<never> => {
          await this.event({ type: "output.rejected", deploymentId: dep.id, grantId, code, detail: {} });
          await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "rejected", errorCode: code, completedAt: new Date(this.now()) }), mode);
          throw new GatewayDeniedError(code, message);
        };
        // No legacy path for images: the result is checked in every mode.
        if (result.imageKey !== outputKey) return reject("OUTPUT_KEY_MISMATCH", "result does not name the granted output key");
        if (result.workflow?.id !== p.workflow.id || result.workflow?.version !== p.workflow.version) return reject("WORKFLOW_MISMATCH", "result names another workflow");
        const head = await presigner.head(outputKey).catch(() => null);
        if (!head || head.size <= 0 || head.size !== result.imageBytes) return reject("OUTPUT_NOT_VERIFIED", "granted output missing or size mismatch");
        let bytes: Uint8Array;
        try {
          bytes = await this.readBack(await presigner.presignGet(outputKey, 300));
        } catch {
          return reject("OUTPUT_NOT_VERIFIED", "stored still could not be read back");
        }
        if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return reject("OUTPUT_NOT_PNG", "stored object is not a PNG");
        if (sha256Hex(bytes) !== result.sha256) return reject("OUTPUT_HASH_MISMATCH", "stored bytes differ from the reported sha256");
        await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "completed", gpuMs: result.gpuMs, outputBytes: head.size, completedAt: new Date(this.now()) }), mode);
        return { ...result, imageKey: outputKey };
      },
      fail: async (code) => {
        await this.audit(() => this.opts.store.updateGrant(grantId, { outcome: "failed", errorCode: code, completedAt: new Date(this.now()) }), mode);
      },
    };
  }

  private async checkImage(dep: RuntimeDeployment): Promise<string | null> {
    if (!dep.approvedImage || !IMMUTABLE_IMAGE.test(dep.approvedImage)) return "NO_APPROVED_IMAGE_DIGEST";
    if (!this.opts.attestor) return "NO_IMAGE_ATTESTOR";
    const hit = this.attestCache.get(dep.id);
    let image = hit && this.now() - hit.at < ATTEST_CACHE_MS ? hit.image : undefined;
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

  private grantRow(id: string, dep: RuntimeDeployment | null, mode: EnforcementMode, projectSeg: string | null,
    outcome: GrantRecord["outcome"], errorCode: string | null): GrantRecord {
    return {
      id, jti: null, deploymentId: dep?.id ?? null, shotId: null,
      // grants.project_id is a uuid column: only a real project id is recorded.
      projectId: projectSeg && UUID.test(projectSeg) ? projectSeg : null,
      scope: "image:run", mode, authzDigest: null, bodySha256: null, inputKeys: [], outputKeys: [],
      imageRef: dep?.approvedImage ?? null, issuedAt: new Date(this.now()), expiresAt: null, outcome, errorCode,
    };
  }

  private async audit(write: () => Promise<void>, mode: EnforcementMode) {
    try {
      await write();
    } catch (e) {
      if (mode === "enforce") throw new GatewayDeniedError("AUDIT_WRITE_FAILED", e instanceof Error ? e.message : String(e));
      this.log(JSON.stringify({ event: "gateway.audit_write_failed", error: e instanceof Error ? e.message : String(e) }));
    }
  }

  private async event(e: Omit<GatewayEvent, "actor">) {
    this.log(JSON.stringify({ event: `gateway.${e.type}`, deployment: e.deploymentId, grant: e.grantId, code: e.code }));
    try {
      await this.opts.store.insertEvent({ ...e, actor: "cineforge-worker" });
    } catch (err) {
      this.log(JSON.stringify({ event: "gateway.audit_write_failed", error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

function inputKeys(p: ImagePayload): string[] {
  return [...new Set([...(p.referenceImageKeys ?? []), ...(p.loraKeys ?? [])])];
}
