/**
 * Audio processor — consumes `audio-queue` (voice / music / sfx).
 *
 * Voice: synthesized with OpenAI TTS (tts-1, voice "onyx") from the scene's
 * dialogue/narration, uploaded to storage. Music/SFX remain stubs until the
 * GPU MusicGen/AudioGen adapters land (docs/11). All paths are resume-safe and
 * degrade to a stub row when OPENAI_API_KEY / S3 aren't configured.
 */
import { Worker } from "bullmq";
import { QUEUES, type AudioJob } from "@cineforge/shared";
import { buildOpenAIProviders } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { S3Storage } from "../storage/storage";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const KIND = { voice: "VOICE", music: "MUSIC", sfx: "SFX" } as const;
const storage = new S3Storage();

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

    // ── Voice: real narration via OpenAI TTS ────────────────────────────
    if (kind === "voice" && process.env.OPENAI_API_KEY && process.env.S3_BUCKET) {
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
        include: { dialogueLines: { orderBy: { index: "asc" } } },
      });
      const fromLines = scene?.dialogueLines.map((d) => d.text).join(" ") ?? "";
      // Director-created scenes use dialogue_lines; web scenes use the text columns.
      const text = (fromLines || [scene?.dialogue, scene?.narration].filter(Boolean).join(" ") || scene?.summary || "").trim();
      if (text) {
        const key = `scenes/${sceneId}/audio/voice/${job.id}.mp3`;
        const { tts } = buildOpenAIProviders(process.env, (bytes, ct) => storage.putBytes(key, bytes, ct));
        if (tts) {
          const { audioKey } = await tts.synthesize({ text });
          await prisma.audioTrack.create({
            data: { sceneId, kind: "VOICE", key: audioKey, meta: { provider: "openai-tts", voice: process.env.OPENAI_TTS_VOICE ?? "onyx" } },
          });
          return { sceneId, kind, key: audioKey, provider: "openai-tts" };
        }
      }
    }

    // ── Music / SFX (and unconfigured voice): no generator available. Do NOT
    // write a phantom track row — the render engine downloads every recorded
    // key, and a key with no object behind it fails the whole final assembly
    // ("Object not found"). The film simply renders without this track.
    return { sceneId, kind, skipped: "no provider configured" };
  },
  { connection, concurrency: 8 },
);
