/**
 * Audio processor — consumes `audio-queue` (voice / music / sfx). This is a
 * stub that records an AudioTrack row so the flow can complete; the real
 * implementation calls the audio adapters in docs/11 (XTTS/ElevenLabs for
 * voice, MusicGen for music, AudioGen/library for sfx) and uploads to S3.
 *
 * Music/SFX generation is GPU-backed (MusicGen/AudioGen), which is why this
 * queue is counted by the GPU lifecycle ActiveJobTracker (docs/23).
 */
import { Worker } from "bullmq";
import { QUEUES, type AudioJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

const KIND = { voice: "VOICE", music: "MUSIC", sfx: "SFX" } as const;

export const audioWorker = new Worker<AudioJob>(
  QUEUES.audio,
  async (job) => {
    const { sceneId, kind } = job.data;

    // Idempotent (resume-safe, docs/24 §C8): don't regenerate an existing track.
    const existing = await prisma.audioTrack.findFirst({
      where: { sceneId, kind: KIND[kind] },
      select: { id: true, key: true },
    });
    if (existing) return { sceneId, kind, key: existing.key, skipped: true };

    // TODO: call the matching audio adapter and upload the result to S3.
    const key = `scenes/${sceneId}/audio/${kind}/${job.id}.mp3`;
    await prisma.audioTrack.create({
      data: { sceneId, kind: KIND[kind], key, meta: { generated: "stub" } },
    });

    return { sceneId, kind, key };
  },
  { connection, concurrency: 8 },
);
