import { Controller, Get, UseGuards } from "@nestjs/common";
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
}
