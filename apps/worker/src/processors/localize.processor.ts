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
import { QUEUES, buildSrt, cuesFromLines, degradation, languageName, type Degradation, type LocalizeJob } from "@cineforge/shared";
import { recordDegradations, type DegradationDb } from "../truth/recorder";
import { prisma } from "@cineforge/db";
import { buildOpenAIProviders } from "@cineforge/model-adapters";
import { S3Storage } from "../storage/storage";
import { translateLines, TranslationError } from "../director/translate";
import { extendVideoArgs, NarrationOverrunError, planNarrationFit } from "../ffmpeg/commands";
import { ffmpeg, probeDuration } from "../ffmpeg/ffmpeg";

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
    // A language that cannot be translated is skipped and recorded — never
    // stored with the English text under its name (DOS-75).
    const gaps: Degradation[] = [];
    const failedLangs = new Set<string>();
    const translationFailed = (e: TranslationError, stage: "subtitles" | "dub") => {
      if (failedLangs.has(e.lang)) return;
      failedLangs.add(e.lang);
      gaps.push(degradation("TRANSLATION_FAILED", "locale", `${languageName(e.lang)} is not available: the translation failed.`, {
        refId: e.lang, detail: { stage, reason: e.reason },
      }));
    };
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
        if (existing[lang] || failedLangs.has(lang)) continue; // already localized / failed
        let translated: string[];
        try {
          translated = await translateLines(lines, lang);
        } catch (e) {
          if (!(e instanceof TranslationError)) throw e;
          translationFailed(e, "subtitles");
          continue;
        }
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
            if (locales[lang]?.mp4 || failedLangs.has(lang)) continue; // already dubbed / untranslatable
            try {
              const translated = await translateLines(narration, lang);
              // The TTS adapter speaks long text in full (no 4000-char cut).
              const text = translated.join(" ... ");
              const voiceKey = `projects/${projectId}/film/voice_${lang}.mp3`;
              const { tts } = buildOpenAIProviders(process.env, (bytes, ct) => storage.putBytes(voiceKey, bytes, ct));
              if (!tts) {
                gaps.push(degradation("TRACK_MISSING", "locale", `No ${languageName(lang)} dub: no voice provider is configured (subtitles only).`, {
                  refId: lang, severity: "warning", detail: { track: "dub" },
                }));
                continue;
              }
              await tts.synthesize({ text });
              const voicePath = join(work, `voice_${lang}.mp3`);
              await storage.download(voiceKey, voicePath);
              const out = join(work, `final_${lang}.mp4`);
              // Never cut the dubbed narration, and never cut the picture to a
              // shorter dub (both were `-shortest`; docs/38 §AW.2). A real
              // overrun skips this language with the reason, like any dub failure.
              const fit = planNarrationFit({
                pictureSec: await probeDuration(source),
                narrationSec: await probeDuration(voicePath),
                toleranceSec: Number(process.env.RENDER_NARRATION_TOLERANCE_SEC ?? 0.5),
                policy: process.env.RENDER_NARRATION_OVERRUN === "extend" ? "extend" : "fail",
              });
              if (fit.action === "fail") throw new NarrationOverrunError(fit);
              let video = source;
              if (fit.padSec > 0) {
                video = join(work, `video_${lang}.mp4`);
                await ffmpeg(extendVideoArgs(source, video, fit.padSec));
              }
              // Copy the video track untouched; swap in the dubbed narration.
              await ffmpeg(["-i", video, "-i", voicePath, "-map", "0:v", "-map", "1:a", "-t", fit.outputSec.toFixed(3), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
              const mp4Key = `projects/${projectId}/film/final_${lang}.mp4`;
              await storage.upload(out, mp4Key, "video/mp4");
              locales[lang] = { mp4: mp4Key, voice: voiceKey };
              await prisma.film.update({ where: { projectId }, data: { locales } });
              dubbed++;
              console.log(`[localize] dubbed ${projectId} -> ${lang}`);
            } catch (e) {
              console.warn(`[localize] dub ${lang} failed (subtitles still written):`, e instanceof Error ? e.message : e);
              if (e instanceof TranslationError) translationFailed(e, "dub");
              else gaps.push(degradation("TRACK_MISSING", "locale", `No ${languageName(lang)} dub: the dub could not be produced.`, {
                refId: lang, severity: "warning", detail: { track: "dub", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) },
              }));
            }
          }
        } finally {
          await rm(work, { recursive: true, force: true });
        }
      }
    }

    await recordDegradations(prisma as unknown as DegradationDb, projectId, gaps);
    return { projectId, languages, scenes: scenes.length, tracksWritten: written, dubbed, failed: [...failedLangs] };
  },
  { connection, concurrency: 2 },
);
