/**
 * Render processor — consumes `render-queue`. As the flow ROOT it runs only
 * after every scene is finalized: the FFmpeg Render Engine (docs/10) stitches
 * the shot clips + audio (+ brand outro) into final.mp4 (+ HLS) in storage and
 * the Film row is written.
 *
 * No fake completion (DirectorOS DOS-74/75): a film with missing shots, with
 * sound that cannot be mixed, or with nowhere to store it FAILS with the
 * reason; it is never assembled with gaps, shipped silent or recorded as a
 * phantom key. What the film ran without (outro, 4K) is recorded and shown.
 */
import { UnrecoverableError, Worker } from "bullmq";
import { QUEUES, type RenderJob, parseLanguages, degradation, isProductionFailure, type Degradation } from "@cineforge/shared";
import { judgeMaster, qualityMode, type GateResult } from "../quality/gates";
import { measureMedia } from "../quality/measure";
import { recordGates, type GateDb } from "../quality/recorder";
import { recordDegradations, type DegradationDb } from "../truth/recorder";
import { prisma } from "@cineforge/db";
import { NarrationOverrunError } from "../ffmpeg/commands";
import { nextVersion, recordVersion, type VersionDb } from "../versions/record";
import { RenderEngine, type SceneAssets } from "../ffmpeg/render-engine";
import { S3Storage } from "../storage/storage";
import { notifyFinish } from "../notify";
import { meter } from "../billing";
import { enqueueLocalize } from "../orchestration/localize-queue";
import { voiceContinuity } from "../voice/continuity";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

/** 4K upscale (docs/33): final.mp4 -> fal video upscaler -> final_4k.mp4. */
const record = (projectId: string, ds: Degradation[]) =>
  recordDegradations(prisma as unknown as DegradationDb, projectId, ds);

/** The film-level gate chain rows (W5): the master's technical + audio results, editorial pending (W8). */
async function recordFilmGates(projectId: string, quality: GateResult[]) {
  if (!quality.length) return;
  const editorial: GateResult = { gate: "editorial", outcome: "skipped", findings: [] }; // Editor Agent: W8
  await recordGates(prisma as unknown as GateDb, projectId, "film", "film", [...quality, editorial]);
}

/** Final Quality Gate (W5): measure the local master with ffmpeg and judge it. Delivery spec: -16 LUFS, true peak ≤ -1 dBTP. */
const masterGate = (filmSec: number) => async (path: string, ctx: { hasSound: boolean; filmSec: number | undefined }) =>
  judgeMaster(await measureMedia(path, { loudness: true }),
    { durationSec: ctx.filmSec ?? filmSec, hasSound: ctx.hasSound, integratedLufs: -16, truePeakMaxDbtp: -1 }, qualityMode());

async function upscaleFilm(projectId: string) {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    await record(projectId, [degradation("UPSCALE_UNAVAILABLE", "film", "4K was chosen but no upscaler is configured; the film is delivered at its rendered size.")]);
    return { projectId, skipped: "no FAL_KEY" };
  }
  const film = await prisma.film.findUnique({ where: { projectId }, select: { mp4Key: true, mp44kKey: true } });
  if (!film?.mp4Key) return { projectId, skipped: "no film" };
  if (film.mp44kKey) return { projectId, skipped: "already upscaled" };
  try {
    const { falUploadBytes, falRunQueue, falFindUrl } = await import("@cineforge/model-adapters");
    const storage = new S3Storage();
    const bytes = await storage.getBytes(film.mp4Key);
    const srcUrl = await falUploadBytes(apiKey, bytes, "video/mp4", "film.mp4");
    const model = process.env.FAL_UPSCALE_MODEL ?? "fal-ai/topaz/upscale/video";
    console.log(`[render] 4K upscale start project=${projectId} model=${model}`);
    const result = await falRunQueue(apiKey, model, { video_url: srcUrl, upscale_factor: 2 }, { timeoutMs: 30 * 60_000 });
    await meter({ kind: "video", provider: "fal", model, unit: "requests", units: 1, projectId, meta: { purpose: "upscale_4k" } });
    const url = falFindUrl(result);
    if (!url) throw new Error(`upscaler returned no video (${JSON.stringify(result).slice(0, 200)})`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`upscaled download ${res.status}`);
    const key = `projects/${projectId}/film/final_4k.mp4`;
    await storage.putBytes(key, new Uint8Array(await res.arrayBuffer()), "video/mp4");
    await prisma.film.update({ where: { projectId }, data: { mp44kKey: key } });
    console.log(`[render] 4K master ready project=${projectId}`);
    return { projectId, mp44kKey: key };
  } catch (e) {
    // The rendered film stands; the missing 4K master is recorded and shown.
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[render] 4K upscale failed project=${projectId}:`, reason);
    await record(projectId, [degradation("UPSCALE_FAILED", "film", "The 4K upscale failed; the film is available at its rendered size.", { detail: { error: reason.slice(0, 300) } })]);
    return { projectId, failed: true };
  }
}

export const renderWorker = new Worker<RenderJob>(
  QUEUES.render,
  async (job) => {
    const { projectId, kind } = job.data;
    if (kind === "upscale") return upscaleFilm(projectId);
    if (kind !== "final") throw new UnrecoverableError(`unknown render kind ${JSON.stringify(kind)}`);

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
      // Guard: a flow enqueued against a not-yet-planned project has no
      // children, so its root runs instantly. Never record a phantom film.
      if (scenes.length === 0) {
        console.warn(`[render] project=${projectId} has no scenes — skipping (premature flow)`);
        return { projectId, skipped: "no scenes" };
      }
      const durationSec = scenes.reduce((a, s) => a + s.durationSec, 0);

      // Build per-scene asset lists from generated clips/audio. Legacy "stub"
      // audio rows recorded a key without uploading a file — downloading one
      // kills the assembly ("Object not found"), so exclude them.
      const real = (t: { meta: unknown }) => (t.meta as { generated?: string } | null)?.generated !== "stub";
      const assets: SceneAssets[] = scenes.map((s) => ({
        sceneId: s.id,
        index: s.index,
        shotKeys: s.shots.map((sh) => sh.videoKey).filter((k): k is string => !!k),
        // The editor's cut lengths (W13), aligned with shotKeys: the clip is trimmed to it.
        shotCutSec: s.shots.filter((sh) => !!sh.videoKey).map((sh) => (sh.cutSec == null ? null : Number(sh.cutSec))),
        musicKey: s.audioTracks.filter(real).find((t) => t.kind === "MUSIC")?.key,
        voiceKey: s.audioTracks.filter(real).find((t) => t.kind === "VOICE")?.key,
        sfxKey: s.audioTracks.filter(real).find((t) => t.kind === "SFX")?.key,
      }));

      const totalClips = assets.reduce((a, s) => a + s.shotKeys.length, 0);
      const hasClips = totalClips > 0;
      const totalShots = scenes.reduce((a, s) => a + s.shots.length, 0);
      // Never assemble a film with gaps (it used to skip missing clips silently).
      if (hasClips && totalClips < totalShots) {
        const missing = scenes.flatMap((s) => s.shots.filter((sh) => !sh.videoKey).map((sh) => `${s.index + 1}.${sh.index + 1}`));
        const message = `${totalShots - totalClips} of ${totalShots} shots were not generated (scene.shot ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}) — the film was not assembled.`;
        console.error(`[render] project=${projectId} SHOTS_MISSING ${missing.length}`);
        await prisma.project.update({ where: { id: projectId }, data: { status: "FAILED", errorMessage: message } });
        await notifyFinish(projectId, "FAILED", message);
        return { projectId, failed: "SHOTS_MISSING", missing };
      }
      // Voice continuity over what was spoken (W14; §32.6): recorded, never blocking.
      // Replaces the previous render's findings so a re-render does not repeat them.
      try {
        const voiceTracks = scenes.flatMap((s) => s.audioTracks.filter((t) => t.kind === "VOICE" && real(t)).map((t) => ({ sceneId: s.id, sceneIndex: s.index, meta: t.meta })));
        const names = new Map((await prisma.character.findMany({ where: { projectId }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
        const voiceGaps = voiceContinuity(voiceTracks, names);
        await prisma.productionDegradation.deleteMany({ where: { projectId, code: "AUDIO_CONTINUITY", scope: "film" } });
        await recordDegradations(prisma as unknown as DegradationDb, projectId, voiceGaps);
      } catch (e) {
        console.warn(`[render] project=${projectId} voice continuity check skipped: ${e instanceof Error ? e.message : String(e)}`);
      }

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
        // White-label outro (docs/33): AGENCY+ (and admins) get their brand
        // kit applied as a closing card.
        const owner = await prisma.project.findUnique({
          where: { id: projectId },
          select: { userId: true, user: { select: { tier: true, role: true } } },
        });
        const branded = owner && (owner.user.role === "ADMIN" || owner.user.tier === "AGENCY" || owner.user.tier === "ENTERPRISE");
        const kit = branded ? await prisma.brandKit.findUnique({ where: { userId: owner!.userId } }) : null;
        const version = await nextVersion(prisma as unknown as VersionDb, "master", projectId);
        const out = await engine.renderFinal(
          projectId,
          assets,
          undefined,
          kit ? { logoKey: kit.logoKey, primaryColor: kit.primaryColor, outroText: kit.outroText } : undefined,
          { filmSec: durationSec, gate: masterGate(durationSec), version },
        );
        mp4Key = out.mp4Key;
        hlsKey = out.hlsKey;
        posterKey = out.posterKey;
        // Every delivered master stays a version; films.mp4_key points at the newest (W8).
        await recordVersion(prisma as unknown as VersionDb, {
          projectId, assetType: "master", assetId: projectId, storageKey: out.mp4Key, sha256: out.sha256, durationSec,
          derivation: {
            role: "master", poster: out.posterKey, hls: out.hlsKey, renderJob: String(job.id),
            shots: assets.flatMap((a) => a.shotKeys), voice: assets.map((a) => a.voiceKey ?? null), music: assets.find((a) => a.musicKey)?.musicKey ?? null,
          },
        });
        await record(projectId, out.degradations);
        await recordFilmGates(projectId, out.quality);
        // What the gate noted without blocking is shown on the project.
        await record(projectId, out.quality.filter((r) => r.outcome === "warn").flatMap((r) => r.findings.map((f) =>
          degradation("QUALITY_FLAGGED", "film", `Final check (${r.gate}): ${f.message}.`, { severity: f.severity === "fail" ? "major" : "info", detail: { code: f.code, ...f.detail } }))));
        console.log(`[render] assembly done project=${projectId} mp4=${mp4Key}`);
      } else if (process.env.S3_ENDPOINT) {
        // PRODUCTION with storage configured but NO clips to assemble: the shots
        // never produced video (e.g. the variations/video-to-video flow didn't
        // generate). Recording a "ready" film here yields an UNPLAYABLE phantom
        // (mp4 key with no file). Fail honestly so the user sees the real reason
        // instead of a dead Play button.
        const message = "No video was generated for this project's shots — nothing to assemble.";
        console.error(`[render] project=${projectId} has ${scenes.length} scenes but 0 clips — marking FAILED`);
        await prisma.project.update({ where: { id: projectId }, data: { status: "FAILED", errorMessage: message } });
        await notifyFinish(projectId, "FAILED", message);
        return { projectId, failed: "no clips" };
      } else if (process.env.ALLOW_PLACEHOLDER_MEDIA === "1") {
        // Local demo only (explicit): no storage, record metadata so the
        // lifecycle completes. Never in production — the key would be a phantom.
      } else {
        const message = "Storage is not configured, so the film cannot be assembled or delivered.";
        console.error(`[render] project=${projectId} STORAGE_UNCONFIGURED`);
        await prisma.project.update({ where: { id: projectId }, data: { status: "FAILED", errorMessage: message } });
        await notifyFinish(projectId, "FAILED", message);
        return { projectId, failed: "STORAGE_UNCONFIGURED" };
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

      console.log(`[render] READY project=${projectId} film=${film.id} duration=${durationSec}s`);
      await notifyFinish(projectId, "READY");

      // 4K export (docs/33): CHOICE-driven — runs when the creator picked the
      // 4K format at create time (the picker is plan-classified in the UI;
      // the tier check below is the authoritative backstop). Background fal
      // upscale; failure never touches the finished film.
      const owner4k = await prisma.project.findUnique({
        where: { id: projectId },
        select: { resolution: true, user: { select: { tier: true, role: true } } },
      });
      const eligible4k =
        process.env.FAL_KEY &&
        process.env.UPSCALE_4K !== "0" &&
        owner4k?.resolution === "4k" &&
        (owner4k.user.role === "ADMIN" || ["STUDIO", "AGENCY", "ENTERPRISE"].includes(owner4k.user.tier));
      if (owner4k?.resolution === "4k" && !eligible4k) {
        const why = !process.env.FAL_KEY || process.env.UPSCALE_4K === "0" ? "no upscaler is configured" : "your plan does not include 4K";
        await record(projectId, [degradation("UPSCALE_UNAVAILABLE", "film", `4K was chosen but ${why}; the film is delivered at its rendered size.`)]);
      }
      if (eligible4k && hasClips) {
        const { Queue } = await import("bullmq");
        const rq = new Queue(QUEUES.render, { connection });
        await rq.add("upscale", { projectId, kind: "upscale" }, { jobId: `upscale-${projectId}`, attempts: 2, removeOnComplete: 50 });
        console.log(`[render] queued 4K upscale for ${projectId}`);
      }

      // Multilingual export (docs/29): translate + subtitle + dub the finished
      // film into the configured languages. Fire-and-forget — localization can
      // never block or fail the film itself.
      const langs = parseLanguages(process.env.LOCALIZATION_LANGUAGES, []);
      if (langs.length) {
        await enqueueLocalize(projectId, langs).catch((e) =>
          console.warn(`[render] localize enqueue failed:`, e instanceof Error ? e.message : e),
        );
      }
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
      // A failed Final Quality Gate is recorded with its findings.
      const gateFailure = isProductionFailure(err) && err.code === "QUALITY_GATE_FAILED";
      if (gateFailure) await recordFilmGates(projectId, ((err.detail as { quality?: GateResult[] } | undefined)?.quality) ?? []).catch(() => {});
      // A timeline mismatch or a failed gate is deterministic: retrying renders the same film.
      const final = err instanceof NarrationOverrunError || gateFailure;
      // Email once, on the final attempt — not on every retry.
      if (final || job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await notifyFinish(projectId, "FAILED", short);
      if (final) throw new UnrecoverableError(short);
      throw err; // let BullMQ record the job failure / apply retries
    }
  },
  { connection, concurrency: 2 },
);
