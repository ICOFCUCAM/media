/**
 * Publish processor (docs/31) — consumes `publish-queue`. Loads the project's
 * finished film, resolves its MP4 to a public URL, and pushes it to each
 * requested + configured social provider, recording the per-provider result on
 * `films.publications`. Sets `publishedAt` when at least one succeeds.
 *
 * Outward-facing and safe: a provider with no credentials is skipped (never
 * posts); the actual upload is a marked integration point in the adapters.
 */
import { Worker, UnrecoverableError } from "bullmq";
import { QUEUES, type PublishJob } from "@cineforge/shared";
import { buildPublishers, type PublishResult } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const assetBase = process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, "");
const publishers = buildPublishers(process.env);

export const publishWorker = new Worker<PublishJob>(
  QUEUES.publish,
  async (job) => {
    const { projectId, providers, title, description, tags } = job.data;
    const film = await prisma.film.findUnique({
      where: { projectId },
      select: { id: true, mp4Key: true, publications: true, project: { select: { title: true } } },
    });
    if (!film?.mp4Key) throw new UnrecoverableError("no finished film to publish");
    if (!assetBase) throw new UnrecoverableError("ASSET_PUBLIC_BASE_URL not set (need a public video URL)");

    const videoUrl = `${assetBase}/${film.mp4Key}`;
    const want = new Set(providers);
    const results: Record<string, PublishResult> = { ...((film.publications as Record<string, PublishResult> | null) ?? {}) };

    for (const p of publishers) {
      if (!want.has(p.provider)) continue;
      results[p.provider] = await p.publish({
        title: title ?? film.project.title,
        description,
        tags,
        videoUrl,
      });
    }

    const anyPublished = Object.values(results).some((r) => r.status === "published");
    await prisma.film.update({
      where: { id: film.id },
      data: { publications: results as unknown as object, ...(anyPublished ? { publishedAt: new Date() } : {}) },
    });

    return { projectId, results };
  },
  { connection, concurrency: 2 },
);
