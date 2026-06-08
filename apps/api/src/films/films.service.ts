import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { QUEUES, type FilmJob, planSceneCount, planShotCount } from "@cineforge/shared";
import { estimateFilmMs } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { GpuService } from "../gpu/gpu.service";

/**
 * Generate-film entry point. Two guards run before any GPU is touched:
 *  1. Cost governor (docs/24 §C8): a pre-flight GPU-ms estimate; reject if the
 *     user can't afford it (non-Enterprise), and record it on the project as a
 *     budget ceiling for the worker to enforce.
 *  2. Start-on-demand (docs/23): the GPU is started + confirmed healthy before
 *     the film job is enqueued, and any pending auto-shutdown is cancelled.
 */
@Injectable()
export class FilmsService {
  private readonly log = new Logger(FilmsService.name);
  private readonly filmQueue = new Queue<FilmJob>(QUEUES.film, {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
  });

  constructor(private readonly gpu: GpuService) {}

  /** Pre-flight cost estimate in GPU-ms, before anything is generated. */
  estimate(project: { modelId: string; targetSeconds: number; aspectRatio: string }) {
    const [width, height] = project.aspectRatio === "9:16" ? [720, 1280] : [1280, 720];
    return estimateFilmMs(project.modelId, {
      shotCount: planShotCount(project.targetSeconds),
      sceneCount: planSceneCount(project.targetSeconds),
      width,
      height,
    });
  }

  async generateFilm(userId: string, projectId: string) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new BadRequestException("Project not found");
    if (project.status === "GENERATING" || project.status === "PLANNING") {
      throw new BadRequestException("Film generation already in progress");
    }

    // 1) Cost governor.
    const estimatedMs = this.estimate(project);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.tier !== "ENTERPRISE" && user.creditsMs < estimatedMs) {
      throw new BadRequestException({
        error: {
          code: "INSUFFICIENT_CREDITS",
          message: "Estimated cost exceeds available credits",
          details: { estimatedMs, creditsMs: user.creditsMs },
        },
      });
    }

    // 2) Start the GPU pool and wait until healthy.
    await this.gpu.ensureRunning(project.modelId);

    // 3) Enqueue. Record the estimate as the project's budget ceiling.
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "PLANNING", progress: 0, errorMessage: null, estimatedMs },
    });
    const job = await this.filmQueue.add(
      "plan",
      { projectId },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000 },
    );

    this.log.log(`generateFilm project=${projectId} model=${project.modelId} estMs=${estimatedMs} job=${job.id}`);
    return { jobId: job.id, projectId, status: "PLANNING" as const, estimatedMs };
  }
}
