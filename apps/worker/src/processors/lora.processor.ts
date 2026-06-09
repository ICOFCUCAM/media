/**
 * LoRA processor — consumes `lora-queue`. Trains a per-character LoRA from the
 * character's reference frames and writes back `loraKey`/`loraVersion`, so future
 * shots load it for the tightest identity lock (docs/28).
 *
 * Resume-safe and degrades gracefully: already-trained characters are a no-op,
 * a character with no frames is skipped, and when LORA_TRAINER_URL is unset the
 * job is a labelled skip (identity falls back to seed + reference frames).
 */
import { Worker } from "bullmq";
import { QUEUES, type LoraJob } from "@cineforge/shared";
import { buildLoraTrainer } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const assetBase = process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, "");

// The trainer fetches reference frames by URL; resolve our storage keys the same
// way the video processor does for external providers.
const trainer = buildLoraTrainer(process.env, {
  resolveImageUrl: assetBase ? async (key: string) => `${assetBase}/${key}` : undefined,
});

export const loraWorker = new Worker<LoraJob>(
  QUEUES.lora,
  async (job) => {
    const { characterId } = job.data;
    const char = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true, name: true, appearance: true, referenceUrls: true, loraKey: true },
    });
    if (!char) return { characterId, skipped: "character not found" };
    if (char.loraKey) return { characterId, skipped: "already trained", loraKey: char.loraKey };
    if (char.referenceUrls.length === 0) return { characterId, skipped: "no reference frames" };
    if (!trainer) return { characterId, skipped: "LORA_TRAINER_URL not configured" };

    const { loraKey, version } = await trainer.train({
      name: char.name,
      appearance: char.appearance,
      imageKeys: char.referenceUrls,
    });
    await prisma.character.update({ where: { id: characterId }, data: { loraKey, loraVersion: version } });
    return { characterId, loraKey, version };
  },
  { connection, concurrency: 1 }, // training is heavy — one at a time
);
