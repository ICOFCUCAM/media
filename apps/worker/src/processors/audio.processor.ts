/**
 * Audio processor — consumes `audio-queue` (voice / music / sfx).
 *
 * Voice: the scene's voice-over and dialogue on the Voice Engine (W7b,
 * docs/51 §6) — each character in the voice the owner chose for them or a
 * distinct built-in voice, mastered, each line's audio and start recorded.
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
import type { VoiceEngineArtifact } from "@cineforge/voice-contracts";
import { QUEUES, degradation, type AudioJob } from "@cineforge/shared";
import { recordDegradations, type DegradationDb } from "../truth/recorder";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { falRunQueue, falFindUrl } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { S3Storage } from "../storage/storage";
import { buildScorePrompt, scoreSeconds, SCORE_MODEL } from "../audio/score";
import { chosenVoiceId, NoVoiceEngineError, renderSceneVoice, type SceneVoiceDeps } from "../voice/film";
import { voiceEngine } from "../voice/engines";
import { joinSegments, masterSegment, measureSpeech } from "../voice/mastering";

function sceneVoiceDeps(): SceneVoiceDeps {
  return {
    env: process.env,
    engine: (id) => voiceEngine(id, process.env),
    voice: (id) => prisma.voice.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, consentType: true, consentConfirmedAt: true, provider: true, providerVoiceId: true },
    }),
    artifact: async (voiceId, engineId, engineVersion) => {
      const a = await prisma.voiceEngineArtifact.findUnique({ where: { voiceId_engineId_engineVersion: { voiceId, engineId, engineVersion } } });
      return a && ({ artifactType: a.artifactType, uri: a.artifactUri } as VoiceEngineArtifact);
    },
    master: masterSegment,
    join: joinSegments,
    measure: measureSpeech,
    upload: (path, key, type) => storage.upload(path, key, type),
  };
}

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

    // ── Voice: the scene's narration and dialogue on the Voice Engine (W7b) ─
    if (kind === "voice") {
      const scene = await prisma.scene.findUnique({
        where: { id: sceneId },
        include: { dialogueLines: { orderBy: { index: "asc" } } },
      });
      if (!scene) return { sceneId, kind, skipped: "scene gone" };
      const label = `Scene ${scene.index + 1}`;
      if (!process.env.S3_BUCKET) {
        await trackMissing(projectId, "scene", `${label} has no voice track: storage is not configured.`, { track: "voice" }, sceneId);
        return { sceneId, kind, skipped: "no storage" };
      }
      const [project, cast] = await Promise.all([
        prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } }),
        prisma.character.findMany({ where: { projectId }, orderBy: { name: "asc" }, select: { id: true, voiceProfile: true } }),
      ]);
      const chosenVoices = Object.fromEntries(cast.map((c) => [c.id, chosenVoiceId(c.voiceProfile)]));
      const dir = await mkdtemp(join(tmpdir(), "cf-scene-voice-"));
      try {
        const out = await renderSceneVoice(
          {
            scene: {
              id: scene.id, narration: scene.narration, dialogue: scene.dialogue, summary: scene.summary,
              lines: scene.dialogueLines.map((l) => ({ id: l.id, characterId: l.characterId, text: l.text, emotion: l.emotion })),
            },
            language: "en",
            ownerId: project?.userId ?? "",
            castOrder: cast.map((c) => c.id),
            chosenVoices,
            trackKey: `scenes/${sceneId}/audio/voice/${job.id}.wav`,
            dir,
          },
          sceneVoiceDeps(),
        );
        if (!out) return { sceneId, kind, skipped: "nothing to speak" };
        for (const c of out.cues) {
          if (c.lineId) await prisma.dialogueLine.update({ where: { id: c.lineId }, data: { audioKey: c.audioKey, startMs: c.startMs }, select: { id: true } });
        }
        await prisma.audioTrack.create({
          data: {
            sceneId, kind: "VOICE", key: out.trackKey, durationMs: Math.round(out.durationSec * 1000),
            meta: { provider: "voice-engine", engine: out.engine, loudnessLufs: out.loudnessLufs, cues: out.cues.map((c) => ({ lineId: c.lineId, characterId: c.characterId, voice: c.voice, startMs: c.startMs, durationMs: c.durationMs })) },
          },
        });
        if (out.substitutions.length) {
          const names = new Map((await prisma.character.findMany({ where: { id: { in: out.substitutions.map((x) => x.characterId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
          await recordDegradations(prisma as unknown as DegradationDb, projectId, out.substitutions.map((x) =>
            degradation("VOICE_SUBSTITUTED", "scene", `${label}: ${names.get(x.characterId) ?? "a character"} spoke in a built-in voice — ${x.reason}.`, { refId: sceneId, detail: { characterId: x.characterId, reason: x.reason } })));
        }
        return { sceneId, kind, key: out.trackKey, engine: out.engine, cues: out.cues.length };
      } catch (e) {
        if (e instanceof NoVoiceEngineError) {
          await trackMissing(projectId, "scene", `${label} has no voice track: no voice engine is configured.`, { track: "voice", engines: e.message }, sceneId);
          return { sceneId, kind, skipped: "no voice engine" };
        }
        if (!lastAttempt) throw e; // retry first
        const reason = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        await trackMissing(projectId, "scene", `${label} has no voice track: the voice engine failed.`, { track: "voice", error: reason }, sceneId);
        return { sceneId, kind, skipped: "voice generation failed" };
      } finally {
        await rm(dir, { recursive: true, force: true });
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
