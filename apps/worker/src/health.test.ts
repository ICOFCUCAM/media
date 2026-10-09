import type { AddressInfo } from "node:net";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { MetricsRegistry } from "@cineforge/shared";
import { countJobs, startHealthServer } from "./health";

let close: (() => void) | null = null;
afterEach(() => close?.());

async function start(checks: Record<string, () => Promise<unknown>>, metrics = new MetricsRegistry()) {
  const s = startHealthServer({ port: 0, checks, timeoutMs: 100, metrics });
  await new Promise((r) => s.once("listening", r));
  close = () => s.close();
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

describe("worker probes", () => {
  it("ready when the queue and the database answer", async () => {
    const base = await start({ redis: async () => "PONG", database: async () => 1 });
    for (const path of ["/readyz", "/"]) {
      const res = await fetch(base + path);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ status: "ok", service: "cineforge-worker", checks: { redis: { ok: true }, database: { ok: true } } });
    }
  });

  it("503 naming the dependency that failed or hung, so a bad REDIS_URL or DATABASE_URL never gets promoted", async () => {
    const base = await start({ redis: async () => { throw new Error("ECONNREFUSED"); }, database: () => new Promise(() => {}) });
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
    const body = await res.json() as { checks: Record<string, { ok: boolean; error?: string }> };
    expect(body.checks.redis).toMatchObject({ ok: false, error: "ECONNREFUSED" });
    expect(body.checks.database?.error).toMatch(/timeout/);
  });

  it("live while the process answers, even when a dependency is down", async () => {
    const base = await start({ redis: async () => { throw new Error("down"); } });
    expect((await fetch(`${base}/livez`)).status).toBe(200);
  });

  it("serves Prometheus metrics, counting jobs per queue and outcome", async () => {
    const reg = new MetricsRegistry();
    const w = new EventEmitter();
    countJobs("video-queue", w as never, reg);
    w.emit("completed"); w.emit("completed"); w.emit("failed");
    const base = await start({}, reg);
    const res = await fetch(`${base}/metrics`);
    expect(res.headers.get("content-type")).toMatch(/text\/plain; version=0.0.4/);
    const text = await res.text();
    expect(text).toContain('cineforge_jobs_total{outcome="completed",queue="video-queue"} 2');
    expect(text).toContain('cineforge_jobs_total{outcome="failed",queue="video-queue"} 1');
  });

  it("only answers reads; unknown paths are 404", async () => {
    const base = await start({});
    expect((await fetch(`${base}/readyz`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
