/** Shared types of the Cineforge-side Media Runtime Gateway (docs/39). */

export type EnforcementMode = "report" | "enforce";

/** What a GPU deployment runs, as reported by its /capabilities and approved by an operator. */
export interface RuntimeManifest {
  authzVersion: number;
  runtime: string;
  models: { role: string; id: string; revision: string; weights: string }[];
}

export interface RuntimeDeployment {
  id: string; // DEPLOYMENT_ID on the pod (token `aud`)
  modelId: string; // "wan-2.1" | "hunyuan" — must equal the pod's MODEL_NAME
  baseUrl: string;
  runpodPodId: string | null;
  status: "pending" | "approved" | "revoked";
  enforcement: EnforcementMode;
  manifest: RuntimeManifest | null;
  /** Immutable image reference approved for this deployment: `repo@sha256:<64 hex>`. */
  approvedImage: string | null;
}

export type GrantOutcome = "issued" | "completed" | "completed_unverified" | "rejected" | "failed" | "denied";

export interface GrantRecord {
  id: string;
  jti: string | null;
  deploymentId: string | null;
  shotId: string | null;
  projectId: string | null;
  scope: string;
  mode: EnforcementMode;
  authzDigest: string | null;
  bodySha256: string | null;
  inputKeys: string[];
  outputKeys: string[];
  imageRef: string | null;
  issuedAt: Date;
  expiresAt: Date | null;
  outcome: GrantOutcome;
  errorCode: string | null;
  gpuMs?: number | null;
  outputBytes?: number | null;
  completedAt?: Date | null;
}

export type GatewayEventType =
  | "deployment.registered"
  | "deployment.row_changed"
  | "deployment.enforcement_changed"
  | "dispatch.denied"
  | "dispatch.would_deny"
  | "dispatch.legacy"
  | "output.legacy"
  | "output.rejected"
  | "artifact.hashed";

export interface GatewayEvent {
  type: GatewayEventType;
  deploymentId: string | null;
  grantId: string | null;
  code: string | null;
  detail: Record<string, unknown>;
  actor: string; // "cineforge-worker" or the operator running the admin script
}

/** Persistence port (Prisma in apps/worker; in-memory in tests). */
export interface GatewayStore {
  deploymentByUrl(baseUrl: string): Promise<RuntimeDeployment | null>;
  deploymentById(id: string): Promise<RuntimeDeployment | null>;
  saveDeployment(d: RuntimeDeployment): Promise<void>;
  insertGrant(g: GrantRecord): Promise<void>;
  updateGrant(id: string, patch: Partial<GrantRecord>): Promise<void>;
  insertEvent(e: GatewayEvent): Promise<void>;
}

/** Short-lived, object-scoped storage URLs (docs/38 §O, §P; docs/39 D6). */
export interface MediaPresigner {
  readonly kind: string;
  presignGet(key: string, ttlSec: number): Promise<string>;
  presignPut(key: string, contentType: string, ttlSec: number): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
}

/** Reports the image reference the provider is actually running for a deployment. */
export interface ImageAttestor {
  runningImage(d: RuntimeDeployment): Promise<string | null>;
}

/** The Cineforge job a GPU call is for, as read from the database just before dispatch. */
export interface JobContext {
  shotId: string;
  projectId: string;
  shotStatus: string;
  projectStatus: string;
  modelId: string;
}

export class GatewayDeniedError extends Error {
  constructor(readonly code: string, message?: string) {
    super(`gateway denied (${code})${message ? `: ${message}` : ""}`);
    this.name = "GatewayDeniedError";
  }
}

export const IMMUTABLE_IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
