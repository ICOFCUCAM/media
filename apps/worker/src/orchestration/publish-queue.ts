/**
 * Producer for the social publishing queue (docs/31). Enqueue once per project
 * with the providers to publish to. Deduped per project+provider-set.
 */
import { Queue } from "bullmq";
import { QUEUES, type PublishJob } from "@cineforge/shared";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const publishQueue = new Queue<PublishJob>(QUEUES.publish, { connection });

export async function enqueuePublish(job: PublishJob): Promise<void> {
  const providers = [...new Set(job.providers.map((p) => p.toLowerCase()).filter(Boolean))];
  if (providers.length === 0) return;
  await publishQueue.add(
    "publish",
    { ...job, providers },
    { jobId: `publish:${job.projectId}:${providers.join("-")}`, attempts: 2, removeOnComplete: 100, removeOnFail: 100 },
  );
}
