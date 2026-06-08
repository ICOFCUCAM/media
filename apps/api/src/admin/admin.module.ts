import { Module } from "@nestjs/common";
import { GpuService } from "../gpu/gpu.service";
import { AdminController } from "./admin.controller";

@Module({
  controllers: [AdminController],
  providers: [GpuService],
})
export class AdminModule {}
