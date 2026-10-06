/**
 * WorkflowRuntime — the execution contract every runtime implements (docs/38
 * §AT.6, implementation Phase 3 in §AX.2). Six operations: validate,
 * estimate, execute, getStatus, cancel, getCapabilities.
 *
 * A runtime owns only EXECUTION of one authorized workflow version (§AX.5).
 * It returns artifacts plus a mandatory timing report; it never returns a
 * timeline, a cut decision or an acceptance verdict. `completed` is not a
 * production verdict: Cineforge classifies the result (classifyVideoResult).
 *
 * Implementations: DiffusersRuntime (today's GPU worker, Wan / Hunyuan).
 * ComfyUIRuntime arrives in Phase 6, behind the same gateway and contract.
 */
import type { JobContext } from "../gateway/types";
import type { ShotResult } from "../types";

export type RuntimeId = "comfyui" | "diffusers" | (string & {});

/** "cineforge.video-shot", 1 → cineforge.video-shot.v1 */
export interface WorkflowRef {
  id: string;
  version: number;
}

export interface BoundWorkflow<P = unknown> {
  ref: WorkflowRef;
  runtime: RuntimeId;
  /** Pinned runtime version (ComfyUI commit / diffusers version). */
  runtimeVersion: string;
  /** sha256 of the fully bound payload — provenance and cache key. */
  graphSha256: string;
  /** Diffusers: the backend request. ComfyUI: the API-format graph. */
  payload: P;
  models: Array<{ versionId: string; role: string; weightsRevision: string }>;
  /** The Cineforge job, for gateway authorization (docs/39). */
  job?: JobContext;
}

export interface RuntimeValidation {
  ok: boolean;
  errors: Array<{ code: string; path?: string; message: string }>;
}

export interface RuntimeEstimate {
  gpuMs: number;
  vramMb: number;
  gpuClass: string;
  confidence: "low" | "medium" | "high";
}

export type RuntimeStatus =
  | { state: "queued" | "loading" | "running"; progress: number; node?: string }
  /** Execution finished — NOT a production verdict. `timing` is the runtime's report as received. */
  | { state: "completed"; result: ShotResult; timing: unknown }
  | { state: "failed"; error: { code: string; message: string; retryable: boolean } }
  | { state: "cancelled" };

export interface RuntimeCapabilities {
  runtime: RuntimeId;
  runtimeVersion: string;
  /** ComfyUI custom nodes installed (empty for Diffusers). */
  nodes?: Array<{ package: string; commit: string; licenseId: string }>;
  /** Model version ids resident or available on this worker. */
  models: string[];
  supportsCancel: boolean;
  supportsProgress: boolean;
  /** Timing parameters the runtime honors (§AX.5 rule 5). */
  timing: { duration: boolean; fps: boolean; frameCount: boolean; audioConditioning: boolean; maxDurationSec: number };
  /** Worker-reported identity (status only; never authorizes). */
  sourceCommit?: string | null;
  codeSha256?: string | null;
}

export interface WorkflowRuntime<P = unknown> {
  readonly id: RuntimeId;
  validate(wf: BoundWorkflow<P>): Promise<RuntimeValidation>;
  estimate(wf: BoundWorkflow<P>): Promise<RuntimeEstimate>;
  execute(wf: BoundWorkflow<P>): Promise<{ runId: string }>;
  getStatus(runId: string): Promise<RuntimeStatus>;
  cancel(runId: string): Promise<void>;
  getCapabilities(): Promise<RuntimeCapabilities>;
}

export function workflowName(ref: WorkflowRef): string {
  return `${ref.id}.v${ref.version}`;
}

/**
 * Drive a run to a terminal state. Polling is for runtimes without push
 * notification; DiffusersRuntime resolves in-process.
 */
export async function runToCompletion<P>(
  runtime: WorkflowRuntime<P>,
  wf: BoundWorkflow<P>,
  opts: { pollMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<Exclude<RuntimeStatus, { state: "queued" | "loading" | "running" }>> {
  const v = await runtime.validate(wf);
  if (!v.ok) {
    return { state: "failed", error: { code: v.errors[0]?.code ?? "INVALID_WORKFLOW", message: v.errors.map((e) => e.message).join("; "), retryable: false } };
  }
  const { runId } = await runtime.execute(wf);
  const deadline = Date.now() + (opts.timeoutMs ?? 20 * 60_000);
  for (;;) {
    if (opts.signal?.aborted) {
      await runtime.cancel(runId);
      return { state: "cancelled" };
    }
    const s = await runtime.getStatus(runId);
    if (s.state === "completed" || s.state === "failed" || s.state === "cancelled") return s;
    if (Date.now() > deadline) {
      await runtime.cancel(runId);
      return { state: "failed", error: { code: "RUNTIME_TIMEOUT", message: `no terminal state for ${runId}`, retryable: true } };
    }
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000));
  }
}
