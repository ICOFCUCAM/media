/**
 * Localization processor (docs/29) — consumes `localize-queue`. For each target
 * language it translates every scene's dialogue/narration, builds an .srt
 * subtitle track, uploads it, and records `scenes.subtitles[lang] = key`. The
 * render engine can then mux a soft subtitle track per language; re-dubbing
 * (TTS per language) is the next integration point.
 *
 * Resume-safe: a language already present in `scenes.subtitles` is skipped.
 */
import { Worker } from "bullmq";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUEUES, buildSrt, cuesFromLines, type LocalizeJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { buildOpenAIProviders } from "@cineforge/model-adapters";
import { S3Storage } from "../storage/storage";
import { translateLines } from "../director/translate";
import { ffmpeg } from "../ffmpeg/ffmpeg";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const storage = new S3Storage();

export const localizeWorker = new Worker<LocalizeJob>(
  QUEUES.localize,
  async (job) => {
    const { projectId, languages } = job.data;
    const scenes = await prisma.scene.findMany({
      where: { projectId },
      orderBy: { index: "asc" },
      select: {
        id: true,
        durationSec: true,
        summary: true,
        dialogue: true,
        narration: true,
        subtitles: true,
        dialogueLines: { orderBy: { index: "asc" }, select: { text: true } },
      },
    });

    let written = 0;
    for (const scene of scenes) {
      // Caption source: dialogue_lines (Director) → dialogue/narration text
      // columns (web) → the scene summary.
      const lines = scene.dialogueLines.length
        ? scene.dialogueLines.map((d) => d.text).filter((t) => t.trim())
        : [scene.dialogue, scene.narration, scene.summary]
            .filter((v): v is string => Boolean(v && v.trim()))
            .flatMap((v) => v.split(/\n+/))
            .filter((t) => t.trim());
      if (lines.length === 0) continue;

      const existing = (scene.subtitles as Record<string, string> | null) ?? {};
      const updated: Record<string, string> = { ...existing };
      let changed = false;

      for (const lang of languages) {
        if (existing[lang]) continue; // already localized
        const translated = await translateLines(lines, lang);
        const srt = buildSrt(cuesFromLines(translated, scene.durationSec || lines.length * 2));
        const key = `projects/${projectId}/subtitles/${scene.id}.${lang}.srt`;
        await storage.putBytes(key, new TextEncoder().encode(srt), "application/x-subrip");
        updated[lang] = key;
        changed = true;
        written++;
      }

      if (changed) {
        await prisma.scene.update({ where: { id: scene.id }, data: { subtitles: updated } });
      }
    }

    // ── Dubbing (docs/29 phase 2): per-language narrated film ────────────
    // For each language: translate the scenes' story narration, speak it with
    // TTS, and remux the finished film's video track with the dubbed voice →
    // projects/{id}/film/final_{lang}.mp4, recorded in films.locales[lang].
    // Resume-safe per language; any failure skips the language, never the job.
    const film = await prisma.film.findUnique({ where: { projectId } });
    let dubbed = 0;
    if (film) {
      const locales = (film.locales as Record<string, { mp4?: string; voice?: string }> | null) ?? {};
      // Speak the STORY: narration -> dialogue -> summary, in scene order.
      const narration = scenes
        .map((s) => (s.narration || s.dialogue || s.dialogueLines.map((d) => d.text).join(" ") || s.summary || "").trim())
        .filter(Boolean);
      if (narration.length) {
        const work = await mkdtemp(join(tmpdir(), "dub-"));
        try {
          const source = join(work, "final.mp4");
          await storage.download(film.mp4Key, source);
          for (const lang of languages) {
            if (locales[lang]?.mp4) continue; // already dubbed
            try {
              const translated = await translateLines(narration, lang);
              const text = translated.join(" ... ").slice(0, 4000); // TTS input cap
              const voiceKey = `projects/${projectId}/film/voice_${lang}.mp3`;
              const { tts } = buildOpenAIProviders(process.env, (bytes, ct) => storage.putBytes(voiceKey, bytes, ct));
              if (!tts) break; // no TTS configured -> subtitles only
              await tts.synthesize({ text });
              const voicePath = join(work, `voice_${lang}.mp3`);
              await storage.download(voiceKey, voicePath);
              const out = join(work, `final_${lang}.mp4`);
              // Copy the video track untouched; swap in the dubbed narration.
              await ffmpeg(["-i", source, "-i", voicePath, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]);
              const mp4Key = `projects/${projectId}/film/final_${lang}.mp4`;
              await storage.upload(out, mp4Key, "video/mp4");
              locales[lang] = { mp4: mp4Key, voice: voiceKey };
              await prisma.film.update({ where: { projectId }, data: { locales } });
              dubbed++;
              console.log(`[localize] dubbed ${projectId} -> ${lang}`);
            } catch (e) {
              console.warn(`[localize] dub ${lang} failed (subtitles still written):`, e instanceof Error ? e.message : e);
            }
          }
        } finally {
          await rm(work, { recursive: true, force: true });
        }
      }
    }

    return { projectId, languages, scenes: scenes.length, tracksWritten: written, dubbed };
  },
  { connection, concurrency: 2 },
);
