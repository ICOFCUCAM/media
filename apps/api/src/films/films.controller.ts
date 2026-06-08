import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FilmsService } from "./films.service";

class GenerateFilmDto {
  projectId!: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class FilmsController {
  constructor(private readonly films: FilmsService) {}

  /** POST /generate-film — starts the GPU on demand, then enqueues the film. */
  @Post("generate-film")
  generate(@Req() req: { user: { id: string } }, @Body() dto: GenerateFilmDto) {
    return this.films.generateFilm(req.user.id, dto.projectId);
  }
}
