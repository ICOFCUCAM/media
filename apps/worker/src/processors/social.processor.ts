/**
 * Social Launchpad processor (docs/31) — consumes `social-queue`.
 *
 * kit:    the planning model (via the intelligence router, prompt social.kit@1)
 *         turns the user's video brief into a per-platform launch kit (title,
 *         description, hashtags tuned per platform's culture/limits). When it
 *         cannot, the launch is FAILED with the reason — a template is never
 *         passed off as a written kit (DirectorOS DOS-75).
 * launch: posts the video to every CONFIGURED platform via the publish
 *         adapters (YouTube/TikTok/Instagram/Facebook/X), using a presigned
 *         URL so the private bucket never has to go public. Per-platform
 *         results land on the row; unconfigured platforms are skipped, never
 *         faked.
 */
import { Worker } from "bullmq";
import { PROMPTS } from "@cineforge/movie";
import { intelligence } from "../intelligence";
import { QUEUES, type SocialJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { buildPublishers, type PublishResult } from "@cineforge/model-adapters";
import { S3Storage } from "../storage/storage";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const storage = new S3Storage();

export const PLATFORMS = ["youtube", "tiktok", "instagram", "facebook", "x"] as const;
export interface PlatformKit {
  title: string;
  description: string;
  hashtags: string[];
}

const KIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...PLATFORMS],
  properties: Object.fromEntries(
    PLATFORMS.map((p) => [
      p,
      {
        type: "object",
        additionalProperties: false,
        required: ["title", "description", "hashtags"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
        },
      },
    ]),
  ),
} as const;

async function generateKit(brief: string): Promise<Record<string, PlatformKit>> {
  const p = PROMPTS.socialKit;
  const res = await intelligence().call({
    task: "social_kit", promptId: p.id, promptVersion: p.version, system: p.system,
    user: brief || "A short AI-generated film.",
    schema: KIT_SCHEMA as unknown as Record<string, unknown>, schemaName: "LaunchKit", maxTokens: 8000, effort: "medium",
  });
  const kit = res.output as Record<string, PlatformKit>;
  const missing = PLATFORMS.filter((pl) => !kit?.[pl]?.title || !kit[pl]!.description);
  if (missing.length) throw new Error(`the launch kit is missing ${missing.join(", ")}`);
  return kit;
}

export const socialWorker = new Worker<SocialJob>(
  QUEUES.social,
  async (job) => {
    const { kind, id } = job.data;
    const launch = await prisma.socialLaunch.findUniqueOrThrow({ where: { id } });

    if (kind === "kit") {
      try {
        const kit = await generateKit(launch.brief);
        await prisma.socialLaunch.update({
          where: { id },
          data: { kit: kit as unknown as object, status: "KIT_READY", errorMessage: null },
        });
        console.log(`[social] kit ready for launch ${id}`);
        return { id, platforms: Object.keys(kit) };
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
        await prisma.socialLaunch.update({ where: { id }, data: { status: "FAILED", errorMessage: msg } });
        throw e;
      }
    }

    // kind === "launch": post to every configured platform.
    try {
      const kit = (launch.kit as Record<string, PlatformKit> | null) ?? {};
      const videoUrl = await storage.signedGetUrl(launch.videoKey, 24 * 3600);
      const publishers = buildPublishers(process.env);
      const results: Record<string, PublishResult> = { ...((launch.results as Record<string, PublishResult> | null) ?? {}) };

      for (const p of publishers) {
        if (results[p.provider]?.status === "published") continue; // idempotent re-launch
        const k = kit[p.provider];
        results[p.provider] = await p.publish({
          title: k?.title ?? launch.brief.slice(0, 80),
          description: k?.description ?? launch.brief,
          tags: k?.hashtags?.map((h) => h.replace(/^#/, "")),
          videoUrl,
        });
        console.log(`[social] ${id} -> ${p.provider}: ${results[p.provider]!.status} ${results[p.provider]!.detail ?? ""}`);
      }

      const anyPublished = Object.values(results).some((r) => r.status === "published");
      await prisma.socialLaunch.update({
        where: { id },
        data: { results: results as unknown as object, status: anyPublished ? "LAUNCHED" : "KIT_READY", errorMessage: anyPublished ? null : "no platform configured or all failed — connect accounts in Render env" },
      });
      return { id, results };
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      await prisma.socialLaunch.update({ where: { id }, data: { status: "FAILED", errorMessage: msg } });
      throw e;
    }
  },
  { connection, concurrency: 2 },
);
