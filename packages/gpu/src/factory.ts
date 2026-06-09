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
}

export interface GpuManagers {
  /** model id -> manager. Keys match VideoJob.modelId / project.modelId. */
  byModel: Map<string, GpuLifecycleManager>;
  redis: Redis;
  tracker: ActiveJobTracker;
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

  byModel.set(
    "wan-2.1",
    new GpuLifecycleManager(
      redis,
      tracker,
      new RunpodControlClient({
        apiKey: env.RUNPOD_API_KEY,
        podId: env.RUNPOD_WAN_POD_ID,
        endpointId: env.RUNPOD_WAN_ENDPOINT_ID,
        healthUrl: `${env.WAN_GPU_URL}/health`,
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
        healthUrl: `${env.HUNYUAN_GPU_URL}/health`,
      }),
      { pool: "hunyuan", graceMs, reconcileMs },
    ),
  );

  return { byModel, redis, tracker };
}
