/**
 * DiffusersRuntime — the WorkflowRuntime over today's GPU worker backends
 * (docs/38 §AT.6: "DiffusersRuntime = today's apps/gpu-worker FastAPI
 * backends"). The §I adapters (Wan, Hunyuan) stay as its backend contract;
 * every call still goes through the Media Runtime Gateway via RunpodClient.
 */
import { createHash, randomUUID } from "node:crypto";
import { canonicalJson } from "../gateway/authz";
import type { ShotRequest, VideoModelAdapter } from "../types";
import type { BoundWorkflow, RuntimeCapabilities, RuntimeEstimate, RuntimeStatus, RuntimeValidation, WorkflowRef, WorkflowRuntime } from "./contract";

/** The one Diffusers workflow today: a single generated shot. */
export const VIDEO_SHOT_WORKFLOW: WorkflowRef = { id: "cineforge.video-shot", version: 1 };

export type DiffusersPayload = Omit<ShotRequest, "job">;

type Run =
  | { state: "running"; ctrl: AbortController; started: number }
  | Exclude<RuntimeStatus, { state: "queued" | "loading" | "running" }>;

export interface DiffusersRuntimeOptions {
  /** Worker identity (RunpodClient.capabilities); optional for tests. */
  describeWorker?: () => Promise<Record<string, unknown> | null>;
  runtimeVersion?: string;
}

/** Bind a shot request to the video-shot workflow (payload hash = provenance key). */
export function bindVideoShot(
  adapter: Pick<VideoModelAdapter, "capabilities">,
  req: ShotRequest,
  weightsRevision = "unpinned",
): BoundWorkflow<DiffusersPayload> {
  const { job, ...payload } = req;
  const caps = adapter.capabilities();
  return {
    ref: VIDEO_SHOT_WORKFLOW,
    runtime: "diffusers",
    runtimeVersion: "worker",
    graphSha256: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
    payload,
    models: [{ versionId: caps.version ?? caps.id, role: "t2v", weightsRevision }],
    job,
  };
}

export class DiffusersRuntime implements WorkflowRuntime<DiffusersPayload> {
  readonly id = "diffusers";
  private readonly runs = new Map<string, Run>();

  constructor(
    private readonly adapter: VideoModelAdapter,
    private readonly opts: DiffusersRuntimeOptions = {},
  ) {}

  async validate(wf: BoundWorkflow<DiffusersPayload>): Promise<RuntimeValidation> {
    const errors: RuntimeValidation["errors"] = [];
    const caps = this.adapter.capabilities();
    const p = wf.payload;
    if (wf.runtime !== this.id) errors.push({ code: "WRONG_RUNTIME", message: `bound for ${wf.runtime}` });
    if (wf.ref.id !== VIDEO_SHOT_WORKFLOW.id) errors.push({ code: "UNKNOWN_WORKFLOW", message: `${wf.ref.id} is not a Diffusers workflow` });
    const hash = createHash("sha256").update(canonicalJson(p)).digest("hex");
    if (hash !== wf.graphSha256) errors.push({ code: "PAYLOAD_TAMPERED", message: "payload does not match graphSha256" });
    // Timing is part of the production request, never a model default (§AV.5).
    for (const k of ["durationSec", "fps", "width", "height"] as const) {
      if (typeof p[k] !== "number" || !(p[k]! > 0)) errors.push({ code: "TIMING_MISSING", path: `payload.${k}`, message: `${k} is required` });
    }
    if (typeof p.durationSec === "number" && p.durationSec > caps.maxDurationSec) {
      // The planner splits long shots at planned cut points (§AU.5); the runtime never shortens them.
      errors.push({ code: "DURATION_EXCEEDS_MODEL", path: "payload.durationSec", message: `${p.durationSec}s > ${caps.maxDurationSec}s for ${caps.id}` });
    }
    if (p.width && p.height && !caps.resolutions.some((r) => r.width === p.width && r.height === p.height)) {
      errors.push({ code: "UNSUPPORTED_RESOLUTION", path: "payload.width", message: `${p.width}x${p.height} not offered by ${caps.id}` });
    }
    if (p.loraKeys?.length && !caps.supportsLora) errors.push({ code: "CAPABILITY", message: `${caps.id} cannot load LoRAs` });
    if (p.referenceVideoKeys?.length && !caps.supportsReferenceVideo) errors.push({ code: "CAPABILITY", message: `${caps.id} has no video-to-video path` });
    return { ok: errors.length === 0, errors };
  }

  async estimate(wf: BoundWorkflow<DiffusersPayload>): Promise<RuntimeEstimate> {
    return { gpuMs: this.adapter.estimateCost({ ...wf.payload }), vramMb: 40_000, gpuClass: "A40", confidence: "medium" };
  }

  async execute(wf: BoundWorkflow<DiffusersPayload>): Promise<{ runId: string }> {
    const runId = `run_${randomUUID()}`;
    const ctrl = new AbortController();
    this.runs.set(runId, { state: "running", ctrl, started: Date.now() });
    this.adapter
      .generate({ ...wf.payload, job: wf.job }, ctrl.signal)
      .then((result) => {
        if (this.runs.get(runId)?.state === "running") this.runs.set(runId, { state: "completed", result, timing: result.timing });
      })
      .catch((e: unknown) => {
        if (this.runs.get(runId)?.state !== "running") return;
        const err = e as Error;
        this.runs.set(runId, {
          state: "failed",
          error: { code: err.name === "AbortError" ? "ABORTED" : "RUNTIME_ERROR", message: err.message ?? String(e), retryable: err.name !== "AbortError" },
        });
      });
    return { runId };
  }

  async getStatus(runId: string): Promise<RuntimeStatus> {
    const r = this.runs.get(runId);
    if (!r) return { state: "failed", error: { code: "UNKNOWN_RUN", message: runId, retryable: false } };
    if (r.state === "running") return { state: "running", progress: 0 };
    return r;
  }

  async cancel(runId: string): Promise<void> {
    const r = this.runs.get(runId);
    if (r?.state === "running") {
      r.ctrl.abort();
      this.runs.set(runId, { state: "cancelled" });
    }
  }

  async getCapabilities(): Promise<RuntimeCapabilities> {
    const caps = this.adapter.capabilities();
    const worker = (await this.opts.describeWorker?.()) ?? null;
    const image = (worker?.image ?? {}) as { sourceCommit?: string | null; codeSha256?: string | null };
    const manifest = (worker?.manifest ?? {}) as { runtime?: string; models?: Array<{ id: string; revision?: string | null }> };
    return {
      runtime: this.id,
      runtimeVersion: manifest.runtime ?? this.opts.runtimeVersion ?? "unknown",
      nodes: [],
      models: manifest.models?.map((m) => `${m.id}@${m.revision ?? "unpinned"}`) ?? [caps.version ?? caps.id],
      supportsCancel: true,
      supportsProgress: false,
      timing: { duration: true, fps: true, frameCount: false, audioConditioning: false, maxDurationSec: caps.maxDurationSec },
      sourceCommit: image.sourceCommit ?? null,
      codeSha256: image.codeSha256 ?? null,
    };
  }
}
