import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { QUEUES, type FilmJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { GpuService } from "../gpu/gpu.service";

/**
 * Generate-film entry point. The headline behavior for docs/23: the GPU is
 * started on demand and confirmed healthy BEFORE any generation job is
 * enqueued, so users never queue work against a cold/absent GPU, and the GPU's
 * idle-shutdown timer is cancelled the moment new work is accepted.
 */
@Injectable()
export class FilmsService {
  private readonly log = new Logger(FilmsService.name);
  private readonly filmQueue = new Queue<FilmJob>(QUEUES.film, {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
  });

  constructor(private readonly gpu: GpuService) {}

  async generateFilm(userId: string, projectId: string) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) throw new BadRequestException("Project not found");
    if (project.status === "GENERATING" || project.status === "PLANNING") {
      throw new BadRequestException("Film generation already in progress");
    }

    // 1) Start the GPU pool for this project's model and wait until healthy.
    //    Cancels any pending auto-shutdown and starts the pod if it was off.
    await this.gpu.ensureRunning(project.modelId);

    // 2) Now enqueue the film job (Director -> fan-out scenes -> shots).
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "PLANNING", progress: 0, errorMessage: null },
    });
    const job = await this.filmQueue.add(
      "plan",
      { projectId },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000 },
    );

    this.log.log(`generateFilm project=${projectId} model=${project.modelId} job=${job.id}`);
    return { jobId: job.id, projectId, status: "PLANNING" as const };
  }
}
