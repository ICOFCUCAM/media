/**
 * Voice Engine processor (W7a, docs/51) — consumes `voice-engine-queue`.
 * One BullMQ job per voice_jobs row; the eight-state flow lives in
 * voice/jobs.ts. The /v1 API enqueues; the project poller re-enqueues any job
 * still `queued` after a minute (a lost enqueue never strands a job).
 */
import { Worker } from "bullmq";
import { Prisma, prisma } from "@cineforge/db";
import { QUEUES, type VoiceEngineJob } from "@cineforge/shared";
import type { VoiceEngineArtifact, VoiceJobState, VoiceJobType } from "@cineforge/voice-contracts";
import { S3Storage } from "../storage/storage";
import { analyzeVoiceSample } from "../voice/analyze";
import { voiceEngine } from "../voice/engines";
import { runVoiceJob, type VoiceJobDeps } from "../voice/jobs";
import { joinSegments, masterSegment, measureSpeech } from "../voice/mastering";
import { meter, meteredEngine } from "../billing";
import { cachedEngine, prismaSpeechCache, speechCacheEnabled } from "../voice/cache";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const storage = new S3Storage();

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** `userId` is the job owner, who pays for the speech (W11 metering). */
export function prismaVoiceJobDeps(onProgress?: (p: number) => Promise<void>, userId?: string | null): VoiceJobDeps {
  return {
    env: process.env,
    db: {
      async job(id) {
        const j = await prisma.voiceJob.findUnique({ where: { id } });
        return j && { id: j.id, userId: j.userId, voiceId: j.voiceId, type: j.type as VoiceJobType, status: j.status as VoiceJobState, payload: (j.payload ?? {}) as Record<string, unknown> };
      },
      async setJob(id, d) {
        await prisma.voiceJob.update({
          where: { id },
          data: { status: d.status, engine: d.engine, error: d.error, startedAt: d.startedAt, completedAt: d.completedAt, ...(d.result ? { result: json(d.result) } : {}) },
          select: { id: true },
        });
      },
      async voice(id) {
        return prisma.voice.findUnique({
          where: { id },
          select: { id: true, userId: true, status: true, sampleKey: true, language: true, consentType: true, consentConfirmedAt: true, provider: true, providerVoiceId: true },
        });
      },
      async setVoice(id, d) {
        const { quality, ...rest } = d;
        await prisma.voice.update({ where: { id }, data: { ...rest, ...(quality ? { quality: json(quality) } : {}) }, select: { id: true } });
      },
      async artifact(voiceId, engineId, engineVersion) {
        const a = await prisma.voiceEngineArtifact.findUnique({ where: { voiceId_engineId_engineVersion: { voiceId, engineId, engineVersion } } });
        return a && ({ artifactType: a.artifactType, uri: a.artifactUri, metadata: a.metadata as Record<string, unknown> } as VoiceEngineArtifact);
      },
      async saveArtifacts(voiceId, engineId, engineVersion, artifacts) {
        // One artifact per voice × engine × version: the primary one (first) is kept.
        const a = artifacts[0]!;
        const data = { artifactType: a.artifactType, artifactUri: a.uri, metadata: json(a.metadata ?? {}) };
        await prisma.voiceEngineArtifact.upsert({
          where: { voiceId_engineId_engineVersion: { voiceId, engineId, engineVersion } },
          create: { voiceId, engineId, engineVersion, ...data },
          update: data,
          select: { id: true },
        });
      },
    },
    engine: (id) => {
      const e = voiceEngine(id, process.env);
      if (!e) return null;
      const metered = meteredEngine(e, { userId }, meter);
      return speechCacheEnabled() ? cachedEngine(metered, prismaSpeechCache(prisma as never, storage)) : metered;
    },
    download: (key, dest) => storage.download(key, dest),
    upload: (path, key, type) => storage.upload(path, key, type),
    analyze: analyzeVoiceSample,
    master: masterSegment,
    join: joinSegments,
    measure: measureSpeech,
    progress: onProgress,
  };
}

export const voiceEngineWorker = new Worker<VoiceEngineJob>(
  QUEUES.voiceEngine,
  async (job) => {
    const owner = await prisma.voiceJob.findUnique({ where: { id: job.data.jobId }, select: { userId: true } });
    const out = await runVoiceJob(job.data.jobId, prismaVoiceJobDeps((p) => job.updateProgress(p), owner?.userId));
    console.log(`[voice-engine] job ${job.data.jobId} ${out.status}`);
    return out;
  },
  { connection, concurrency: Number(process.env.VOICE_ENGINE_CONCURRENCY ?? 2) },
);
