import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { prisma } from "@cineforge/db";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FilmsService } from "./films.service";

class GenerateFilmDto {
  projectId!: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class FilmsController {
  constructor(private readonly films: FilmsService) {}

  /** GET /projects/:id/estimate — pre-flight GPU-ms + affordability (docs/24 §C8). */
  @Get("projects/:id/estimate")
  async estimate(@Req() req: { user: { id: string } }, @Param("id") id: string) {
    const project = await prisma.project.findFirst({ where: { id, userId: req.user.id } });
    if (!project) throw new BadRequestException("Project not found");
    const estimatedMs = this.films.estimate(project);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    return {
      estimatedMs,
      creditsMs: user.creditsMs,
      affordable: user.tier === "ENTERPRISE" || user.creditsMs >= estimatedMs,
    };
  }

  /** POST /generate-film — cost-gates, starts the GPU on demand, then enqueues. */
  @Post("generate-film")
  generate(@Req() req: { user: { id: string } }, @Body() dto: GenerateFilmDto) {
    return this.films.generateFilm(req.user.id, dto.projectId);
  }
}
