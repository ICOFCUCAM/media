import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { QUEUES, remainingBudgetMs, type FilmJob, planSceneCount, planShotCount, outputDimensions, isStillMotion, type AnimationStyle, type Medium } from "@cineforge/shared";
import { estimateFilmMs, isModelAllowed, allowedModels, type Tier } from "@cineforge/model-adapters";
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
  estimate(project: { modelId: string; targetSeconds: number; aspectRatio: string; resolution?: string | null; medium?: string | null; animationStyle?: string | null }) {
    // The size the worker will actually generate (every aspect, every format).
    const [width, height] = outputDimensions(project.resolution ?? "720p", project.aspectRatio);
    return estimateFilmMs(project.modelId, {
      shotCount: planShotCount(project.targetSeconds),
      sceneCount: planSceneCount(project.targetSeconds),
      width,
      height,
      // Storybook / motion comic (W12) are drawn stills moved by the camera: no GPU video.
      stillMotion: isStillMotion({ medium: (project.medium ?? "live_action") as Medium, animationStyle: (project.animationStyle ?? null) as AnimationStyle | null }),
    });
  }

  async generateFilm(userId: string, projectId: string) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new BadRequestException("Project not found");
    if (project.status === "GENERATING" || project.status === "PLANNING") {
      throw new BadRequestException("Film generation already in progress");
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // 1) Model routing policy (C5): enforce tier gating before anything else.
    if (!isModelAllowed(project.modelId, user.tier as Tier)) {
      throw new BadRequestException({
        error: {
          code: "MODEL_NOT_ALLOWED",
          message: `Model ${project.modelId} is not available on the ${user.tier} tier`,
          details: { modelId: project.modelId, tier: user.tier, allowed: allowedModels(user.tier as Tier) },
        },
      });
    }

    // 2) Cost governor.
    const estimatedMs = this.estimate(project);
    if (user.tier !== "ENTERPRISE" && user.creditsMs < estimatedMs) {
      throw new BadRequestException({
        error: {
          code: "INSUFFICIENT_CREDITS",
          message: "Estimated cost exceeds available credits",
          details: { estimatedMs, creditsMs: user.creditsMs },
        },
      });
    }

    // 3) Start the GPU pool and wait until healthy.
    await this.gpu.ensureRunning(project.modelId);

    // 4) Enqueue. Record the estimate as the project's budget ceiling.
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

  /**
   * Resume a PAUSED project (docs/24 §C8). Optionally raises the ceiling by
   * topping up the estimate, re-checks affordability, restarts the GPU, and
   * re-enqueues the flow WITHOUT re-planning — completed shots are preserved.
   */
  async resumeFilm(userId: string, projectId: string, addBudgetMs = 0) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new BadRequestException("Project not found");
    if (project.status !== "PAUSED" && project.status !== "FAILED") {
      throw new BadRequestException("Project is not paused");
    }

    // Raise the ceiling so work can proceed past the prior estimate.
    const estimatedMs = (project.estimatedMs ?? this.estimate(project)) + Math.max(0, addBudgetMs);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const headroom = remainingBudgetMs(estimatedMs, project.spentMs);
    if (user.tier !== "ENTERPRISE" && (user.creditsMs <= 0 || headroom <= 0)) {
      throw new BadRequestException({
        error: {
          code: "INSUFFICIENT_CREDITS",
          message: "Add budget or credits to resume",
          details: { estimatedMs, spentMs: project.spentMs, creditsMs: user.creditsMs },
        },
      });
    }

    await this.gpu.ensureRunning(project.modelId);
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "GENERATING", estimatedMs, errorMessage: null },
    });
    const job = await this.filmQueue.add(
      "resume",
      { projectId },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000 },
    );

    this.log.log(`resumeFilm project=${projectId} estMs=${estimatedMs} spent=${project.spentMs} job=${job.id}`);
    return { jobId: job.id, projectId, status: "GENERATING" as const, estimatedMs, spentMs: project.spentMs };
  }
}
