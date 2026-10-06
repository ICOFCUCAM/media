/**
 * Audio processor — consumes `audio-queue` (voice / music / sfx).
 *
 * Voice: synthesized with OpenAI TTS (tts-1, voice "onyx") from the scene's
 * dialogue/narration, uploaded to storage.
 * Music: the film's score — composed once, on the opening scene, by a fal
 * text-to-music model (FAL_MUSIC_MODEL, default Stable Audio) from the brief
 * and every scene's style and mood; the render engine loops it under the cut.
 * SFX: no generator yet. Every path is resume-safe, and nothing is recorded
 * when a provider isn't configured or fails (the film renders without it).
 */
import { Worker } from "bullmq";
import { QUEUES, type AudioJob } from "@cineforge/shared";
import { buildOpenAIProviders, falRunQueue, falFindUrl } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { S3Storage } from "../storage/storage";
import { buildScorePrompt, scoreSeconds, SCORE_MODEL } from "../audio/score";

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
      // Speak, in order of preference: character dialogue, then the Director's
      // story VOICEOVER (narration). scene.summary is a VISUAL description — only
      // a last resort, since reading it aloud describes the picture instead of
      // telling the story (the bug a narrated trailer exposed).
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

    // ── Music: the film's score, composed on the opening scene ─────────
    if (kind === "music" && process.env.FAL_KEY && process.env.S3_BUCKET) {
      const scene = await prisma.scene.findUnique({ where: { id: sceneId }, select: { index: true, projectId: true } });
      if (!scene) return { sceneId, kind, skipped: "scene gone" };
      // One score per film: the render engine uses a single music bed.
      const first = await prisma.scene.findFirst({ where: { projectId: scene.projectId }, orderBy: { index: "asc" }, select: { id: true } });
      if (first?.id !== sceneId) return { sceneId, kind, skipped: "the film score is composed on the opening scene" };
      try {
        const [project, scenes, planned] = await Promise.all([
          prisma.project.findUnique({ where: { id: scene.projectId }, select: { prompt: true, targetSeconds: true } }),
          prisma.scene.findMany({ where: { projectId: scene.projectId }, select: { music: true, mood: true } }),
          prisma.shot.aggregate({ where: { scene: { projectId: scene.projectId } }, _sum: { durationSec: true } }),
        ]);
        const filmSec = planned._sum.durationSec || project?.targetSeconds || 30;
        const prompt = buildScorePrompt(project?.prompt ?? "", scenes);
        const seconds = scoreSeconds(filmSec);
        console.log(`[audio] composing score project=${scene.projectId} model=${SCORE_MODEL} ${seconds}s`);
        const result = await falRunQueue(process.env.FAL_KEY, SCORE_MODEL, { prompt, seconds_total: seconds }, { timeoutMs: 8 * 60_000 });
        const url = falFindUrl(result);
        if (!url) throw new Error(`music model returned no audio (${JSON.stringify(result).slice(0, 200)})`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`score download ${res.status}`);
        const contentType = res.headers.get("content-type") ?? "audio/wav";
        const ext = contentType.includes("mpeg") ? "mp3" : contentType.includes("ogg") ? "ogg" : "wav";
        const key = `scenes/${sceneId}/audio/music/score.${ext}`;
        await storage.putBytes(key, new Uint8Array(await res.arrayBuffer()), contentType);
        await prisma.audioTrack.create({
          data: { sceneId, kind: "MUSIC", key, meta: { provider: "fal", model: SCORE_MODEL, seconds, prompt } },
        });
        return { sceneId, kind, key, provider: "fal" };
      } catch (e) {
        // An enhancement: the film still renders (narration only) without it.
        console.warn(`[audio] score failed for scene ${sceneId}:`, e instanceof Error ? e.message : e);
        return { sceneId, kind, skipped: "score generation failed" };
      }
    }

    // ── SFX (and unconfigured voice / music): no generator available. Do NOT
    // write a phantom track row — the render engine downloads every recorded
    // key, and a key with no object behind it fails the whole final assembly
    // ("Object not found"). The film simply renders without this track.
    return { sceneId, kind, skipped: "no provider configured" };
  },
  { connection, concurrency: 8 },
);
