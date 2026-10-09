import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { Prisma, prisma } from "@cineforge/db";
import { QUEUES, type VoiceEngineJob } from "@cineforge/shared";
import { VoiceApi, type VoiceStore } from "./voice-api";

const ACTIVE = ["queued", "claimed", "loading_model", "generating", "post_processing"];

/** Prisma-backed store for the Voice API. */
export const prismaVoiceStore: VoiceStore = {
  async createVoice(v) {
    // CLONING, not PENDING: the Voice Engine job enrolls it, the legacy poller path must not.
    return prisma.voice.create({ data: { ...v, status: "CLONING" }, select: { id: true } });
  },
  voice: (id) =>
    prisma.voice.findUnique({
      where: { id },
      select: { id: true, userId: true, name: true, status: true, language: true, quality: true, consentType: true, consentConfirmedAt: true, errorMessage: true, createdAt: true },
    }),
  async deleteVoice(id) {
    await prisma.voice.delete({ where: { id }, select: { id: true } });
  },
  createJob: (j) => prisma.voiceJob.create({ data: { ...j, payload: j.payload as Prisma.InputJsonValue }, select: { id: true } }),
  job: (id) =>
    prisma.voiceJob.findUnique({
      where: { id },
      select: { id: true, userId: true, type: true, status: true, result: true, error: true, createdAt: true, completedAt: true },
    }),
  activeJobs: (userId) => prisma.voiceJob.count({ where: { userId, status: { in: ACTIVE } } }),
};

@Injectable()
export class VoicesService {
  private readonly queue = new Queue<VoiceEngineJob>(QUEUES.voiceEngine, {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
  });
  readonly api = new VoiceApi({
    store: prismaVoiceStore,
    env: process.env,
    enqueue: async (jobId, type) => {
      await this.queue.add(type, { jobId }, { jobId: `voice-job-${jobId}`, removeOnComplete: 100 });
    },
  });
}
