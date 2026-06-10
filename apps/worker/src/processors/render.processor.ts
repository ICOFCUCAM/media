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

    // Loud, structured logging: this is the LAST step of the pipeline and the
    // one place a silent failure would leave a project stuck on GENERATING
    // forever (the flow root has no downstream job to surface the error). Log
    // every phase and, on any throw, flip the project to FAILED + emit an error
    // event so the cause is visible in the worker logs AND the database.
    console.log(`[render] start project=${projectId} job=${job.id}`);
    try {
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

      const totalClips = assets.reduce((a, s) => a + s.shotKeys.length, 0);
      const hasClips = totalClips > 0;
      console.log(
        `[render] project=${projectId} scenes=${scenes.length} clips=${totalClips} ` +
          `s3Endpoint=${process.env.S3_ENDPOINT ? "set" : "MISSING"} ` +
          `s3Key=${process.env.S3_ACCESS_KEY ? "set" : "MISSING"} bucket=${process.env.S3_BUCKET ?? "MISSING"}`,
      );

      let mp4Key = `projects/${projectId}/film/final.mp4`;
      let hlsKey = `projects/${projectId}/film/hls/master.m3u8`;
      let posterKey: string | undefined;

      if (hasClips && process.env.S3_ENDPOINT) {
        // Real FFmpeg assembly (docs/10). Mark the project RENDERING so the web
        // shows the final stage instead of an indefinite GENERATING.
        await prisma.project.update({ where: { id: projectId }, data: { status: "RENDERING" } });
        const engine = new RenderEngine(new S3Storage());
        const out = await engine.renderFinal(projectId, assets, (p) =>
          realtime.emit("render.progress", { projectId, renderJobId: job.id, progress: p }),
        );
        mp4Key = out.mp4Key;
        hlsKey = out.hlsKey;
        posterKey = out.posterKey;
        console.log(`[render] assembly done project=${projectId} mp4=${mp4Key}`);
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
      console.log(`[render] READY project=${projectId} film=${film.id} duration=${durationSec}s`);
      return { projectId, durationSec };
    } catch (err) {
      const message = err instanceof Error ? err.stack || err.message : String(err);
      const short = err instanceof Error ? err.message : String(err);
      console.error(`[render] FAILED project=${projectId} job=${job.id}:`, message);
      // Surface the failure instead of letting the project hang on GENERATING —
      // persist the reason to error_message so it's visible without the logs.
      await prisma.project
        .update({ where: { id: projectId }, data: { status: "FAILED", errorMessage: `render: ${short}`.slice(0, 500) } })
        .catch((e) => console.error(`[render] could not mark FAILED:`, e));
      await realtime
        .emit("error", { projectId, scope: "render", message: err instanceof Error ? err.message : String(err) })
        .catch(() => {});
      throw err; // let BullMQ record the job failure / apply retries
    }
  },
  { connection, concurrency: 2 },
);
