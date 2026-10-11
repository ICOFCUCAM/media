/**
 * Builds one GpuLifecycleManager per model pool from environment config, so the
 * API (ensureRunning before enqueue) and the worker (reconcile loop) share the
 * exact same managers and Redis-coordinated state. See docs/23.
 */
import Redis from "ioredis";
import { ActiveJobTracker } from "./active-job-tracker";
import { RunpodControlClient } from "./runpod-control";
import { GpuLifecycleManager } from "./lifecycle-manager";

export interface GpuEnv {
  REDIS_URL: string;
  RUNPOD_API_KEY: string;
  GPU_IDLE_GRACE_SEC?: string;
  GPU_RECONCILE_SEC?: string;

  // Wan 2.1 (primary)
  WAN_GPU_URL: string;
  RUNPOD_WAN_POD_ID?: string;
  RUNPOD_WAN_ENDPOINT_ID?: string;

  // Hunyuan Video (premium)
  HUNYUAN_GPU_URL: string;
  RUNPOD_HUNYUAN_POD_ID?: string;
  RUNPOD_HUNYUAN_ENDPOINT_ID?: string;

  // Wan 2.2 (W28; the production candidate): a pool only when its worker is configured.
  WAN22_GPU_URL?: string;
  RUNPOD_WAN22_POD_ID?: string;
  RUNPOD_WAN22_ENDPOINT_ID?: string;
}

export interface GpuManagers {
  /** model id -> manager. Keys match VideoJob.modelId / project.modelId. */
  byModel: Map<string, GpuLifecycleManager>;
  redis: Redis;
  tracker: ActiveJobTracker;
}

/** Wan 2.1 and Wan 2.2 are configured on the same pod (same pod id or address). */
export function sharesWan22Pod(env: Pick<GpuEnv, "WAN_GPU_URL" | "WAN22_GPU_URL" | "RUNPOD_WAN_POD_ID" | "RUNPOD_WAN22_POD_ID">): boolean {
  if (!env.WAN22_GPU_URL) return false;
  if (env.RUNPOD_WAN_POD_ID && env.RUNPOD_WAN_POD_ID === env.RUNPOD_WAN22_POD_ID) return true;
  return !!env.WAN_GPU_URL && env.WAN_GPU_URL.replace(/\/+$/, "") === env.WAN22_GPU_URL.replace(/\/+$/, "");
}

export function createGpuManagers(env: GpuEnv): GpuManagers {
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  // Without an 'error' listener, ioredis turns a transient Redis blip (e.g. the
  // Key Value store not ready yet at boot) into an unhandled 'error' event that
  // crashes the whole process. Log and let ioredis reconnect instead.
  redis.on("error", (e: Error) => console.error("[gpu] redis error:", e.message));
  const tracker = new ActiveJobTracker({ url: env.REDIS_URL });
  const graceMs = Number(env.GPU_IDLE_GRACE_SEC ?? 900) * 1000;
  const reconcileMs = Number(env.GPU_RECONCILE_SEC ?? 30) * 1000;

  const byModel = new Map<string, GpuLifecycleManager>();

  let wan22: GpuLifecycleManager | undefined;
  if (env.WAN22_GPU_URL) {
    wan22 = new GpuLifecycleManager(
      redis,
      tracker,
      new RunpodControlClient({
        apiKey: env.RUNPOD_API_KEY,
        podId: env.RUNPOD_WAN22_POD_ID,
        endpointId: env.RUNPOD_WAN22_ENDPOINT_ID,
        healthUrl: `${env.WAN22_GPU_URL}/livez`,
      }),
      { pool: "wan-2.2", graceMs, reconcileMs },
    );
    byModel.set("wan-2.2", wan22);
  }

  // One pod switched from Wan 2.1 to Wan 2.2 (docs/75) is one machine: both
  // pools share its manager, so the idle 2.1 pool never stops the pod while
  // 2.2 shots run on it.
  if (wan22 && sharesWan22Pod(env)) byModel.set("wan-2.1", wan22);
  else byModel.set(
    "wan-2.1",
    new GpuLifecycleManager(
      redis,
      tracker,
      new RunpodControlClient({
        apiKey: env.RUNPOD_API_KEY,
        podId: env.RUNPOD_WAN_POD_ID,
        endpointId: env.RUNPOD_WAN_ENDPOINT_ID,
        healthUrl: `${env.WAN_GPU_URL}/livez`,
      }),
      { pool: "wan-2.1", graceMs, reconcileMs },
    ),
  );

  byModel.set(
    "hunyuan",
    new GpuLifecycleManager(
      redis,
      tracker,
      new RunpodControlClient({
        apiKey: env.RUNPOD_API_KEY,
        podId: env.RUNPOD_HUNYUAN_POD_ID,
        endpointId: env.RUNPOD_HUNYUAN_ENDPOINT_ID,
        healthUrl: `${env.HUNYUAN_GPU_URL}/livez`,
      }),
      { pool: "hunyuan", graceMs, reconcileMs },
    ),
  );

  return { byModel, redis, tracker };
}
