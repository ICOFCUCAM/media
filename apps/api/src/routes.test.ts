/** The route table the API actually serves (global prefix + controller + method paths). */
import "reflect-metadata";
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AdminController } from "./admin/admin.controller";
import { FilmsController } from "./films/films.controller";
import { HealthController } from "./health/health.controller";
import { VoicesController } from "./voices/voices.controller";

const PREFIX = "v1";
const EXCLUDED = new Set(["livez", "readyz", "metrics"]);

function routes(ctrl: abstract new (...a: never[]) => unknown): string[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, ctrl) ?? "").replace(/^\/|\/$/g, "");
  return Object.getOwnPropertyNames(ctrl.prototype).filter((m) => m !== "constructor").flatMap((m) => {
    const fn = (ctrl.prototype as Record<string, unknown>)[m];
    const path = typeof fn === "function" ? Reflect.getMetadata(PATH_METADATA, fn) : undefined;
    if (path === undefined) return [];
    const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn as object) as number];
    const rel = [base, String(path).replace(/^\/|\/$/g, "")].filter(Boolean).join("/");
    return [`${method} /${EXCLUDED.has(rel) ? rel : `${PREFIX}/${rel}`}`];
  });
}

describe("API routes", () => {
  it("serve the documented paths — the Voice API is /v1/voices, not /v1/v1/voices", () => {
    expect([AdminController, FilmsController, HealthController, VoicesController].flatMap(routes).sort()).toEqual([
      "DELETE /v1/voices/:id",
      "GET /livez",
      "GET /metrics",
      "GET /readyz",
      "GET /v1/admin/cost",
      "GET /v1/admin/gpu",
      "GET /v1/jobs/:id",
      "GET /v1/projects/:id/estimate",
      "GET /v1/voices/:id",
      "POST /v1/generate-film",
      "POST /v1/projects/:id/resume",
      "POST /v1/speech",
      "POST /v1/speech/batch",
      "POST /v1/voices",
    ]);
  });
});

describe("request metrics", () => {
  it("count refused requests too, by route pattern", async () => {
    const { httpMetrics } = await import("./health/http-metrics");
    const { metrics } = await import("@cineforge/shared");
    let finish = () => {};
    httpMetrics({ method: "POST", route: { path: "/v1/voices/:id" } }, { statusCode: 401, on: (_e, fn) => { finish = fn; } }, () => {});
    finish();
    expect(metrics.render()).toContain('cineforge_http_requests_total{method="POST",route="/v1/voices/:id",status="401"} 1');
  });
});
