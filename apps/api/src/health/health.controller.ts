import { Controller, Get, Header, HttpException, Inject } from "@nestjs/common";
import type { GpuManagers } from "@cineforge/gpu";
import { prisma } from "@cineforge/db";
import { METRICS_CONTENT_TYPE, metrics, readiness } from "@cineforge/shared";
import { GPU_MANAGERS } from "../gpu/gpu.module";

/**
 * Probes and metrics (docs/38 §AF): outside the /v1 prefix, unauthenticated,
 * no data. /readyz is 503 while the database or the queue does not answer.
 */
@Controller()
export class HealthController {
  constructor(@Inject(GPU_MANAGERS) private readonly gpu: GpuManagers) {}

  @Get("livez")
  livez() {
    return { status: "ok", service: "cineforge-api" };
  }

  @Get("readyz")
  async readyz() {
    const r = await readiness({ database: () => prisma.$queryRaw`select 1`, redis: () => this.gpu.redis.ping() });
    const body = { status: r.ok ? "ok" : "not ready", service: "cineforge-api", checks: r.checks };
    if (!r.ok) throw new HttpException(body, 503);
    return body;
  }

  @Get("metrics")
  @Header("content-type", METRICS_CONTENT_TYPE)
  @Header("cache-control", "no-store")
  metrics() {
    return metrics.render();
  }
}
