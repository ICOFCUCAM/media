/**
 * Voice Lab processor (docs/29 phase 2; W15) — consumes `voice-lab-queue`.
 *
 * speak:  a Voice Studio reading — narrator, presenter or a conversation of
 *         up to four voices — on the Voice Engine (voice/reading.ts): routed
 *         through the gates and the licence registry, spoken through the
 *         cached, metered engine, mastered and joined. The processor never
 *         calls a speech provider itself (Part 4 §174). A community voice
 *         speaks only for a user holding a licence to it (§170).
 * avatar: a portrait animated to a finished reading by the talking-avatar
 *         provider (lip-synced video).
 *
 * Voices are enrolled by the Voice Engine (voice.enroll jobs), not here.
 * Both ops are claimed by the project poller (PENDING → working states), so
 * the web only ever writes rows — the same producer/consumer split as films.
 */
import { Worker } from "bullmq";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUEUES, type VoiceLabJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import type { VoiceEngineArtifact } from "@cineforge/voice-contracts";
import { falUploadBytes, falRunQueue, falFindUrl } from "@cineforge/model-adapters";
import { S3Storage } from "../storage/storage";
import { ffmpeg } from "../ffmpeg/ffmpeg";
import { meter, meteredEngine } from "../billing";
import { voiceEngine } from "../voice/engines";
import { cachedEngine, prismaSpeechCache, speechCacheEnabled } from "../voice/cache";
import { joinSegments, masterSegment, measureSpeech } from "../voice/mastering";
import { ReadingError, renderReading, type ReadingDeps } from "../voice/reading";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const storage = new S3Storage();

/** Talking-avatar models: portrait image + speech audio -> lip-synced video.
 *  standard = cheap (~20-40x less than premium), premium = higher fidelity. */
const AVATAR_MODEL_STD = process.env.FAL_AVATAR_MODEL_STD ?? "fal-ai/sadtalker";
const AVATAR_MODEL_PREMIUM = process.env.FAL_AVATAR_MODEL ?? "fal-ai/kling-video/v1/standard/ai-avatar";

/** Production wiring of a reading: the owner pays for what is generated; cache hits are free. */
export function readingDeps(userId: string): ReadingDeps {
  return {
    env: process.env,
    engine: (id) => {
      const e = voiceEngine(id, process.env);
      if (!e) return null;
      const metered = meteredEngine(e, { userId }, meter);
      return speechCacheEnabled() ? cachedEngine(metered, prismaSpeechCache(prisma as never, storage)) : metered;
    },
    voice: (id) => prisma.voice.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, shareStatus: true, consentType: true, consentConfirmedAt: true, provider: true, providerVoiceId: true },
    }),
    licensed: async (voiceId, licenseeId) =>
      !!(await prisma.voiceLicence.findFirst({ where: { voiceId, licenseeId, revokedAt: null }, select: { id: true } })),
    artifact: async (voiceId, engineId, engineVersion) => {
      const a = await prisma.voiceEngineArtifact.findUnique({ where: { voiceId_engineId_engineVersion: { voiceId, engineId, engineVersion } } });
      return a && ({ artifactType: a.artifactType, uri: a.artifactUri } as VoiceEngineArtifact);
    },
    master: masterSegment,
    join: joinSegments,
    measure: measureSpeech,
    encodeMp3: async (wav, mp3) => { await ffmpeg(["-y", "-i", wav, "-c:a", "libmp3lame", "-q:a", "2", mp3]); },
    upload: (path, key, type) => storage.upload(path, key, type),
  };
}

export const voiceLabWorker = new Worker<VoiceLabJob>(
  QUEUES.voiceLab,
  async (job) => {
    const { kind, id } = job.data;

    if (kind === "avatar") {
      const av = await prisma.avatarVideo.findUniqueOrThrow({ where: { id } });
      try {
        const apiKey = process.env.FAL_KEY;
        if (!apiKey) throw new Error("FAL_KEY not configured — talking avatars need the avatar provider");
        const vo = av.voiceoverId ? await prisma.voiceover.findUnique({ where: { id: av.voiceoverId } }) : null;
        if (!vo?.audioKey) throw new Error("pick a READY voiceover first (the avatar reads its audio)");
        // Cost guardrail: avatar video is the priciest unit on the platform
        // (fal bills per second of lip-synced video). Cap the speech length;
        // ~15 chars/sec spoken -> 900 chars ≈ 60s. AVATAR_MAX_CHARS overrides.
        const maxChars = Number(process.env.AVATAR_MAX_CHARS ?? 900);
        if (vo.text.length > maxChars)
          throw new Error(`speech too long for an avatar video (${vo.text.length} chars > ${maxChars} ≈ 60s) — split it or raise AVATAR_MAX_CHARS`);
        // Daily volume guard per user (default 10/day) — a runaway client
        // can't burn the fal balance.
        const dayAgo = new Date(Date.now() - 24 * 3600_000);
        const today = await prisma.avatarVideo.count({ where: { userId: av.userId, createdAt: { gte: dayAgo }, status: { in: ["READY", "RENDERING"] } } });
        const maxPerDay = Number(process.env.AVATAR_MAX_PER_DAY ?? 10);
        if (today > maxPerDay) throw new Error(`daily avatar limit reached (${maxPerDay}/day) — try again tomorrow or contact support`);
        // Ship both assets to fal's CDN, then animate.
        const img = await storage.getBytes(av.imageKey);
        const imgExt = av.imageKey.split(".").pop()?.toLowerCase();
        const imgUrl = await falUploadBytes(apiKey, img, imgExt === "png" ? "image/png" : "image/jpeg", `portrait.${imgExt ?? "jpg"}`);
        const audio = await storage.getBytes(vo.audioKey);
        const audioUrl = await falUploadBytes(apiKey, audio, "audio/mpeg", "speech.mp3");
        const avatarModel = av.quality === "premium" ? AVATAR_MODEL_PREMIUM : AVATAR_MODEL_STD;
        // SadTalker uses source_image_url/driven_audio_url; Kling uses image_url/audio_url.
        // Send both spellings — fal models ignore unknown fields.
        const result = await falRunQueue(
          apiKey,
          avatarModel,
          { image_url: imgUrl, audio_url: audioUrl, source_image_url: imgUrl, driven_audio_url: audioUrl },
          { timeoutMs: 20 * 60_000 },
        );
        await meter({ kind: "video", provider: "fal", model: avatarModel, unit: "requests", units: 1, userId: av.userId, meta: { purpose: "avatar", seconds: Math.round(vo.text.length / 15) } });
        const url = falFindUrl(result);
        if (!url) throw new Error(`avatar model returned no video (${JSON.stringify(result).slice(0, 200)})`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`avatar video download ${res.status}`);
        const videoKey = `avatars/${av.userId}/${av.id}.mp4`;
        await storage.putBytes(videoKey, new Uint8Array(await res.arrayBuffer()), "video/mp4");
        await prisma.avatarVideo.update({ where: { id }, data: { videoKey, status: "READY", errorMessage: null } });
        console.log(`[voice-lab] avatar video ${id} ready`);
        return { id, videoKey };
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
        await prisma.avatarVideo.update({ where: { id }, data: { status: "FAILED", errorMessage: msg } });
        throw e;
      }
    }

    // kind === "speak": a reading on the Voice Engine (W15).
    const vo = await prisma.voiceover.findUniqueOrThrow({ where: { id } });
    const dir = await mkdtemp(join(tmpdir(), "vo-"));
    try {
      const out = await renderReading(
        { id: vo.id, userId: vo.userId, voiceId: vo.voiceId, text: vo.text, language: vo.language, mode: vo.mode, style: vo.style, speakers: vo.speakers },
        dir,
        readingDeps(vo.userId),
      );
      await prisma.voiceover.update({
        where: { id },
        data: { audioKey: out.audioKey, durationMs: out.durationMs, engine: out.engines.join(","), status: "READY", errorMessage: null },
      });
      console.log(`[voice-lab] voiceover ${id} ready (${out.parts} parts, ${out.segments} segments, ${vo.mode}, ${vo.language})`);
      return { id, audioKey: out.audioKey, parts: out.parts, segments: out.segments };
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      // A refusal is final; a provider failure retries first.
      const last = e instanceof ReadingError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (last) await prisma.voiceover.update({ where: { id }, data: { status: "FAILED", errorMessage: msg } });
      if (e instanceof ReadingError) return { id, refused: msg };
      throw e;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  { connection, concurrency: 2 },
);
