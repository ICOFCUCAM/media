import { Global, Module } from "@nestjs/common";
import { createGpuManagers, type GpuManagers } from "@cineforge/gpu";

export const GPU_MANAGERS = "GPU_MANAGERS";

/**
 * Exposes the per-model GpuLifecycleManagers to the API. The API only ever
 * calls `ensureRunning()` (start-on-demand). The reconcile loop that performs
 * auto-shutdown runs in the worker process (see apps/worker/src/main.ts) so a
 * single owner drives shutdown — but both share Redis state, so it's safe even
 * if the API also reconciles. See docs/23.
 */
@Global()
@Module({
  providers: [
    {
      provide: GPU_MANAGERS,
      useFactory: (): GpuManagers =>
        createGpuManagers({
          REDIS_URL: process.env.REDIS_URL!,
          RUNPOD_API_KEY: process.env.RUNPOD_API_KEY!,
          GPU_IDLE_GRACE_SEC: process.env.GPU_IDLE_GRACE_SEC,
          GPU_RECONCILE_SEC: process.env.GPU_RECONCILE_SEC,
          WAN_GPU_URL: process.env.WAN_GPU_URL!,
          RUNPOD_WAN_POD_ID: process.env.RUNPOD_WAN_POD_ID,
          RUNPOD_WAN_ENDPOINT_ID: process.env.RUNPOD_WAN_ENDPOINT_ID,
          HUNYUAN_GPU_URL: process.env.HUNYUAN_GPU_URL!,
          RUNPOD_HUNYUAN_POD_ID: process.env.RUNPOD_HUNYUAN_POD_ID,
          RUNPOD_HUNYUAN_ENDPOINT_ID: process.env.RUNPOD_HUNYUAN_ENDPOINT_ID,
        }),
    },
  ],
  exports: [GPU_MANAGERS],
})
export class GpuModule {}
