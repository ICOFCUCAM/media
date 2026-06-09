/**
 * Producer for the LoRA training queue (docs/28). Training a per-character LoRA
 * is the tightest identity lock; we enqueue it the first time a character that
 * has reference frames (but no trained LoRA yet) is needed for a render. The
 * jobId is keyed on the character so duplicate enqueues collapse to one job.
 */
import { Queue } from "bullmq";
import { QUEUES, type LoraJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const loraQueue = new Queue<LoraJob>(QUEUES.lora, { connection });

const opts = { jobId: undefined as string | undefined, attempts: 2, removeOnComplete: 50, removeOnFail: 50, backoff: { type: "exponential", delay: 30_000 } };

/** Enqueue training for a character (dedup by jobId). Caller has already checked
 *  the character is eligible. */
export async function enqueueLora(characterId: string, projectId?: string): Promise<void> {
  await loraQueue.add("train", { characterId, projectId }, { ...opts, jobId: `lora-${characterId}` });
}

/** Enqueue training iff the character has reference frames and no LoRA yet. */
export async function maybeEnqueueLoraTraining(characterId: string): Promise<boolean> {
  const char = await prisma.character.findUnique({
    where: { id: characterId },
    select: { referenceUrls: true, loraKey: true, projectId: true },
  });
  if (!char || char.loraKey || char.referenceUrls.length === 0) return false;
  await enqueueLora(characterId, char.projectId);
  return true;
}
