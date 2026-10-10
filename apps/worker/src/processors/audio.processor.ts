/**
 * Audio processor — consumes `audio-queue` (voice / music / sfx).
 *
 * Voice: the scene's voice-over and dialogue on the Voice Engine (W7b,
 * docs/51 §6) — each character in the voice the owner chose for them or a
 * distinct built-in voice, mastered, each line's audio and start recorded.
 * Music: the film's score — composed once, on the opening scene, by a fal
 * text-to-music model (FAL_MUSIC_MODEL, default Stable Audio) from the brief
 * and every scene's style and mood; the render engine loops it under the cut.
 * Ambience + SFX (W16): the scene's planned soundscape and effects from a
 * text-to-audio model (FAL_SOUND_MODEL, default the score model), stored
 * content-addressed so the same sound is generated once; each effect anchored
 * to its shot. Every path is resume-safe.
 *
 * No silent degradation (DirectorOS DOS-75): when a track the film should have
 * cannot be made — no provider configured, or the provider failed on the last
 * attempt — no phantom track row is written (the render downloads every
 * recorded key), and a TRACK_MISSING degradation is recorded and shown.
 */
import { hasFilmPackage, type CanonDb } from "../canon/revision";
import { Worker } from "bullmq";
import { QUEUES, degradation, type AudioJob } from "@cineforge/shared";
import { recordVersion, type VersionDb } from "../versions/record";
import { recordDegradations, type DegradationDb } from "../truth/recorder";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { falRunQueue, falFindUrl } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { S3Storage } from "../storage/storage";
import { buildScorePrompt, scoreSeconds, SCORE_MODEL } from "../audio/score";
import { chosenVoiceId, NoVoiceEngineError, renderSceneVoice } from "../voice/film";
import { voiceTraits } from "@cineforge/voice-contracts";
import { speechLedgerRows } from "../voice/ledger";
import { sceneVoiceDeps } from "../voice/deps";
import { meter } from "../billing";
import { FilmPackage, sceneSoundPlan, type SceneSoundPlan } from "@cineforge/movie";
import { ambienceRow, renderSound, sfxRow, SOUND_MODEL, type SoundDeps, type SoundTrackRow } from "../audio/sound";


const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const KIND = { voice: "VOICE", music: "MUSIC", sfx: "SFX", ambience: "AMBIENCE" } as const;
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
      const [project, cast, planned] = await Promise.all([
        prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } }),
        prisma.character.findMany({ where: { projectId }, orderBy: { name: "asc" }, select: { id: true, voiceProfile: true } }),
        hasFilmPackage(prisma as unknown as CanonDb, projectId),
      ]);
      const chosenVoices = Object.fromEntries(cast.map((c) => [c.id, chosenVoiceId(c.voiceProfile)]));
      const traits = Object.fromEntries(cast.map((c) => [c.id, voiceTraits(c.voiceProfile)]));
      const dir = await mkdtemp(join(tmpdir(), "cf-scene-voice-"));
      try {
        const out = await renderSceneVoice(
          {
            scene: {
              id: scene.id, narration: scene.narration, dialogue: scene.dialogue, summary: scene.summary, planned,
              lines: scene.dialogueLines.map((l) => ({ id: l.id, characterId: l.characterId, text: l.text, emotion: l.emotion })),
            },
            language: "en",
            ownerId: project?.userId ?? "",
            castOrder: cast.map((c) => c.id),
            chosenVoices,
            traits,
            trackKey: `scenes/${sceneId}/audio/voice/${job.id}.wav`,
            dir,
          },
          sceneVoiceDeps(storage, { projectId }),
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
        // The speech ledger (§149): each spoken part on the Master Clock. Never blocks the track.
        try {
          const before = await prisma.scene.aggregate({ where: { projectId, index: { lt: scene.index } }, _sum: { durationSec: true } });
          const rows = speechLedgerRows(
            { projectId, sceneId, sceneStartSec: Number(before._sum.durationSec ?? 0), language: "en", trackKey: out.trackKey },
            out.cues,
          );
          if (rows.length) await prisma.audioGeneration.createMany({ data: rows.map((r) => ({ ...r, meta: r.meta as object })) });
        } catch (e) {
          console.warn(`[audio] speech ledger skipped for scene ${sceneId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        await recordVersion(prisma as unknown as VersionDb, {
          projectId, assetType: "audio", assetId: sceneId, storageKey: out.trackKey, durationSec: out.durationSec,
          derivation: { role: "scene_voice", engine: out.engine, loudnessLufs: out.loudnessLufs, cues: out.cues.length, substituted: out.substitutions.length },
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
        await meter({ kind: "music", provider: "fal", model: SCORE_MODEL, unit: "audio_seconds", units: seconds, projectId: scene.projectId, meta: { purpose: "score" } });
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

    // ── Ambience + SFX: the scene's sound design (W16; Part 1 §18) ─────
    const scene = await prisma.scene.findUnique({ where: { id: sceneId }, select: { index: true, projectId: true } });
    if (!scene) return { sceneId, kind, skipped: "scene gone" };
    const label = `Scene ${scene.index + 1}`;
    const plan = await soundPlanFor(scene.projectId, scene.index);
    if (!plan) return { sceneId, kind, skipped: "no film plan" };
    const wanted = kind === "ambience" ? (plan.ambience ? 1 : 0) : plan.sfx.length;
    if (!wanted) return { sceneId, kind, skipped: "nothing planned" };
    if (!process.env.FAL_KEY || !process.env.S3_BUCKET) {
      // One film-level note, from the opening scene, not one per scene.
      if (scene.index === 0) await trackMissing(projectId, "film", "This film has no sound design (ambience and effects): no sound provider is configured.", { track: kind === "ambience" ? "ambience" : "sfx" });
      return { sceneId, kind, skipped: "no provider configured" };
    }
    const model = SOUND_MODEL();
    const deps = soundDeps(model, scene.projectId, kind);
    const rows: SoundTrackRow[] = [];
    const failed: { what: string; error: string }[] = [];
    if (kind === "ambience") {
      try {
        rows.push(ambienceRow(plan, await renderSound(plan.ambience!.prompt, plan.ambience!.seconds, deps), model));
      } catch (e) {
        failed.push({ what: "ambience", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
      }
    } else {
      for (const cue of plan.sfx) {
        try {
          rows.push(sfxRow(plan, cue, await renderSound(cue.prompt, cue.seconds, deps), model));
        } catch (e) {
          failed.push({ what: cue.cue, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
        }
      }
    }
    // Retry first (generated sounds are cached, so a retry costs only what failed).
    if (failed.length && !lastAttempt) throw new Error(`${failed.length} sound(s) failed: ${failed.map((f) => `${f.what}: ${f.error}`).join("; ")}`);
    if (rows.length) {
      await prisma.audioTrack.createMany({ data: rows.map((r) => ({ sceneId, kind: r.kind, key: r.key, startMs: r.startMs, durationMs: r.durationMs, meta: r.meta as object })) });
      // The ledger (§149): each sound on the Master Clock.
      try {
        const before = await prisma.scene.aggregate({ where: { projectId, index: { lt: scene.index } }, _sum: { durationSec: true } });
        const sceneUs = BigInt(Math.round(Number(before._sum.durationSec ?? 0) * 1e6));
        await prisma.audioGeneration.createMany({
          data: rows.map((r) => ({
            projectId, kind: r.kind === "AMBIENCE" ? "ambience" : "sfx", provider: "fal", modelId: model,
            requestedStartUs: sceneUs + BigInt(r.startMs) * 1000n, requestedEndUs: sceneUs + BigInt(r.startMs + r.durationMs) * 1000n,
            meta: { sceneId, key: r.key, ...(r.meta as object) }, outcome: "ACCEPTED", outcomeCode: "GENERATED", policy: "sound-design", classifiedAt: new Date(),
          })),
        });
      } catch (e) {
        console.warn(`[audio] sound ledger skipped for scene ${sceneId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for (const f of failed) {
      await trackMissing(projectId, "scene", `${label} is missing ${kind === "ambience" ? "its ambience" : `the sound "${f.what}"`}: the sound provider failed.`, { track: kind, error: f.error }, sceneId);
    }
    return { sceneId, kind, tracks: rows.length, failed: failed.length, cached: rows.filter((r) => r.meta.cached).length };
  },
  { connection, concurrency: 8 },
);

/** The scene's sound plan, from the film plan the Director wrote (screenplays.raw.package). */
async function soundPlanFor(projectId: string, sceneIndex: number): Promise<SceneSoundPlan | null> {
  const sp = await prisma.screenplay.findUnique({ where: { projectId }, select: { raw: true } });
  const parsed = FilmPackage.safeParse((sp?.raw as { package?: unknown } | null)?.package);
  if (!parsed.success) return null;
  return sceneSoundPlan(parsed.data, sceneIndex, {
    maxSfxPerScene: Number(process.env.SFX_MAX_PER_SCENE ?? 4),
    maxAmbienceSec: Number(process.env.AMBIENCE_MAX_SEC ?? 30),
  });
}

/** Generation through fal, metered per generated second; storage holds the content-addressed sounds. */
function soundDeps(model: string, projectId: string, kind: string): SoundDeps {
  return {
    model,
    generate: async (prompt, seconds) => {
      const result = await falRunQueue(process.env.FAL_KEY!, model, { prompt, seconds_total: seconds }, { timeoutMs: 5 * 60_000 });
      await meter({ kind: "music", provider: "fal", model, unit: "audio_seconds", units: seconds, projectId, meta: { purpose: kind } });
      const url = falFindUrl(result);
      if (!url) throw new Error(`sound model returned no audio (${JSON.stringify(result).slice(0, 200)})`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`sound download ${res.status}`);
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "audio/wav" };
    },
    exists: async (key) => (await storage.size(key)) > 0,
    put: async (key, bytes, type) => { await storage.putBytes(key, bytes, type); },
  };
}
