/**
 * Localization processor (docs/29) — consumes `localize-queue`. For each target
 * language it translates every scene's dialogue/narration, builds an .srt
 * subtitle track, uploads it, and records `scenes.subtitles[lang] = key`. Then
 * it dubs the finished film per language on the Voice Engine (W7c).
 *
 * Resume-safe: a language already present in `scenes.subtitles` is skipped.
 */
import { Worker } from "bullmq";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUEUES, buildSrt, cuesFromLines, degradation, languageName, type Degradation, type LocalizeJob } from "@cineforge/shared";
import { recordDegradations, type DegradationDb } from "../truth/recorder";
import { prisma } from "@cineforge/db";
import { S3Storage } from "../storage/storage";
import { translateLines, TranslationError } from "../director/translate";
import { concatAudioArgs, extendVideoArgs, NarrationOverrunError, planNarrationFit } from "../ffmpeg/commands";
import { chosenVoiceId, NoVoiceEngineError, renderSceneVoice, sceneCues, translateSpeech, type SceneSpeech } from "../voice/film";
import { sceneVoiceDeps } from "../voice/deps";
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
        dialogueLines: { orderBy: { index: "asc" }, select: { id: true, characterId: true, text: true, emotion: true } },
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
    // For each language (W7c): translate every scene's narration and lines,
    // speak them on the Voice Engine — each character in their own voice, a
    // cloned voice speaking the new language — join the scenes and remux the
    // finished film's video with the dub → projects/{id}/film/final_{lang}.mp4,
    // recorded in films.locales[lang]. Resume-safe per language; any failure
    // skips the language with the reason, never the job.
    const film = await prisma.film.findUnique({ where: { projectId } });
    let dubbed = 0;
    if (film) {
      const locales = (film.locales as Record<string, { mp4?: string; voice?: string }> | null) ?? {};
      const speech: SceneSpeech[] = scenes.map((s) => ({
        id: s.id, narration: s.narration, dialogue: s.dialogue, summary: s.summary,
        lines: s.dialogueLines.map((l) => ({ id: l.id, characterId: l.characterId, text: l.text, emotion: l.emotion })),
      }));
      if (speech.some((s) => sceneCues(s).length)) {
        const [project, cast] = await Promise.all([
          prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } }),
          prisma.character.findMany({ where: { projectId }, orderBy: { name: "asc" }, select: { id: true, name: true, voiceProfile: true } }),
        ]);
        const names = new Map(cast.map((c) => [c.id, c.name]));
        const work = await mkdtemp(join(tmpdir(), "dub-"));
        try {
          const source = join(work, "final.mp4");
          await storage.download(film.mp4Key, source);
          for (const lang of languages) {
            if (locales[lang]?.mp4 || failedLangs.has(lang)) continue; // already dubbed / untranslatable
            try {
              const translated = await translateSpeech(speech, (texts) => translateLines(texts, lang, { projectId }));
              const tracks: string[] = [];
              const substituted = new Set<string>();
              for (const sp of translated) {
                const dir = join(work, `${lang}-${sp.id}`);
                await mkdir(dir, { recursive: true });
                const out = await renderSceneVoice({
                  scene: sp, language: lang, ownerId: project?.userId ?? "",
                  castOrder: cast.map((c) => c.id),
                  chosenVoices: Object.fromEntries(cast.map((c) => [c.id, chosenVoiceId(c.voiceProfile)])),
                  trackKey: `projects/${projectId}/film/dub/${lang}/${sp.id}.wav`,
                  lineKeyPrefix: null,
                  dir,
                }, sceneVoiceDeps(storage, { projectId }));
                if (!out) continue;
                tracks.push(out.trackPath);
                for (const x of out.substitutions) {
                  if (substituted.has(x.characterId)) continue;
                  substituted.add(x.characterId);
                  gaps.push(degradation("VOICE_SUBSTITUTED", "locale", `${languageName(lang)} dub: ${names.get(x.characterId) ?? "a character"} spoke in a built-in voice — ${x.reason}.`, {
                    refId: lang, detail: { characterId: x.characterId, reason: x.reason },
                  }));
                }
              }
              if (!tracks.length) continue;
              const voicePath = join(work, `voice_${lang}.m4a`);
              await ffmpeg(concatAudioArgs(tracks, voicePath));
              const voiceKey = `projects/${projectId}/film/voice_${lang}.m4a`;
              await storage.upload(voicePath, voiceKey, "audio/mp4");
              const out = join(work, `final_${lang}.mp4`);
              // Never cut the dubbed narration, and never cut the picture to a
              // shorter dub (docs/38 §AW.2). A real overrun skips this language
              // with the reason, like any dub failure.
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
              // Copy the video track untouched; swap in the dub.
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
              else if (e instanceof NoVoiceEngineError) gaps.push(degradation("TRACK_MISSING", "locale", `No ${languageName(lang)} dub: no voice engine is configured (subtitles only).`, {
                refId: lang, severity: "warning", detail: { track: "dub", engines: e.message },
              }));
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
