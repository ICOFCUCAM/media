/**
 * HTTP probes and metrics for the worker (docs/38 §AF checklist 3–4).
 *
 *   /livez    200 while the process answers
 *   /readyz   200 only when every dependency answers (Redis queue, database);
 *             503 with which one failed — a worker that cannot reach its
 *             queue or database must not be promoted or kept in rotation
 *   /         same as /readyz (platforms that only probe "/")
 *   /metrics  Prometheus text: jobs per queue and outcome, metered usage
 *
 * Starts when PORT is set (DeployPro, Kubernetes); Render background workers
 * have no port and skip it.
 */
import { createServer, type Server } from "node:http";
import { METRICS_CONTENT_TYPE, metrics as registry, readiness, type MetricsRegistry } from "@cineforge/shared";

export interface HealthOptions {
  port: number;
  /** Dependency checks for /readyz, by name. */
  checks: Record<string, () => Promise<unknown>>;
  timeoutMs?: number;
  service?: string;
  metrics?: MetricsRegistry;
}

export function startHealthServer(opts: HealthOptions): Server {
  const service = opts.service ?? "cineforge-worker";
  const reg = opts.metrics ?? registry;
  const server = createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    const path = (req.url ?? "/").split("?")[0];
    const send = (status: number, body: string, type = "application/json") => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (path === "/livez") return send(200, JSON.stringify({ status: "ok", service }));
    if (path === "/metrics") return send(200, reg.render(), METRICS_CONTENT_TYPE);
    if (path === "/readyz" || path === "/") {
      const r = await readiness(opts.checks, opts.timeoutMs ?? 2000);
      return send(r.ok ? 200 : 503, JSON.stringify({ status: r.ok ? "ok" : "not ready", service, checks: r.checks }));
    }
    send(404, JSON.stringify({ status: "not found" }));
  });
  server.listen(opts.port, "0.0.0.0");
  return server;
}

/** Count every job a queue finishes, by outcome (cineforge_jobs_total). */
export function countJobs(queue: string, worker: { on(event: "completed" | "failed", fn: () => void): unknown }, reg: MetricsRegistry = registry): void {
  const help = "BullMQ jobs finished by this worker, by queue and outcome";
  worker.on("completed", () => reg.inc("cineforge_jobs_total", help, { queue, outcome: "completed" }));
  worker.on("failed", () => reg.inc("cineforge_jobs_total", help, { queue, outcome: "failed" }));
}
