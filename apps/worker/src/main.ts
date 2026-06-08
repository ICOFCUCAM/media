/**
 * Worker bootstrap. Runs the BullMQ processors and, crucially, OWNS the GPU
 * auto-shutdown loop: it starts each pool's reconcile loop and also triggers an
 * immediate reconcile whenever a GPU queue `drained` (last job left the queue),
 * so shutdown reacts instantly to the grace window instead of waiting for the
 * next interval tick. See docs/23-gpu-lifecycle-manager.md.
 */
import { QueueEvents } from "bullmq";
import { QUEUES } from "@cineforge/shared";
import { createGpuManagers } from "@cineforge/gpu";
import "./processors/video.processor";
// import "./processors/film.processor";  import "./processors/scene.processor"; ...

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

const gpu = createGpuManagers({
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
});

// 1) Periodic reconcile loop per model pool (the safety net + grace driver).
for (const mgr of gpu.byModel.values()) mgr.startLoop();

// 2) Event-driven reconcile: react the instant a GPU queue empties.
const reconcileAll = () => {
  for (const mgr of gpu.byModel.values()) {
    mgr.reconcile().catch((e) => console.error("[gpu] reconcile (drained)", e));
  }
};
for (const name of [QUEUES.video, QUEUES.audio]) {
  const events = new QueueEvents(name, { connection });
  events.on("drained", reconcileAll);
  events.on("completed", reconcileAll); // last active job finishing also triggers a check
}

console.log("cineforge worker up: processors + GPU lifecycle loops running");

// Graceful shutdown.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    for (const mgr of gpu.byModel.values()) mgr.stopLoop();
    await gpu.tracker.close();
    await gpu.redis.quit();
    process.exit(0);
  });
}
