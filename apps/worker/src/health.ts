/**
 * Optional HTTP health endpoint. Platforms that promote a deployment only after
 * an HTTP check (DeployPro: 200 on "/" before routing, then every minute) need
 * one; Render's background worker does not, so it starts only when PORT is set.
 *
 * Healthy = this process is up AND Redis (the job queue) answers PING. A worker
 * that cannot reach its queue is not healthy, so a misconfigured REDIS_URL
 * fails the deploy instead of being promoted.
 */
import { createServer, type Server } from "node:http";

export function startHealthServer(opts: { port: number; ping: () => Promise<unknown>; timeoutMs?: number }): Server {
  const server = createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    let ok = false;
    try {
      await Promise.race([
        opts.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), opts.timeoutMs ?? 2000)),
      ]);
      ok = true;
    } catch {
      ok = false;
    }
    res.writeHead(ok ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify({ status: ok ? "ok" : "queue unreachable", service: "cineforge-worker" }));
  });
  server.listen(opts.port, "0.0.0.0");
  return server;
}
