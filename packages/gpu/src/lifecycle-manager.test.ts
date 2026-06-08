import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GpuLifecycleManager } from "./lifecycle-manager";

/**
 * Minimal in-memory Redis fake supporting exactly the ops the manager uses:
 * get / set (incl. NX, PX) / del / eval (compare-and-delete lock release).
 */
class FakeRedis {
  store = new Map<string, string>();
  async get(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  async set(k: string, v: string, ...flags: unknown[]) {
    if (flags.includes("NX") && this.store.has(k)) return null;
    this.store.set(k, v);
    return "OK";
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }
  async eval(_lua: string, _n: number, key: string, arg: string) {
    if (this.store.get(key) === arg) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}

function makeManager(opts?: { graceMs?: number }) {
  const redis = new FakeRedis();
  const counts = vi.fn().mockResolvedValue({ queued: 0, running: 0, pending: 0, total: 0 });
  const tracker = { counts };
  const control = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isHealthy: vi.fn().mockResolvedValue(false),
    waitUntilHealthy: vi.fn().mockResolvedValue(undefined),
  };
  const mgr = new GpuLifecycleManager(
    redis as any,
    tracker as any,
    control as any,
    { pool: "wan-2.1", graceMs: opts?.graceMs ?? 1000, reconcileMs: 999999 },
  );
  return { mgr, redis, tracker, control, counts };
}

describe("GpuLifecycleManager.ensureRunning", () => {
  it("starts the GPU once under concurrent submissions", async () => {
    const { mgr, control } = makeManager();
    // healthy only becomes true after start() is called
    control.isHealthy.mockImplementation(async () => control.start.mock.calls.length > 0);

    await Promise.all(Array.from({ length: 8 }, () => mgr.ensureRunning()));

    expect(control.start).toHaveBeenCalledTimes(1);
    expect((await mgr.status()).state).toBe("RUNNING");
  });

  it("returns immediately when already RUNNING and healthy (no restart)", async () => {
    const { mgr, control } = makeManager();
    control.isHealthy.mockImplementation(async () => control.start.mock.calls.length > 0);
    await mgr.ensureRunning(); // first start
    control.isHealthy.mockResolvedValue(true); // now healthy regardless of call count
    control.start.mockClear();

    await mgr.ensureRunning(); // already running -> short-circuits before lock
    expect(control.start).not.toHaveBeenCalled();
  });

  it("cancels a pending auto-shutdown (clears idleSince)", async () => {
    const { mgr, redis, control } = makeManager();
    control.isHealthy.mockResolvedValue(true);
    await redis.set("gpu:wan-2.1:idleSince", "12345");

    await mgr.ensureRunning();

    expect(await redis.get("gpu:wan-2.1:idleSince")).toBeNull();
  });
});

describe("GpuLifecycleManager.reconcile — shutdown predicate", () => {
  it("stays up while any job is active (multi-user: one job left)", async () => {
    const { mgr, control, counts } = makeManager();
    counts.mockResolvedValue({ queued: 0, running: 1, pending: 0, total: 1 });

    await mgr.reconcile();

    expect(control.stop).not.toHaveBeenCalled();
  });

  it("does not shut down before the grace period elapses", async () => {
    const { mgr, control, redis } = makeManager({ graceMs: 1000 });
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);

    await mgr.reconcile(); // queue empty -> set idleSince=1000
    expect(await redis.get("gpu:wan-2.1:idleSince")).toBe("1000");

    now.mockReturnValue(1500); // only 500ms < 1000ms grace
    await mgr.reconcile();
    expect(control.stop).not.toHaveBeenCalled();
  });

  it("shuts down only after ACTIVE==0 && QUEUED==0 && IDLE>=grace", async () => {
    const { mgr, control, redis } = makeManager({ graceMs: 1000 });
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);

    await mgr.reconcile(); // idleSince=1000
    now.mockReturnValue(2001); // 1001ms >= 1000ms grace
    await mgr.reconcile();

    expect(control.stop).toHaveBeenCalledTimes(1);
    expect(await redis.get("gpu:wan-2.1:state")).toBe("STOPPED");
    expect(await redis.get("gpu:wan-2.1:idleSince")).toBeNull();
  });

  it("a new job arriving during grace cancels the shutdown", async () => {
    const { mgr, control, counts, redis } = makeManager({ graceMs: 1000 });
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);

    await mgr.reconcile(); // idle -> idleSince set
    // a job arrives
    counts.mockResolvedValue({ queued: 1, running: 0, pending: 0, total: 1 });
    now.mockReturnValue(5000);
    await mgr.reconcile();

    expect(control.stop).not.toHaveBeenCalled();
    expect(await redis.get("gpu:wan-2.1:idleSince")).toBeNull();
  });

  it("re-checks counts under the lock and aborts shutdown if a job slipped in", async () => {
    const { mgr, control, counts, redis } = makeManager({ graceMs: 1000 });
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    await mgr.reconcile(); // idleSince=1000
    now.mockReturnValue(2001);
    // empty at the top-of-reconcile check, but a job appears before the locked re-check
    counts
      .mockResolvedValueOnce({ queued: 0, running: 0, pending: 0, total: 0 }) // first check
      .mockResolvedValueOnce({ queued: 0, running: 1, pending: 0, total: 1 }); // under-lock recheck

    await mgr.reconcile();

    expect(control.stop).not.toHaveBeenCalled();
    expect(await redis.get("gpu:wan-2.1:idleSince")).toBeNull();
  });
});

afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.restoreAllMocks());
