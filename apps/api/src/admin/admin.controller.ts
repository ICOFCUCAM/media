import { Controller, Get, UseGuards } from "@nestjs/common";
import { prisma } from "@cineforge/db";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import { GpuService } from "../gpu/gpu.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly gpu: GpuService) {}

  /**
   * GET /admin/gpu — live state of every GPU pool for the admin dashboard:
   * power state, idleSince, grace, and reference-counted job counts. See
   * docs/16-admin-dashboard.md (GPU monitoring) and docs/23.
   */
  @Get("gpu")
  async getGpuStatus() {
    const pools = await this.gpu.statusAll();
    return {
      pools,
      summary: {
        running: pools.filter((p) => p.state === "RUNNING").length,
        totalActiveJobs: pools.reduce((a, p) => a + p.counts.total, 0),
      },
    };
  }

  /**
   * GET /admin/cost — FinOps view (docs/24 §C8): aggregate GPU spend, breakdown
   * by kind, and projects that paused for exceeding their budget (margin alert).
   */
  @Get("cost")
  async cost() {
    const [agg, byKind, paused] = await Promise.all([
      prisma.usageRecord.aggregate({ _sum: { gpuMs: true, costUsd: true } }),
      prisma.usageRecord.groupBy({ by: ["kind"], _sum: { gpuMs: true } }),
      prisma.project.findMany({
        where: { status: "PAUSED" },
        select: { id: true, title: true, estimatedMs: true, spentMs: true },
        take: 100,
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    return {
      totalGpuMs: agg._sum.gpuMs ?? 0,
      totalCostUsd: agg._sum.costUsd ?? 0,
      byKind: byKind.map((k) => ({ kind: k.kind, gpuMs: k._sum.gpuMs ?? 0 })),
      pausedOverBudget: paused.map((p) => ({
        projectId: p.id,
        title: p.title,
        estimatedMs: p.estimatedMs,
        spentMs: p.spentMs,
        overByMs: p.estimatedMs ? Math.max(0, p.spentMs - p.estimatedMs) : 0,
      })),
    };
  }
}
