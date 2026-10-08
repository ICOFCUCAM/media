/**
 * Audio processor — consumes `audio-queue` (voice / music / sfx).
 *
 * Voice: synthesized with OpenAI TTS (tts-1, voice "onyx") from the scene's
 * dialogue/narration, uploaded to storage.
 * Music: the film's score — composed once, on the opening scene, by a fal
 * text-to-music model (FAL_MUSIC_MODEL, default Stable Audio) from the brief
 * and every scene's style and mood; the render engine loops it under the cut.
 * SFX: no generator yet (not enqueued). Every path is resume-safe.
 *
 * No silent degradation (DirectorOS DOS-75): when a track the film should have
 * cannot be made — no provider configured, or the provider failed on the last
 * attempt — no phantom track row is written (the render downloads every
 * recorded key), and a TRACK_MISSING degradation is recorded and shown.
 */
import { Worker } from "bullmq";
import { QUEUES, degradation, type AudioJob } from "@cineforge/shared";
import { recordDegradations, type DegradationDb } from "../truth/recorder";
import { buildOpenAIProviders, falRunQueue, falFindUrl } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { S3Storage } from "../storage/storage";
import { buildScorePrompt, scoreSeconds, SCORE_MODEL } from "../audio/score";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const KIND = { voice: "VOICE", music: "MUSIC", sfx: "SFX" } as const;
const storage = new S3Storage();

const trackMissing = (projectId: string, scope: "scene" | "film", message: string, detail: Record<string, unknown>, refId?: string) =>
  recordDegradations(prisma as unknown as DegradationDb, projectId, [degradation("TRACK_MISSING", scope, message, { refId, detail })]);

export const audioWorker = new Worker<AudioJob>(
  QUEUES.audio,
  async (job) => {
    const { sceneId, kind, projectId } = job.data;
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

    // Idempotent (resume-safe, docs/24 §C8): don't regenerate an existing track.
    const existing = await prisma.audioTrack.findFirst({
      where: { sceneId, kind: KIND[kind] },
      select: { id: true, key: true },
    });
    if (existing) return { sceneId, kind, key: existing.key, skipped: true };

    // ── Voice: real narration via OpenAI TTS ────────────────────────────
    if (kind === "voice") {
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
      if (!text) return { sceneId, kind, skipped: "nothing to speak" };
      const key = `scenes/${sceneId}/audio/voice/${job.id}.mp3`;
      const { tts } = process.env.S3_BUCKET
        ? buildOpenAIProviders(process.env, (bytes, ct) => storage.putBytes(key, bytes, ct))
        : { tts: undefined };
      const label = `Scene ${(scene?.index ?? 0) + 1}`;
      if (!tts) {
        await trackMissing(projectId, "scene", `${label} has no narration: no voice provider is configured.`, { track: "voice" }, sceneId);
        return { sceneId, kind, skipped: "no provider configured" };
      }
      try {
        const { audioKey } = await tts.synthesize({ text });
        await prisma.audioTrack.create({
          data: { sceneId, kind: "VOICE", key: audioKey, meta: { provider: "openai-tts", voice: process.env.OPENAI_TTS_VOICE ?? "onyx" } },
        });
        return { sceneId, kind, key: audioKey, provider: "openai-tts" };
      } catch (e) {
        if (!lastAttempt) throw e; // retry first
        const reason = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        await trackMissing(projectId, "scene", `${label} has no narration: the voice provider failed.`, { track: "voice", error: reason }, sceneId);
        return { sceneId, kind, skipped: "voice generation failed" };
      }
    }

    // ── Music: the film's score, composed on the opening scene ─────────
    if (kind === "music") {
      const scene = await prisma.scene.findUnique({ where: { id: sceneId }, select: { index: true, projectId: true } });
      if (!scene) return { sceneId, kind, skipped: "scene gone" };
      // One score per film: the render engine uses a single music bed.
      const first = await prisma.scene.findFirst({ where: { projectId: scene.projectId }, orderBy: { index: "asc" }, select: { id: true } });
      if (first?.id !== sceneId) return { sceneId, kind, skipped: "the film score is composed on the opening scene" };
      if (!process.env.FAL_KEY || !process.env.S3_BUCKET) {
        await trackMissing(projectId, "film", "This film has no music: no music provider is configured.", { track: "music" });
        return { sceneId, kind, skipped: "no provider configured" };
      }
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
        if (!lastAttempt) throw e; // retry first
        const reason = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        console.warn(`[audio] score failed for scene ${sceneId}:`, reason);
        await trackMissing(projectId, "film", "This film has no music: the music provider failed.", { track: "music", error: reason });
        return { sceneId, kind, skipped: "score generation failed" };
      }
    }

    // ── SFX: no generator exists (capability `sfx_generation` is
    // not_implemented, so the flow does not enqueue it). Never a phantom row.
    return { sceneId, kind, skipped: "no generator" };
  },
  { connection, concurrency: 8 },
);
