import { metrics } from "@cineforge/shared";

const HELP = "API requests by route pattern, method and status";

type Req = { method: string; route?: { path?: string }; baseUrl?: string };
type Res = { statusCode: number; on(event: "finish", fn: () => void): unknown };

/**
 * cineforge_http_requests_total{method,route,status}, counted when the
 * response finishes — so requests a guard refuses (401/403) are counted too.
 * The route PATTERN is recorded, never ids from the path.
 */
export function httpMetrics(req: Req, res: Res, next: () => void): void {
  res.on("finish", () => {
    const route = req.route?.path ? `${req.baseUrl ?? ""}${req.route.path}` : "unmatched";
    metrics.inc("cineforge_http_requests_total", HELP, { method: req.method, route, status: res.statusCode });
  });
  next();
}
