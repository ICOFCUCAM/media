import { Module } from "@nestjs/common";
import { GpuService } from "../gpu/gpu.service";
import { FilmsController } from "./films.controller";
import { FilmsService } from "./films.service";

@Module({
  controllers: [FilmsController],
  providers: [FilmsService, GpuService],
})
export class FilmsModule {}
