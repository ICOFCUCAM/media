/**
 * GPU cluster routing (docs/24 §C5). Generalizes the single-pool design to a
 * heterogeneous, multi-GPU cluster: many workers, possibly different GPU types
 * (A40/A100/H100) and different models. Pure + testable; the live load/health
 * inputs are injected so the same logic works in tests and production.
 *
 * The reference-counted lifecycle ([23]) still governs each pool's power state;
 * this layer decides WHICH worker a job lands on.
 */

export type GpuType = "A40" | "A100" | "H100";

/** Relative throughput per GPU type — used to normalize load and prefer faster GPUs. */
export const GPU_THROUGHPUT: Record<GpuType, number> = {
  A40: 1,
  A100: 2.5,
  H100: 5,
};

export interface GpuWorkerSpec {
  id: string;
  modelId: string; // which model this worker serves
  gpuType: GpuType;
  baseUrl: string; // gpu-worker service URL
}

export interface PickOptions {
  /** Current in-flight job count per worker id. */
  load?: Map<string, number>;
  /** Health predicate; unhealthy workers are skipped. Defaults to all healthy. */
  healthy?: (workerId: string) => boolean;
}

export class GpuClusterRouter {
  constructor(private readonly workers: GpuWorkerSpec[]) {}

  workersFor(modelId: string): GpuWorkerSpec[] {
    return this.workers.filter((w) => w.modelId === modelId);
  }

  baseUrlsFor(modelId: string): string[] {
    return this.workersFor(modelId).map((w) => w.baseUrl);
  }

  /**
   * Pick the worker that minimizes throughput-normalized load
   * (in-flight / throughput), tie-broken toward the faster GPU. Returns null
   * if no healthy worker serves the model.
   */
  pick(modelId: string, opts: PickOptions = {}): GpuWorkerSpec | null {
    const healthy = opts.healthy ?? (() => true);
    const load = opts.load ?? new Map<string, number>();
    const cands = this.workersFor(modelId).filter((w) => healthy(w.id));
    if (cands.length === 0) return null;

    const score = (w: GpuWorkerSpec) => (load.get(w.id) ?? 0) / GPU_THROUGHPUT[w.gpuType];
    return cands.reduce((best, w) => {
      const s = score(w);
      const b = score(best);
      if (s < b) return w;
      if (s === b && GPU_THROUGHPUT[w.gpuType] > GPU_THROUGHPUT[best.gpuType]) return w;
      return best;
    });
  }
}

/**
 * Parse a cluster from env. `GPU_CLUSTER` (JSON array of GpuWorkerSpec) takes
 * precedence; otherwise fall back to single A40 workers from the per-model URLs.
 */
export function parseClusterFromEnv(env: Record<string, string | undefined>): GpuWorkerSpec[] {
  if (env.GPU_CLUSTER) {
    try {
      return JSON.parse(env.GPU_CLUSTER) as GpuWorkerSpec[];
    } catch {
      /* fall through to defaults */
    }
  }
  const workers: GpuWorkerSpec[] = [];
  const add = (modelId: string, urlsCsv?: string, single?: string) => {
    const urls = (urlsCsv ?? single ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    urls.forEach((baseUrl, i) =>
      workers.push({ id: `${modelId}-${i}`, modelId, gpuType: "A40", baseUrl }),
    );
  };
  add("wan-2.1", env.WAN_GPU_URLS, env.WAN_GPU_URL);
  add("hunyuan", env.HUNYUAN_GPU_URLS, env.HUNYUAN_GPU_URL);
  return workers;
}
