/**
 * Social Launchpad processor (docs/31) — consumes `social-queue`.
 *
 * kit:    Claude turns the user's video brief into a per-platform launch kit
 *         (title, description, hashtags tuned per platform's culture/limits).
 * launch: posts the video to every CONFIGURED platform via the publish
 *         adapters (YouTube/TikTok/Instagram/Facebook/X), using a presigned
 *         URL so the private bucket never has to go public. Per-platform
 *         results land on the row; unconfigured platforms are skipped, never
 *         faked.
 */
import { Worker } from "bullmq";
import Anthropic from "@anthropic-ai/sdk";
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

const KIT_TOOL = "submit_launch_kit";
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
  const fallback = Object.fromEntries(
    PLATFORMS.map((p) => [p, { title: brief.slice(0, 80) || "New video", description: brief, hashtags: [] }]),
  ) as Record<string, PlatformKit>;
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
      max_tokens: 3000,
      system: [
        "You are a social media launch strategist. Given a video brief, produce a launch kit",
        "PER PLATFORM, tuned to each platform's culture and limits:",
        "- youtube: searchable title (<=90 chars), rich description with paragraphs + keywords, 10-15 tags (no # prefix)",
        "- tiktok: hooky casual title, short punchy description, 4-6 trending-style hashtags",
        "- instagram: aesthetic caption-style description with line breaks + emoji, 8-12 hashtags",
        "- facebook: conversational title + shareable description, 2-4 hashtags",
        "- x: max-280-char description that IS the post, 2-3 hashtags",
        "Same video, same language as the brief. Call submit_launch_kit.",
      ].join("\n"),
      tools: [{ name: KIT_TOOL, description: "Return the per-platform launch kit.", input_schema: KIT_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: KIT_TOOL },
      messages: [{ role: "user", content: brief || "A short AI-generated film." }],
    });
    const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === KIT_TOOL);
    if (toolUse?.input && typeof toolUse.input === "object") return { ...fallback, ...(toolUse.input as Record<string, PlatformKit>) };
  } catch (e) {
    console.warn("[social] kit generation failed, using fallback:", e instanceof Error ? e.message : e);
  }
  return fallback;
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
