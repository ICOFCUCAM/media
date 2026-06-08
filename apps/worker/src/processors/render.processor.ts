/**
 * Render processor — consumes `render-queue`. As the flow ROOT it runs only
 * after every scene is finalized. A real implementation invokes the FFmpeg
 * Render Engine (docs/10) to stitch scene clips + audio + subtitles + intro/
 * outro into final.mp4 + an HLS ladder and uploads to S3. This stub computes
 * the duration and writes the Film row so the lifecycle completes.
 */
import { Worker } from "bullmq";
import { QUEUES, type RenderJob } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { RenderEngine, type SceneAssets } from "../ffmpeg/render-engine";
import { S3Storage } from "../storage/storage";
import { realtime } from "../realtime";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

export const renderWorker = new Worker<RenderJob>(
  QUEUES.render,
  async (job) => {
    const { projectId, kind } = job.data;
    if (kind !== "final") return { skipped: kind };

    const scenes = await prisma.scene.findMany({
      where: { projectId },
      orderBy: { index: "asc" },
      include: { shots: { orderBy: { index: "asc" } }, audioTracks: true },
    });
    const durationSec = scenes.reduce((a, s) => a + s.durationSec, 0);

    // Build per-scene asset lists from generated clips/audio.
    const assets: SceneAssets[] = scenes.map((s) => ({
      sceneId: s.id,
      index: s.index,
      shotKeys: s.shots.map((sh) => sh.videoKey).filter((k): k is string => !!k),
      musicKey: s.audioTracks.find((t) => t.kind === "MUSIC")?.key,
      voiceKey: s.audioTracks.find((t) => t.kind === "VOICE")?.key,
      sfxKey: s.audioTracks.find((t) => t.kind === "SFX")?.key,
    }));

    const hasClips = assets.some((a) => a.shotKeys.length > 0);
    let mp4Key = `projects/${projectId}/film/final.mp4`;
    let hlsKey = `projects/${projectId}/film/hls/master.m3u8`;
    let posterKey: string | undefined;

    if (hasClips && process.env.S3_ENDPOINT) {
      // Real FFmpeg assembly (docs/10).
      const engine = new RenderEngine(new S3Storage());
      const out = await engine.renderFinal(projectId, assets, (p) =>
        realtime.emit("render.progress", { projectId, renderJobId: job.id, progress: p }),
      );
      mp4Key = out.mp4Key;
      hlsKey = out.hlsKey;
      posterKey = out.posterKey;
    } else {
      // No real clips/storage (e.g. local demo without GPU) — record metadata only.
      await realtime.emit("render.progress", { projectId, renderJobId: job.id, progress: 1 });
    }

    const film = await prisma.film.upsert({
      where: { projectId },
      create: { projectId, mp4Key, hlsKey, posterKey, durationSec, publishedAt: new Date() },
      update: { mp4Key, hlsKey, posterKey, durationSec, publishedAt: new Date() },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "READY", progress: 1 },
    });

    await realtime.emit("film.ready", { projectId, filmId: film.id, mp4Key, hlsKey });
    return { projectId, durationSec };
  },
  { connection, concurrency: 2 },
);
