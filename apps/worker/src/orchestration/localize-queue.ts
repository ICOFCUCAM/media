/**
 * Producer for the localization queue (docs/29). Enqueue once per project to
 * build subtitle (and later dubbed) variants for the requested languages.
 */
import { Queue } from "bullmq";
import { QUEUES, parseLanguages, type LocalizeJob } from "@cineforge/shared";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const localizeQueue = new Queue<LocalizeJob>(QUEUES.localize, { connection });

/** Enqueue localization for a project. Unknown/invalid codes are dropped; "en"
 *  (the source) is skipped. Deduped per project+language-set. */
export async function enqueueLocalize(projectId: string, languages: string[]): Promise<string[]> {
  const langs = parseLanguages(languages.join(","), []).filter((l) => l !== "en");
  if (langs.length === 0) return [];
  await localizeQueue.add(
    "localize",
    { projectId, languages: langs },
    { jobId: `localize:${projectId}:${langs.join("-")}`, attempts: 2, removeOnComplete: 50, removeOnFail: 50 },
  );
  return langs;
}
