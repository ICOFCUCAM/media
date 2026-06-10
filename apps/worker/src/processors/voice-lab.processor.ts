/**
 * Voice Lab processor (docs/29 phase 2) — consumes `voice-lab-queue`.
 *
 * clone: takes the user's uploaded voice sample, ships it to fal's MiniMax
 *        voice-clone model, and stores the resulting provider voice id.
 * speak: reads a long text (speech, news, narration) with the user's cloned
 *        voice (or a stock narrator), in any registry language. Long texts are
 *        chunked at sentence boundaries and the audio parts concatenated, so
 *        an hour-long speech is as valid as a one-liner.
 *
 * Both ops are claimed by the project poller (PENDING → working states), so
 * the web only ever writes rows — the same producer/consumer split as films.
 */
import { Worker } from "bullmq";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUEUES, languageName, type VoiceLabJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { falUploadBytes, falRunQueue, falFindUrl } from "@cineforge/model-adapters";
import { S3Storage } from "../storage/storage";
import { ffmpeg } from "../ffmpeg/ffmpeg";
import { concatListContent } from "../ffmpeg/commands";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const storage = new S3Storage();

const CLONE_MODEL = process.env.FAL_VOICE_CLONE_MODEL ?? "fal-ai/minimax/voice-clone";
const SPEECH_MODEL = process.env.FAL_SPEECH_MODEL ?? "fal-ai/minimax/speech-02-hd";
/** Stock narrator when the user hasn't cloned a voice. */
const STOCK_VOICE = process.env.FAL_STOCK_VOICE ?? "Deep_Voice_Man";
const CHUNK_CHARS = 1800; // MiniMax per-call comfort zone

/** Split text at sentence boundaries into chunks the TTS model accepts. */
export function chunkText(text: string, max = CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const sentences = clean.split(/(?<=[.!?。！？])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length > max && cur) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur = (cur + " " + s).trim();
    }
    // A single sentence longer than max: hard-split it.
    while (cur.length > max) {
      chunks.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

export const voiceLabWorker = new Worker<VoiceLabJob>(
  QUEUES.voiceLab,
  async (job) => {
    const apiKey = process.env.FAL_KEY;
    if (!apiKey) throw new Error("FAL_KEY not configured — Voice Lab needs fal.ai");
    const { kind, id } = job.data;

    if (kind === "clone") {
      const voice = await prisma.voice.findUniqueOrThrow({ where: { id } });
      try {
        if (!voice.sampleKey) throw new Error("no voice sample uploaded");
        const bytes = await storage.getBytes(voice.sampleKey);
        const ext = voice.sampleKey.split(".").pop()?.toLowerCase() ?? "mp3";
        const mime = ext === "wav" ? "audio/wav" : ext === "m4a" ? "audio/mp4" : "audio/mpeg";
        const sampleUrl = await falUploadBytes(apiKey, bytes, mime, `sample.${ext}`);
        const result = await falRunQueue(apiKey, CLONE_MODEL, { audio_url: sampleUrl });
        const voiceId =
          (result.custom_voice_id as string | undefined) ??
          (result.voice_id as string | undefined) ??
          ((result.data as Record<string, unknown> | undefined)?.voice_id as string | undefined);
        if (!voiceId) throw new Error(`clone returned no voice id (${JSON.stringify(result).slice(0, 200)})`);
        await prisma.voice.update({
          where: { id },
          data: { provider: "fal-minimax", providerVoiceId: voiceId, status: "READY", errorMessage: null },
        });
        console.log(`[voice-lab] cloned voice ${id} -> ${voiceId}`);
        return { id, voiceId };
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
        await prisma.voice.update({ where: { id }, data: { status: "FAILED", errorMessage: msg } });
        throw e;
      }
    }

    // kind === "speak"
    const vo = await prisma.voiceover.findUniqueOrThrow({ where: { id }, include: { voice: true } });
    try {
      const voiceId = vo.voice?.providerVoiceId ?? STOCK_VOICE;
      const chunks = chunkText(vo.text);
      if (chunks.length === 0) throw new Error("voiceover text is empty");
      const langBoost = vo.language && vo.language !== "en" ? languageName(vo.language) : undefined;

      const parts: Uint8Array[] = [];
      for (const [i, chunk] of chunks.entries()) {
        const input: Record<string, unknown> = {
          text: chunk,
          voice_setting: { voice_id: voiceId, speed: 1 },
          ...(langBoost ? { language_boost: langBoost } : {}),
        };
        const result = await falRunQueue(apiKey, SPEECH_MODEL, input, { timeoutMs: 5 * 60_000 });
        const url = falFindUrl(result);
        if (!url) throw new Error(`speech returned no audio url (chunk ${i + 1}/${chunks.length})`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`audio download ${res.status} (chunk ${i + 1})`);
        parts.push(new Uint8Array(await res.arrayBuffer()));
        await job.updateProgress((i + 1) / chunks.length);
      }

      const audioKey = `voiceovers/${vo.userId}/${vo.id}.mp3`;
      if (parts.length === 1) {
        await storage.putBytes(audioKey, parts[0]!, "audio/mpeg");
      } else {
        // Concat chunks losslessly-enough via ffmpeg (re-encode to one mp3).
        const work = await mkdtemp(join(tmpdir(), "vo-"));
        try {
          const files: string[] = [];
          for (const [i, p] of parts.entries()) {
            const f = join(work, `part_${i}.mp3`);
            await writeFile(f, Buffer.from(p));
            files.push(f);
          }
          const list = join(work, "list.txt");
          await writeFile(list, concatListContent(files));
          const out = join(work, "voiceover.mp3");
          await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c:a", "libmp3lame", "-q:a", "2", out]);
          await storage.upload(out, audioKey, "audio/mpeg");
        } finally {
          await rm(work, { recursive: true, force: true });
        }
      }

      await prisma.voiceover.update({ where: { id }, data: { audioKey, status: "READY", errorMessage: null } });
      console.log(`[voice-lab] voiceover ${id} ready (${chunks.length} chunks, ${vo.language})`);
      return { id, audioKey, chunks: chunks.length };
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      await prisma.voiceover.update({ where: { id }, data: { status: "FAILED", errorMessage: msg } });
      throw e;
    }
  },
  { connection, concurrency: 2 },
);
