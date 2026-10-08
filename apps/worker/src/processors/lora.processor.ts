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
import { QUEUES, degradation, type LoraJob } from "@cineforge/shared";
import { buildLoraTrainer } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { sha256OfObject } from "../gateway/artifact-hash";
import { S3Storage } from "../storage/storage";
import { recordDegradations, type DegradationDb } from "../truth/recorder";

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
    if (!trainer) {
      // Identity stays on seed + reference frames — recorded, not silent (DOS-75).
      if (job.data.projectId) {
        await recordDegradations(prisma as unknown as DegradationDb, job.data.projectId, [
          degradation("LORA_TRAINER_UNAVAILABLE", "project", `No identity model was trained for ${char.name}: the trainer is not configured, so identity relies on reference frames only.`, {
            refId: characterId,
          }),
        ]);
      }
      return { characterId, skipped: "LORA_TRAINER_URL not configured" };
    }

    const { loraKey, version } = await trainer.train({
      name: char.name,
      appearance: char.appearance,
      imageKeys: char.referenceUrls,
    });
    // Content-address the artifact (authz v2): the GPU worker will load only
    // these exact bytes. Hashed from storage, never trusted from the trainer.
    const loraSha256 = await sha256OfObject(new S3Storage(), loraKey);
    await prisma.character.update({ where: { id: characterId }, data: { loraKey, loraVersion: version, loraSha256 } });
    return { characterId, loraKey, version, loraSha256 };
  },
  { connection, concurrency: 1 }, // training is heavy — one at a time
);
