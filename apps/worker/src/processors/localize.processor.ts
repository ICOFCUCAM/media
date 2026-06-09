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
import { QUEUES, buildSrt, cuesFromLines, type LocalizeJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { S3Storage } from "../storage/storage";
import { translateLines } from "../director/translate";

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

    return { projectId, languages, scenes: scenes.length, tracksWritten: written };
  },
  { connection, concurrency: 2 },
);
