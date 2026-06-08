/**
 * GpuLifecycleManager — the Auto GPU Lifecycle Manager.
 *
 * Goal: GPUs cost money only while they generate. The GPU starts on demand when
 * a job is submitted and shuts down automatically AFTER the very last
 * generation completes and a grace period passes — even if 100 users are still
 * online and only one generation remains, the GPU stays up until that last job
 * is done. See docs/23-gpu-lifecycle-manager.md.
 *
 * Shutdown predicate (reference-counted across all users / nodes):
 *   ACTIVE_JOBS == 0  AND  QUEUED_JOBS == 0  AND  IDLE_TIME >= GRACE
 *
 * Multi-node safety: power state, the idle-since timestamp, and a short-lived
 * action lock all live in Redis, so many API/worker replicas converge on one
 * decision. Counts come from the authoritative BullMQ queue state
 * (ActiveJobTracker), so the "last job" is observed correctly regardless of
 * which node finishes it.
 */
import Redis from "ioredis";
import { ActiveJobTracker } from "./active-job-tracker";
import { RunpodControlClient, type GpuPowerState } from "./runpod-control";

export interface LifecycleConfig {
  /** Logical GPU pool key, e.g. "wan-2.1" | "hunyuan" — one manager per pool. */
  pool: string;
  /** Grace period before shutdown after the last job drains. Default 15 min. */
  graceMs?: number;
  /** Reconcile cadence. Default 30s. */
  reconcileMs?: number;
}

const KEYS = (pool: string) => ({
  state: `gpu:${pool}:state`, // RUNNING | STARTING | STOPPED
  idleSince: `gpu:${pool}:idleSince`, // epoch ms when queue first hit empty
  lock: `gpu:${pool}:lock`, // action lock (start/stop)
});

export class GpuLifecycleManager {
  private readonly graceMs: number;
  private readonly reconcileMs: number;
  private readonly k: ReturnType<typeof KEYS>;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly redis: Redis,
    private readonly tracker: ActiveJobTracker,
    private readonly control: RunpodControlClient,
    private readonly cfg: LifecycleConfig,
  ) {
    this.graceMs = cfg.graceMs ?? 15 * 60_000;
    this.reconcileMs = cfg.reconcileMs ?? 30_000;
    this.k = KEYS(cfg.pool);
  }

  // ── Start-on-demand ────────────────────────────────────────────────
  /**
   * Call from the API BEFORE enqueuing a generation job. Ensures the GPU is up
   * and healthy, then returns — so the job only runs against a ready worker.
   * Idempotent and lock-guarded so concurrent submissions start the GPU once.
   */
  async ensureRunning(): Promise<void> {
    // New work invalidates any pending shutdown immediately.
    await this.redis.del(this.k.idleSince);

    const state = (await this.redis.get(this.k.state)) as GpuPowerState | null;
    if (state === "RUNNING") {
      if (await this.control.isHealthy()) return;
      // marked running but unhealthy -> fall through and (re)start
    }

    const gotLock = await this.acquireLock(120_000);
    if (!gotLock) {
      // Another node is starting it; just wait for health.
      await this.control.waitUntilHealthy();
      return;
    }
    try {
      await this.redis.set(this.k.state, "STARTING");
      await this.control.start();
      await this.control.waitUntilHealthy();
      await this.redis.set(this.k.state, "RUNNING");
    } finally {
      await this.releaseLock();
    }
  }

  // ── Reconcile loop (the safety net + shutdown driver) ──────────────
  /** Run periodically and on queue-drain events. */
  async reconcile(): Promise<void> {
    const counts = await this.tracker.counts();

    // Any work in flight (running OR queued, across all users) -> stay up.
    if (counts.total > 0) {
      await this.redis.del(this.k.idleSince);
      return;
    }

    // Queue empty. Start (or continue) the grace timer.
    const now = Date.now();
    const since = await this.redis.get(this.k.idleSince);
    if (!since) {
      // First moment of idleness -> remember it. NX so we don't reset on every tick.
      await this.redis.set(this.k.idleSince, String(now), "NX");
      return;
    }

    const idleMs = now - Number(since);
    if (idleMs < this.graceMs) return; // still within grace; a new job cancels this

    // ACTIVE==0 && QUEUED==0 && IDLE>=GRACE  -> shut down.
    const state = (await this.redis.get(this.k.state)) as GpuPowerState | null;
    if (state === "STOPPED") return;

    const gotLock = await this.acquireLock(60_000);
    if (!gotLock) return; // another node handling it
    try {
      // Re-check under lock: a job may have arrived between checks.
      if ((await this.tracker.counts()).total > 0) {
        await this.redis.del(this.k.idleSince);
        return;
      }
      await this.control.stop();
      await this.redis.set(this.k.state, "STOPPED");
      await this.redis.del(this.k.idleSince);
    } finally {
      await this.releaseLock();
    }
  }

  /** Start the background reconcile loop (run in the worker process). */
  startLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reconcile().catch((e) => console.error(`[gpu:${this.cfg.pool}] reconcile`, e));
    }, this.reconcileMs);
    this.timer.unref?.();
  }

  stopLoop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async status() {
    return {
      pool: this.cfg.pool,
      state: (await this.redis.get(this.k.state)) ?? "UNKNOWN",
      idleSince: await this.redis.get(this.k.idleSince),
      graceMs: this.graceMs,
      counts: await this.tracker.counts(),
    };
  }

  // ── Redis lock (single-actor start/stop) ───────────────────────────
  private token = `${process.pid}-${Math.random().toString(36).slice(2)}`;

  private async acquireLock(ttlMs: number): Promise<boolean> {
    const ok = await this.redis.set(this.k.lock, this.token, "PX", ttlMs, "NX");
    return ok === "OK";
  }

  private async releaseLock(): Promise<void> {
    // Only release if we still own it (compare-and-delete).
    const lua = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
    await this.redis.eval(lua, 1, this.k.lock, this.token);
  }
}
