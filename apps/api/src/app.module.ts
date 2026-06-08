import { Module } from "@nestjs/common";
import { GpuModule } from "./gpu/gpu.module";
import { FilmsModule } from "./films/films.module";
import { AdminModule } from "./admin/admin.module";

/**
 * Root module. Only the slices relevant to GPU lifecycle wiring are included
 * here; the full API adds auth/users/projects/scenes/billing/etc.
 * (see docs/03-folder-structure.md).
 */
@Module({
  imports: [GpuModule, FilmsModule, AdminModule],
})
export class AppModule {}
