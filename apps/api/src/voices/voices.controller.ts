import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { VoicesService } from "./voices.service";

type Authed = { user: { id: string } };

/** The frozen Voice API (Part 4 §173, docs/51). Every write returns 202 with a job. */
@Controller("v1")
@UseGuards(JwtAuthGuard)
export class VoicesController {
  constructor(private readonly voices: VoicesService) {}

  @Post("voices")
  @HttpCode(202)
  enroll(@Req() req: Authed, @Body() body: unknown) {
    return this.voices.api.enroll(req.user.id, body);
  }

  @Get("voices/:id")
  getVoice(@Req() req: Authed, @Param("id") id: string) {
    return this.voices.api.getVoice(req.user.id, id);
  }

  @Delete("voices/:id")
  deleteVoice(@Req() req: Authed, @Param("id") id: string) {
    return this.voices.api.deleteVoice(req.user.id, id);
  }

  @Post("speech")
  @HttpCode(202)
  speech(@Req() req: Authed, @Body() body: unknown) {
    return this.voices.api.speech(req.user.id, body);
  }

  @Post("speech/batch")
  @HttpCode(202)
  batch(@Req() req: Authed, @Body() body: unknown) {
    return this.voices.api.batch(req.user.id, body);
  }

  @Get("jobs/:id")
  getJob(@Req() req: Authed, @Param("id") id: string) {
    return this.voices.api.getJob(req.user.id, id);
  }
}
