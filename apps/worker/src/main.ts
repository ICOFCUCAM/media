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
import "./processors/film.processor";
import "./processors/scene.processor";
import "./processors/video.processor";
import "./processors/audio.processor";
import "./processors/render.processor";
import "./processors/lora.processor";
import "./processors/localize.processor";
import "./processors/voice-lab.processor";
import "./processors/social.processor";
import "./processors/publish.processor";
import { startProjectPoller } from "./orchestration/project-poller";
import { startHealthServer } from "./health";
import { prisma } from "@cineforge/db";
import { currentRegistry, publishCapabilities, readGpuCaps } from "./truth/capabilities";

// Resilience net: a background worker must not die on a transient connection
// blip (Redis/Postgres reconnecting, a socket reset). BullMQ + ioredis recover
// on their own — log loudly and keep running rather than crash-looping.
process.on("uncaughtException", (e) => console.error("[worker] uncaughtException:", e));
process.on("unhandledRejection", (e) => console.error("[worker] unhandledRejection:", e));

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

// Watch the database for web-created Auto films and enqueue them (Gap 2 bridge).
const stopPoller = startProjectPoller();

// Capability Registry (DirectorOS DOS-77/78): publish what is actually
// operational, from env + the GPU workers' last verified /capabilities.
const reporter = process.env.DEPLOYMENT_ID || process.env.HOSTNAME || "worker";
const publishNow = async () => {
  const caps = await readGpuCaps(gpu.redis, ["wan-2.1", "hunyuan"]);
  await publishCapabilities(prisma, currentRegistry(process.env, caps), reporter);
};
publishNow().catch((e) => console.error("[truth] capabilities", e));
const capsTimer = setInterval(
  () => publishNow().catch((e) => console.error("[truth] capabilities", e)),
  Math.max(60, Number(process.env.CAPABILITY_PUBLISH_SEC ?? 300)) * 1000,
);

// HTTP health for platforms that need one (DeployPro sets PORT; Render does not).
const health = process.env.PORT ? startHealthServer({ port: Number(process.env.PORT), ping: () => gpu.redis.ping() }) : null;

console.log("cineforge worker up: processors + project watcher + GPU lifecycle loops running");

// Graceful shutdown.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    stopPoller();
    clearInterval(capsTimer);
    health?.close();
    for (const mgr of gpu.byModel.values()) mgr.stopLoop();
    await gpu.tracker.close();
    await gpu.redis.quit();
    process.exit(0);
  });
}
