import { Module } from "@nestjs/common";
import { GpuModule } from "./gpu/gpu.module";
import { FilmsModule } from "./films/films.module";
import { AdminModule } from "./admin/admin.module";
import { VoicesModule } from "./voices/voices.module";
import { HealthModule } from "./health/health.module";

/**
 * The public CineForge API (docs/56 §2): film generation for API clients, the
 * Voice API, admin GPU/cost views, probes and metrics. The web app does not
 * use it — the Studio writes to Supabase and the worker drives productions.
 */
@Module({
  imports: [GpuModule, FilmsModule, AdminModule, VoicesModule, HealthModule],
})
export class AppModule {}
