/**
 * Video worker — consumes `video-queue`, generates one shot via the model
 * abstraction layer (Wan 2.1 / Hunyuan on RunPod A40), runs QC, stores the
 * result, and meters cost. See docs/09, docs/13, docs/24 §C7/§C8.
 *
 * Phase 3 additions:
 *  - Content-addressed cache (C7): before spending GPU, reuse an existing READY
 *    clip in the same project with the same cacheKey (editor re-render / repeats).
 *  - Cost metering + credit debit (C8): only billed when GPU is actually used.
 */
import { Worker, UnrecoverableError } from "bullmq";
import IORedis from "ioredis";
import { recordDegradations, type DegradationDb } from "../truth/recorder";
import { rememberGpuCaps } from "../truth/capabilities";
import {
  QUEUES,
  shouldPauseForBudget,
  computeContinuity,
  renderStatePreamble,
  type VideoJob,
  type SceneInput,
  type StatePatch,
  type SceneBridge,
  outputDimensions,
  judgeRun,
  degradation,
  type Degradation,
} from "@cineforge/shared";
import { buildClusterRegistry, buildOpenAIProviders, MODEL_VERSIONS, type JobContext, type ShotRequest } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { realtime } from "../realtime";
import { S3Storage } from "../storage/storage";
import { enqueueLora } from "../orchestration/lora-queue";
import { buildGatewayAuthority } from "../gateway";
import { gateShotTiming, timingSummary } from "../runtime/timing-gate";
import { recordVideoGeneration, videoGenerationRow, type LedgerDb } from "../runtime/ledger";

// Bytes uploader for provider adapters (OpenAI seed frames).
const storage = new S3Storage();

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

// Multi-GPU dispatch (docs/24 §C5): each model is backed by N workers
// (WAN_GPU_URLS / HUNYUAN_GPU_URLS comma-separated), round-robined per call.
// An external provider (text/image-to-video) is registered automatically when
// EXTERNAL_VIDEO_API_URL is set — drop a key in, no code changes (docs/22).
const assetBase = process.env.ASSET_PUBLIC_BASE_URL?.replace(/\/$/, "");
const registry = buildClusterRegistry(
  {
    WAN_GPU_URLS: process.env.WAN_GPU_URLS,
    WAN_GPU_URL: process.env.WAN_GPU_URL,
    HUNYUAN_GPU_URLS: process.env.HUNYUAN_GPU_URLS,
    HUNYUAN_GPU_URL: process.env.HUNYUAN_GPU_URL,
    RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
    EXTERNAL_VIDEO_API_URL: process.env.EXTERNAL_VIDEO_API_URL,
    EXTERNAL_VIDEO_API_KEY: process.env.EXTERNAL_VIDEO_API_KEY,
    EXTERNAL_VIDEO_MODEL_ID: process.env.EXTERNAL_VIDEO_MODEL_ID,
    EXTERNAL_VIDEO_MODEL_NAME: process.env.EXTERNAL_VIDEO_MODEL_NAME,
    EXTERNAL_VIDEO_MAX_SEC: process.env.EXTERNAL_VIDEO_MAX_SEC,
    FAL_KEY: process.env.FAL_KEY,
    FAL_MODEL_ID: process.env.FAL_MODEL_ID,
    FAL_T2V_MODEL: process.env.FAL_T2V_MODEL,
    FAL_I2V_MODEL: process.env.FAL_I2V_MODEL,
    FAL_V2V_MODEL: process.env.FAL_V2V_MODEL,
  },
  {
    // External providers fetch the seed frame by URL. Without a public CDN in
    // front of the bucket, hand the (small) still over as a base64 data URI —
    // fal et al accept those. Self-hosted workers read storage keys directly.
    resolveImageUrl: assetBase
      ? async (key: string) => `${assetBase}/${key}`
      : async (key: string) => {
          const bytes = await storage.getBytes(key);
          const ext = key.split(".").pop()?.toLowerCase();
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
          return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
        },
    resolveVideoUrl: assetBase ? async (key: string) => `${assetBase}/${key}` : undefined,
    // Reference clip for video-to-video — fal needs it on its own CDN.
    getVideoBytes: async (key: string) => ({ bytes: await storage.getBytes(key), contentType: "video/mp4" }),
    // Media Runtime Gateway (docs/39): every self-hosted GPU call is authorized,
    // signed, deployment-bound and audited. Report mode unless an operator
    // explicitly enforces a deployment.
    gpuAuthorizer: buildGatewayAuthority(),
    // Mirror finished external clips into our storage.
    saveVideo: (key, bytes, contentType) => storage.putBytes(key, bytes, contentType),
    // fal uploads the seed still to its own CDN (our bucket is private).
    getImageBytes: async (key: string) => {
      const bytes = await storage.getBytes(key);
      const ext = key.split(".").pop()?.toLowerCase();
      const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
      return { bytes, contentType };
    },
  },
);

type ShotWithScene = Awaited<ReturnType<typeof loadShot>>;

function loadShot(shotId: string) {
  return prisma.shot.findUniqueOrThrow({
    where: { id: shotId },
    include: { scene: { include: { project: true, location: true } } },
  });
}

/**
 * Resolve the Continuity Engine for this shot's scene: fold every prior scene of
 * the project into the inherited state + incoming bridge (docs/28), and turn the
 * inherited character **asset ids** into actual reference frames so the SAME
 * character drives every shot — pixel-level visual continuity, not just a prompt.
 */
async function resolveContinuity(
  shot: ShotWithScene,
): Promise<{ preamble: string; referenceImageKeys: string[]; loraKeys: string[]; loraSha256: Record<string, string> }> {
  const scenes = await prisma.scene.findMany({
    where: { projectId: shot.scene.projectId, index: { lte: shot.scene.index } },
    orderBy: { index: "asc" },
    select: { index: true, heading: true, characterRef: true, worldRef: true, locationNote: true, statePatch: true, bridge: true, dependsOn: true },
  });
  const inputs: SceneInput[] = scenes.map((sc) => ({
    index: sc.index,
    heading: sc.heading,
    characterRef: sc.characterRef,
    worldRef: sc.worldRef,
    locationRef: sc.locationNote,
    statePatch: (sc.statePatch as StatePatch | null) ?? null,
    bridge: (sc.bridge as SceneBridge | null) ?? null,
    dependsOn: sc.dependsOn,
  }));
  const { perScene } = computeContinuity(inputs);
  const here = perScene.find((c) => c.index === shot.scene.index);
  const self = inputs.find((c) => c.index === shot.scene.index);
  const preamble = here ? renderStatePreamble(here) : "";

  // Collect the character asset ids in play (inherited + this scene's own).
  const assetIds = new Set<string>();
  const collect = (chars?: Record<string, Record<string, string>>) => {
    for (const attrs of Object.values(chars ?? {})) if (attrs.id) assetIds.add(attrs.id);
  };
  if (here) collect(here.inherited.characters);
  collect(self?.statePatch?.characters ?? undefined);

  // Resolve each asset id to its stored reference frames + trained LoRA — the
  // reference frames are an IP-adapter signal; the LoRA is the tightest lock.
  let referenceImageKeys: string[] = [];
  let loraKeys: string[] = [];
  // Content hash per LoRA (authz v2): the GPU worker loads only these exact bytes.
  const loraSha256: Record<string, string> = {};
  if (assetIds.size) {
    const chars = await prisma.character.findMany({
      where: { id: { in: [...assetIds] } },
      select: { id: true, referenceUrls: true, loraKey: true, loraSha256: true },
    });
    referenceImageKeys = [...new Set(chars.flatMap((c) => c.referenceUrls))].slice(0, 4);
    loraKeys = [...new Set(chars.map((c) => c.loraKey).filter((k): k is string => Boolean(k)))];
    for (const c of chars) if (c.loraKey && c.loraSha256) loraSha256[c.loraKey] = c.loraSha256;
    // Train the tightest lock in the background: any framed-but-untrained
    // character gets a LoRA job (deduped by character id). Next render uses it.
    for (const c of chars) {
      if (c.referenceUrls.length > 0 && !c.loraKey) await enqueueLora(c.id, shot.scene.projectId);
    }
  }
  return { preamble, referenceImageKeys, loraKeys, loraSha256 };
}

/** Compose the final ShotRequest. `seedKey` is the resolved seed frame for
 *  image-to-video; `preamble` is the inherited-state continuity block; `refKeys`
 *  are the character's reference frames (visual continuity). */
function buildShotRequest(
  shot: ShotWithScene,
  seedKey?: string,
  preamble?: string,
  refKeys: string[] = [],
  loraKeys: string[] = [],
  loraSha256: Record<string, string> = {},
): ShotRequest {
  const [w, h] = outputDimensions(shot.scene.project.resolution, shot.scene.project.aspectRatio);
  // video-to-video: an uploaded reference video drives the motion style.
  const refVideo = shot.referenceVideoKey && !PREVIEW_SEED.test(shot.referenceVideoKey) ? shot.referenceVideoKey : undefined;
  // Seed frame first, then the character's reference frames (deduped).
  const refs = [...new Set([seedKey, ...refKeys].filter((k): k is string => Boolean(k)))];
  return {
    prompt: preamble ? `${preamble}\n\n${shot.prompt}` : shot.prompt,
    negativePrompt: shot.negativePrompt ?? undefined,
    seed: shot.seed ? Number(shot.seed) : undefined,
    durationSec: shot.durationSec,
    width: w,
    height: h,
    camera: (shot.cameraPlan as unknown as ShotRequest["camera"]) ?? undefined,
    referenceImageKeys: refs.length ? refs : undefined,
    referenceVideoKeys: refVideo ? [refVideo] : undefined,
    videoOp: refVideo ? "style" : undefined,
    motionStrength: refVideo ? 0.7 : undefined,
    loraKeys: loraKeys.length ? loraKeys : undefined,
    loraSha256: loraKeys.length ? loraSha256 : undefined,
  };
}

/** The job as the database sees it right now — what the GPU gateway authorizes (docs/39). */
async function jobContext(shotId: string, modelId: string): Promise<JobContext> {
  const row = await prisma.shot.findUniqueOrThrow({
    where: { id: shotId },
    select: { status: true, scene: { select: { projectId: true, project: { select: { status: true } } } } },
  });
  return { shotId, projectId: row.scene.projectId, shotStatus: row.status, projectStatus: row.scene.project.status, modelId };
}

// Web-only markers from the preview UI — not real storage keys.
const PREVIEW_SEED = /^(generated:|local:|ref:)/;

/**
 * Resolve the seed frame for an image-to-video shot:
 *  1. a creator-UPLOADED seed (a real storage key) is used as-is;
 *  2. otherwise, if OpenAI is configured, GENERATE one (GPT-image-1) from the
 *     shot prompt, upload it, and persist the key;
 *  3. otherwise fall back to text-to-video (no seed).
 */
async function resolveSeedKey(shot: ShotWithScene): Promise<string | undefined> {
  if (shot.source !== "image") return undefined;
  if (shot.seedImageKey && !PREVIEW_SEED.test(shot.seedImageKey)) return shot.seedImageKey; // uploaded
  if (!process.env.OPENAI_API_KEY || !process.env.S3_BUCKET) throw new SeedUnavailable("no image provider or storage configured");

  const key = `projects/${shot.scene.projectId}/seeds/${shot.id}.png`;
  const { image } = buildOpenAIProviders(process.env, (bytes, ct) => storage.putBytes(key, bytes, ct));
  if (!image) throw new SeedUnavailable("image provider unavailable");
  const [w, h] = outputDimensions(shot.scene.project.resolution, shot.scene.project.aspectRatio);
  const { imageKey } = await image.generate({ prompt: shot.prompt, width: w, height: h });
  await prisma.shot.update({ where: { id: shot.id }, data: { seedImageKey: imageKey } });
  return imageKey;
}

class SeedUnavailable extends Error {}

/**
 * Never self-certify (DOS-70): the clip the provider names must exist in our
 * storage, non-empty, before the shot is READY. A missing object is retried
 * (eventual consistency) and then fails the shot — it is never assembled.
 */
async function verifyArtifact(key: string): Promise<number> {
  const size = await storage.size(key);
  if (!size) throw new Error(`ARTIFACT_MISSING: ${key} is not in storage (provider claimed success)`);
  return size;
}

// Capability Registry: refresh the GPU's own report at most every 30 min
// while it is awake (just served a shot) — never wake a sleeping pod for it.
const capsRedis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null, lazyConnect: true });
const capsCheckedAt = new Map<string, number>();
async function refreshGpuCaps(modelId: string, probe: () => Promise<Record<string, unknown> | null>): Promise<void> {
  const last = capsCheckedAt.get(modelId) ?? 0;
  if (Date.now() - last < 30 * 60_000) return;
  capsCheckedAt.set(modelId, Date.now());
  try {
    const caps = await probe();
    if (caps) await rememberGpuCaps(capsRedis, modelId, caps);
  } catch (e) {
    console.warn(JSON.stringify({ event: "truth.gpu_caps", modelId, error: e instanceof Error ? e.message : String(e) }));
  }
}

const allowPlaceholder = () => process.env.ALLOW_PLACEHOLDER_MEDIA === "1";

/** Look for an already-generated clip with the same cacheKey in this project. */
async function findCacheHit(shot: ShotWithScene): Promise<{ videoKey: string; thumbnailKey: string | null } | null> {
  if (!shot.cacheKey) return null;
  const hit = await prisma.shot.findFirst({
    where: {
      cacheKey: shot.cacheKey,
      status: "READY",
      videoKey: { not: null },
      id: { not: shot.id },
      scene: { projectId: shot.scene.projectId },
    },
    select: { videoKey: true, thumbnailKey: true },
    orderBy: { updatedAt: "desc" },
  });
  return hit?.videoKey ? { videoKey: hit.videoKey, thumbnailKey: hit.thumbnailKey } : null;
}

export const videoWorker = new Worker<VideoJob>(
  QUEUES.video,
  async (job) => {
    const { shotId, modelId, projectId, sceneId } = job.data;
    const shot = await loadShot(shotId);

    // ── Idempotent resume (C8): a shot already generated is a no-op ──────
    if (shot.status === "READY" && shot.videoKey) {
      await realtime.emit("shot.ready", { projectId, sceneId, shotId, thumbnailKey: shot.thumbnailKey ?? undefined });
      return { shotId, videoKey: shot.videoKey, gpuMs: 0, alreadyDone: true };
    }

    // ── Budget pause gate (C8): stop dispatching GPU work when paused ────
    if (shot.scene.project.status === "PAUSED") {
      throw new UnrecoverableError("project paused (budget ceiling reached)");
    }

    // ── Cache hit (C7): reuse an identical clip, zero GPU spend ──────────
    const cached = await findCacheHit(shot);
    if (cached) {
      await prisma.shot.update({
        where: { id: shotId },
        data: {
          status: "READY",
          videoKey: cached.videoKey,
          thumbnailKey: cached.thumbnailKey,
          gpuMs: 0,
          attempts: { increment: 1 },
        },
      });
      await realtime.emit("shot.ready", { projectId, sceneId, shotId, thumbnailKey: cached.thumbnailKey ?? undefined });
      return { shotId, videoKey: cached.videoKey, gpuMs: 0, cached: true };
    }

    // ── Generate ────────────────────────────────────────────────────────
    // Capability-aware routing: a shot conditioned on a reference VIDEO
    // (variations/restyle of an uploaded clip) needs a v2v-capable engine.
    // The self-hosted Wan path can't do that — route the shot to the first
    // registered adapter that can (fal/cinematic), keeping the project's
    // engine for everything else. No capable engine -> fail with the reason.
    let adapter = registry.get(modelId);
    const wantsV2v = Boolean(shot.referenceVideoKey && !PREVIEW_SEED.test(shot.referenceVideoKey));
    if (wantsV2v && !adapter.capabilities().supportsReferenceVideo) {
      const capable = registry.listCapabilities().find((c) => c.supportsReferenceVideo);
      if (!capable) {
        throw new UnrecoverableError(
          "This shot needs video-to-video (reference clip), but no configured engine supports it — set FAL_KEY to enable the Cinematic engine.",
        );
      }
      console.log(`[video] shot=${shotId} routed ${modelId} -> ${capable.id} (video-to-video)`);
      adapter = registry.get(capable.id);
    }
    await prisma.shot.update({ where: { id: shotId }, data: { status: "GENERATING" } });

    // image-to-video: use the uploaded seed, or generate one (OpenAI) first.
    // Without a still the shot runs text-to-video — recorded as a degradation
    // the user sees (DOS-75), never a silent switch.
    const gaps: Degradation[] = [];
    let seedKey: string | undefined;
    try {
      seedKey = await resolveSeedKey(shot);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      gaps.push(degradation("SEED_IMAGE_UNAVAILABLE", "shot", "No seed still for this shot; it was generated from text only.", {
        refId: shotId, detail: { reason },
      }));
    }
    // Continuity: inherit prior scenes into the prompt + reuse the same character
    // reference frames so identity is locked pixel-level (docs/28).
    const { preamble, referenceImageKeys, loraKeys, loraSha256 } = await resolveContinuity(shot);
    const request = buildShotRequest(shot, seedKey, preamble, referenceImageKeys, loraKeys, loraSha256);
    // Job authorization reads the job's state fresh, immediately before dispatch.
    request.job = await jobContext(shotId, adapter.id);
    const result = await adapter.generate(request);

    // What actually ran (DOS-70/75): placeholder media never becomes a shot;
    // clamped size/length, ignored references and skipped LoRAs are recorded.
    const judged = judgeRun(result.execution, result.realExecution,
      { width: request.width, height: request.height, durationSec: request.durationSec, fps: request.fps ?? 16, shotId },
      { allowPlaceholder: allowPlaceholder() });
    if (judged.failure) {
      await recordDegradations(prisma as unknown as DegradationDb, projectId, gaps);
      throw new UnrecoverableError(judged.failure.message);
    }
    gaps.push(...judged.degradations);
    if (adapter.id !== modelId) {
      gaps.push(degradation("MODEL_SUBSTITUTED", "shot", `Generated with ${adapter.id} instead of ${modelId} (video-to-video).`, {
        refId: shotId, severity: "info", detail: { requested: modelId, used: adapter.id },
      }));
    }

    // Timing gate (docs/38 §AV.5): Cineforge classifies what was produced.
    // Default mode records only; RUNTIME_TIMING_POLICY=enforce acts on it.
    const timing = gateShotTiming({ modelId: adapter.id, request, result, attempt: job.attemptsMade + 1 });
    console.log(JSON.stringify({ event: "runtime.timing_outcome", shotId, modelId: adapter.id, ...timingSummary(timing) }));
    await recordVideoGeneration(prisma as unknown as LedgerDb, videoGenerationRow({
      projectId, shotId, modelId: adapter.id, modelVersion: shot.modelVersion ?? MODEL_VERSIONS[modelId], request, result, gate: timing,
    }));
    if (timing.action === "fail") throw new UnrecoverableError(`TIMING ${timing.decision.code}: ${timing.decision.message}`);
    if (timing.action === "retry") throw new Error(`TIMING ${timing.decision.code}: ${timing.decision.message}`);

    // The clip must exist before the shot is READY (DOS-70). Visual / sync QC
    // of the clip's content is W5; this is the storage + execution check.
    await verifyArtifact(result.videoKey);
    await recordDegradations(prisma as unknown as DegradationDb, projectId, gaps);
    if (adapter.runtimeCapabilities) await refreshGpuCaps(adapter.id, () => adapter.runtimeCapabilities!());

    await prisma.shot.update({
      where: { id: shotId },
      data: {
        status: "READY",
        videoKey: result.videoKey,
        thumbnailKey: result.thumbnailKey,
        seed: BigInt(result.seed),
        gpuMs: result.gpuMs,
        modelVersion: shot.modelVersion ?? MODEL_VERSIONS[modelId],
        attempts: { increment: 1 },
      },
    });

    // ── Meter + debit + budget tracking (C8) ────────────────────────────
    const { userId } = shot.scene.project;
    const [, , updatedProject] = await prisma.$transaction([
      prisma.usageRecord.create({
        data: { userId, projectId, gpuMs: result.gpuMs, kind: "video" },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { creditsMs: { decrement: result.gpuMs } },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: { spentMs: { increment: result.gpuMs } },
        select: { spentMs: true, estimatedMs: true },
      }),
    ]);

    await realtime.emit("shot.ready", { projectId, sceneId, shotId, thumbnailKey: result.thumbnailKey });

    // Pause the project if it blew past its budget ceiling. Already-queued
    // shots then fail-fast at the gate above; the GPU drains and shuts down.
    if (shouldPauseForBudget(updatedProject.estimatedMs, updatedProject.spentMs)) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "PAUSED", errorMessage: "Budget ceiling reached" },
      });
      await realtime.emit("project.paused", {
        projectId,
        reason: "budget",
        spentMs: updatedProject.spentMs,
        estimatedMs: updatedProject.estimatedMs ?? undefined,
      });
    }

    return { shotId, videoKey: result.videoKey, gpuMs: result.gpuMs };
  },
  {
    connection,
    concurrency: Number(process.env.VIDEO_CONCURRENCY ?? 4), // bounded by GPU pool
    limiter: { max: 100, duration: 1000 },
  },
);

// Surface terminal shot failures: when a job exhausts its retries the shot
// otherwise sits on GENERATING forever and the project shows no reason. Mark
// the shot FAILED and put the cause on the project (red banner in the UI).
videoWorker.on("failed", (job, err) => {
  void (async () => {
    if (!job?.data?.shotId) return;
    const attemptsAllowed = (job.opts.attempts ?? 1) as number;
    // UnrecoverableError ends the job on its first attempt — it is terminal too.
    const unrecoverable = err instanceof UnrecoverableError || (err as Error)?.name === "UnrecoverableError";
    if (!unrecoverable && job.attemptsMade < attemptsAllowed) return; // a retry is coming
    const reason = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    console.error(`[video] shot ${job.data.shotId} failed terminally: ${reason}`);
    await prisma.shot.update({ where: { id: job.data.shotId }, data: { status: "FAILED" } }).catch(() => {});
    // Scene-by-scene: the board shows scene status, so a failed shot fails its scene.
    await prisma.scene
      .updateMany({ where: { id: job.data.sceneId, project: { mode: "storyboard" } }, data: { status: "FAILED" } })
      .catch(() => {});
    // A film cannot be delivered with a missing shot (DOS-74): an auto-mode
    // production fails now with the reason, instead of stalling on GENERATING
    // and being resumed into the same failure. Storyboard projects keep going:
    // the creator regenerates the scene.
    await prisma.project
      .updateMany({
        where: { id: job.data.projectId, mode: { not: "storyboard" }, status: { in: ["GENERATING", "RENDERING"] } },
        data: { status: "FAILED", errorMessage: `A shot could not be generated: ${reason}`.slice(0, 500) },
      })
      .catch(() => {});
    await prisma.project
      .updateMany({ where: { id: job.data.projectId, mode: "storyboard" }, data: { errorMessage: `shot: ${reason}`.slice(0, 500) } })
      .catch(() => {});
    await realtime
      .emit("error", { projectId: job.data.projectId, scope: "video", id: job.data.shotId, message: reason })
      .catch(() => {});
  })();
});
