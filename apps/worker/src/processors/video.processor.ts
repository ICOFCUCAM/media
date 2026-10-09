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
import { recordVersion, type VersionDb } from "../versions/record";
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
  deterministicSeed,
  judgeRun,
  degradation,
  type Degradation,
} from "@cineforge/shared";
import { buildClusterRegistry, MODEL_VERSIONS, type JobContext, type ShotRequest, type VideoModelAdapter } from "@cineforge/model-adapters";
import { prisma } from "@cineforge/db";
import { checkContinuity, compileFor, compileGeneration, FilmPackage, reviewFrame, type GenerationContext } from "@cineforge/movie";
import { candidateSeed, imageProvider } from "../images/providers";
import { meter, meteredImages } from "../billing";
import { productionOf, renderStyleFor } from "../director/production";
import { isStillMotion } from "@cineforge/shared";
import { StillMotionEngine, STILL_MOTION_FPS } from "../animation/still-motion";
import { pickCandidate, seedCandidates } from "../images/candidates";
import { recordSeedCandidates, type MediaVersionDb } from "../images/record";
import { assembleReferencePack, endFrameKey } from "../canon/reference-pack";
import { gateVisual, visualGateResult, visualReviewMode, frameGrabber, type VisualGateDeps } from "../review/visual-gate";
import { decideShot, judgeClip, qualityMode, type GateResult } from "../quality/gates";
import { inspectClip } from "../quality/measure";
import { recordGates, type GateDb } from "../quality/recorder";
import { intelligence } from "../intelligence";
import { ffmpeg, probeDuration } from "../ffmpeg/ffmpeg";
import { shotReferences } from "../canon/references";
import { wardrobeReferenceKeys, type ReferenceImageGenerator, type WardrobeRefDb } from "../canon/wardrobe-refs";
import { worldReferenceKeys, type WorldRefDb } from "../canon/world-refs";
import { imageGenerationRow, recordImageGeneration, type ImageLedgerDb, type ImagePurpose } from "../images/ledger";
import { S3Storage } from "../storage/storage";
import { enqueueLora } from "../orchestration/lora-queue";
import { buildGatewayAuthority } from "../gateway";
import { gateShotTiming, timingSummary } from "../runtime/timing-gate";
import { recordVideoGeneration, videoGenerationRow, type LedgerDb } from "../runtime/ledger";

// Bytes uploader for provider adapters (OpenAI seed frames).
const storage = new S3Storage();
// Storybook and motion-comic shots (W12): the drawn page/panel + a camera move, no video model.
const stillMotion = new StillMotionEngine({
  storage,
  clipKey: (req) => `projects/${req.job?.projectId ?? "unknown"}/shots/${req.job?.shotId ?? "unknown"}/still-motion-${Date.now()}.mp4`,
});

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

/** The project's Film IR, or null for projects planned before it. */
async function filmPackageOf(projectId: string): Promise<FilmPackage | null> {
  const sp = await prisma.screenplay.findUnique({ where: { projectId }, select: { raw: true } });
  const parsed = FilmPackage.safeParse((sp?.raw as { package?: unknown } | null)?.package);
  return parsed.success ? parsed.data : null;
}

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
): Promise<{
  preamble: string; wardrobeKeys: string[]; identityKeys: string[]; locationKeys: string[]; propKeys: string[]; previousEndFrame: string | null;
  loraKeys: string[]; loraSha256: Record<string, string>; gaps: Degradation[];
  /** What canon says this shot shows (Film IR projects) — the Visual Reviewer checks the clip against it. */
  canonContext: GenerationContext | null;
}> {
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
  // Film IR shots carry canon in their compiled prompt (W4); the text
  // preamble is for projects planned before it.
  const filmIr = await filmPackageOf(shot.scene.projectId);
  const preamble = here && !filmIr ? renderStatePreamble(here) : "";

  // Which characters' assets this shot needs. Film IR projects: the
  // Continuity Engine checks the shot against the world state and names the
  // characters in frame (DirectorOS W3, §62.6) — a shot that contradicts canon
  // is not generated. Legacy projects: every character inherited so far.
  const pkg = filmIr;
  const refs = shotReferences(pkg, shot.scene.index, shot.index, self?.statePatch?.characters);
  if (refs.result && !refs.result.passed) {
    const v = refs.result.violations.filter((x) => x.severity === "blocking").map((x) => `${x.code} ${x.message}`).join("; ");
    throw new UnrecoverableError(`CONTINUITY_VIOLATION: ${v}`);
  }
  const assetIds = new Set<string>(refs.characterIds ?? []);
  if (!refs.characterIds) {
    const collect = (chars?: Record<string, Record<string, string>>) => {
      for (const attrs of Object.values(chars ?? {})) if (attrs.id) assetIds.add(attrs.id);
    };
    if (here) collect(here.inherited.characters);
    collect(self?.statePatch?.characters ?? undefined);
  }

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
    referenceImageKeys = [...new Set(chars.flatMap((c) => c.referenceUrls))];
    loraKeys = [...new Set(chars.map((c) => c.loraKey).filter((k): k is string => Boolean(k)))];
    for (const c of chars) if (c.loraKey && c.loraSha256) loraSha256[c.loraKey] = c.loraSha256;
    // Train the tightest lock in the background: any framed-but-untrained
    // character gets a LoRA job (deduped by character id). Next render uses it.
    for (const c of chars) {
      if (c.referenceUrls.length > 0 && !c.loraKey) await enqueueLora(c.id, shot.scene.projectId);
    }
  }
  // Wardrobe reference pack: each framed character in this scene's wardrobe (0034).
  const gaps: Degradation[] = [];
  let wardrobeKeys: string[] = [];
  if (pkg && refs.result) {
    const pack = await wardrobeReferenceKeys(prisma as unknown as WardrobeRefDb, referenceImageGenerator(shot.scene.projectId, "wardrobe_reference", { width: 1024, height: 1536 }), shot.scene.projectId, shot.id,
      pkg, refs.result, refs.charIdByKey, wardrobeUnavailableReason());
    gaps.push(...pack.gaps);
    wardrobeKeys = pack.keys;
  }
  // Location and prop reference stills (W17; §34–35, migration 0052).
  let locationKeys: string[] = [];
  let propKeys: string[] = [];
  if (pkg && refs.result && process.env.WORLD_REFERENCES !== "0") {
    const [w, h] = outputDimensions(shot.scene.project.resolution, shot.scene.project.aspectRatio);
    const world = await worldReferenceKeys(prisma as unknown as WorldRefDb, worldImageGenerator(shot.scene.projectId, { width: w, height: h }), shot.scene.projectId, shot.id,
      pkg, refs.result, wardrobeUnavailableReason());
    gaps.push(...world.gaps);
    locationKeys = world.location;
    propKeys = world.props;
  }
  return {
    preamble, wardrobeKeys, identityKeys: referenceImageKeys, locationKeys, propKeys, previousEndFrame: pkg ? await previousEndFrame(shot, pkg) : null,
    loraKeys, loraSha256, gaps, canonContext: refs.result?.correctedGenerationContext ?? null,
  };
}

/**
 * End-state memory (W6): the last frame of the shot before this one in the
 * same continuous action — the previous shot in the scene, or, for a scene
 * that continues the previous one, that scene's last shot — when it exists.
 */
async function previousEndFrame(shot: ShotWithScene, pkg: FilmPackage): Promise<string | null> {
  const scene = pkg.scenes.find((s) => s.index === shot.scene.index);
  let prev: { id: string } | null = null;
  if (shot.index > 0) {
    prev = await prisma.shot.findFirst({ where: { sceneId: shot.sceneId, index: shot.index - 1, status: "READY" }, select: { id: true } });
  } else if (scene?.storyTime?.continuous && shot.scene.index > 0) {
    prev = await prisma.shot.findFirst({
      where: { status: "READY", scene: { projectId: shot.scene.projectId, index: shot.scene.index - 1 } },
      orderBy: { index: "desc" }, select: { id: true },
    });
  }
  if (!prev) return null;
  const key = endFrameKey(shot.scene.projectId, prev.id);
  return (await storage.size(key).catch(() => 0)) > 0 ? key : null;
}

function visualGateDeps(projectId: string, camera: { cameraType?: string | null; cameraMovement?: string | null } = {}): VisualGateDeps {
  const router = intelligence();
  return {
    available: () => router.available("visual_review"),
    grabFrames: frameGrabber((key, dest) => storage.download(key, dest), (args) => ffmpeg(args), probeDuration),
    review: (ctx, frames) => reviewFrame(router, ctx, frames, { projectId, media: { kind: frames.length > 1 ? "clip" : "still", ...camera } }),
  };
}

function wardrobeUnavailableReason(): string {
  if (process.env.WARDROBE_REFERENCES === "0") return "disabled (WARDROBE_REFERENCES=0)";
  return imageProvider((k, b, ct) => storage.putBytes(k, b, ct)).reason ?? "no image provider configured";
}

/**
 * Reference stills via the image provider registry (W6), metered and recorded
 * in the Image Engine's ledger (W17); null when disabled or none is configured.
 */
function referenceImageGenerator(projectId: string, purpose: ImagePurpose, size: { width: number; height: number }): ReferenceImageGenerator | null {
  if (purpose === "wardrobe_reference" && process.env.WARDROBE_REFERENCES === "0") return null;
  const found = imageProvider((k, b, ct) => storage.putBytes(k, b, ct)).provider;
  if (!found) return null;
  const provider = meteredImages(found, { projectId, purpose }, meter);
  return {
    id: provider.id,
    generate: async (prompt, key, meta) => {
      const img = await provider.generate(prompt, key, size);
      await recordImageGeneration(prisma as unknown as ImageLedgerDb, imageGenerationRow(projectId, purpose, meta?.subject ?? key, img, { canonDigest: meta?.digest ?? null }));
      return img.key;
    },
  };
}

/** Places and props: the location in the film's frame, a prop the same. */
function worldImageGenerator(projectId: string, size: { width: number; height: number }): ReferenceImageGenerator | null {
  const loc = referenceImageGenerator(projectId, "location_reference", size);
  const prop = referenceImageGenerator(projectId, "prop_reference", { width: 1024, height: 1024 });
  if (!loc || !prop) return null;
  return { id: loc.id, generate: (prompt, key, meta) => (meta?.subject.startsWith("prop_") ? prop : loc).generate(prompt, key, meta) };
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
  const { provider: found, reason } = imageProvider((k, b, ct) => storage.putBytes(k, b, ct));
  if (!found) throw new SeedUnavailable(reason ?? "no image provider configured");
  const provider = meteredImages(found, { projectId: shot.scene.projectId, purpose: "seed_frame" }, meter);

  const [w, h] = outputDimensions(shot.scene.project.resolution, shot.scene.project.aspectRatio);
  const prompt = await seedPrompt(shot);
  const n = seedCandidates();
  const base = `projects/${shot.scene.projectId}/seeds/${shot.id}`;
  const keys = n === 1 ? [`${base}.png`] : Array.from({ length: n }, (_, i) => `${base}-c${i + 1}.png`);
  // Each candidate has its own stable seed (W17): with a seeded provider the same shot draws the same candidates again.
  const images = await Promise.all(keys.map((k, i) => provider.generate(prompt, k, { width: w, height: h }, { seed: candidateSeed(shot.id, i) })));
  const stored = images.map((im) => im.key);
  let chosen = stored[0]!;
  let chosenIndex = 0;
  if (n > 1) {
    // Seed candidates (W6): the Visual Reviewer picks the still that best shows canon.
    const ctx = await seedReviewContext(shot);
    const router = intelligence();
    const cands = await Promise.all(stored.map(async (key) => {
      if (!ctx || !router.available("visual_review")) return { key, review: null };
      const bytes = await storage.getBytes(key);
      const review = await reviewFrame(router, ctx, [{ mediaType: "image/png", data: Buffer.from(bytes).toString("base64") }], { projectId: shot.scene.projectId })
        .catch(() => null);
      return { key, review };
    }));
    const pick = pickCandidate(cands);
    chosen = pick.chosen.key;
    chosenIndex = pick.index;
    await recordSeedCandidates(prisma as unknown as MediaVersionDb, shot.scene.projectId, shot.id, cands, pick.index);
  }
  // The Image Engine's record (W17): every still drawn for this shot, and which one it uses.
  for (const [i, img] of images.entries()) {
    await recordImageGeneration(prisma as unknown as ImageLedgerDb, n === 1
      ? imageGenerationRow(shot.scene.projectId, "seed_frame", shot.id, img)
      : imageGenerationRow(shot.scene.projectId, "seed_candidate", shot.id, img, { candidate: i, chosen: i === chosenIndex }));
  }
  await prisma.shot.update({ where: { id: shot.id }, data: { seedImageKey: chosen } });
  return chosen;
}

/** What canon says this shot shows (Film IR projects), for reviewing seed candidates. */
async function seedReviewContext(shot: ShotWithScene): Promise<GenerationContext | null> {
  const pkg = await filmPackageOf(shot.scene.projectId);
  const scene = pkg?.scenes.find((s) => s.index === shot.scene.index);
  if (!pkg || !scene?.shots.some((s) => s.index === shot.index)) return null;
  return checkContinuity(pkg, { sceneId: scene.id, shotIndex: shot.index }).correctedGenerationContext;
}

class SeedUnavailable extends Error {}

/** The seed still's prompt: compiled for the image model from canon (W4) when the project has a Film IR. */
async function seedPrompt(shot: ShotWithScene): Promise<string> {
  const pkg = await filmPackageOf(shot.scene.projectId);
  const scene = pkg?.scenes.find((s) => s.index === shot.scene.index);
  if (!pkg || !scene?.shots.some((s) => s.index === shot.index)) return shot.prompt;
  // The still is drawn in the production's animation style, if it has one (W11).
  const render = renderStyleFor(productionOf(shot.scene.project));
  return compileFor("openai-image", compileGeneration(pkg, scene.id, shot.index, undefined, { render })).prompt;
}

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
    const { shotId, modelId, projectId } = job.data;
    const shot = await loadShot(shotId);

    // ── PREVIS (W8b): the storyboard still only — no video ───────────────
    if (job.name === "previs") {
      if (shot.status === "READY" && shot.videoKey) return { shotId, previs: "already final" };
      try {
        const seedImageKey = await resolveSeedKey(shot);
        return { shotId, previs: seedImageKey ?? "text-led shot (no still)" };
      } catch (e) {
        if (!(e instanceof SeedUnavailable)) throw e;
        await recordDegradations(prisma as unknown as DegradationDb, projectId, [degradation("SEED_IMAGE_UNAVAILABLE", "shot", "No storyboard still could be drawn for this shot.", { refId: shotId, detail: { reason: e.message, pass: "previs" } })]);
        return { shotId, previs: "unavailable" };
      }
    }

    // ── Idempotent resume (C8): a shot already generated is a no-op ──────
    if (shot.status === "READY" && shot.videoKey) {
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
      await recordVersion(prisma as unknown as VersionDb, {
        projectId, assetType: "video", assetId: shotId, storageKey: cached.videoKey,
        derivation: { role: "clip", source: "cache", cacheKey: shot.cacheKey },
      });
      return { shotId, videoKey: cached.videoKey, gpuMs: 0, cached: true };
    }

    // ── Generate ────────────────────────────────────────────────────────
    // Capability-aware routing: a shot conditioned on a reference VIDEO
    // (variations/restyle of an uploaded clip) needs a v2v-capable engine.
    // The self-hosted Wan path can't do that — route the shot to the first
    // registered adapter that can (fal/cinematic), keeping the project's
    // engine for everything else. No capable engine -> fail with the reason.
    const drawn = isStillMotion(productionOf(shot.scene.project));
    let adapter: VideoModelAdapter = drawn ? stillMotion : registry.get(modelId);
    const wantsV2v = !drawn && Boolean(shot.referenceVideoKey && !PREVIEW_SEED.test(shot.referenceVideoKey));
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
      // A storybook page or comic panel IS the shot: without it there is nothing to move across.
      if (drawn) throw new UnrecoverableError(`This storybook/motion-comic shot needs its drawn page, but none could be drawn: ${reason}`);
      gaps.push(degradation("SEED_IMAGE_UNAVAILABLE", "shot", "No seed still for this shot; it was generated from text only.", {
        refId: shotId, detail: { reason },
      }));
    }
    // Continuity: inherit prior scenes into the prompt + reuse the same character
    // reference frames so identity is locked pixel-level (docs/28).
    const { preamble, wardrobeKeys, identityKeys, locationKeys, propKeys, previousEndFrame: endFrame, loraKeys, loraSha256, gaps: refGaps, canonContext } = await resolveContinuity(shot);
    gaps.push(...refGaps);
    // Reference pack (W6): seed → previous end frame → wardrobe → identity, capped.
    const pack = assembleReferencePack({ seed: seedKey, previousEndFrame: endFrame, wardrobe: wardrobeKeys, identity: identityKeys, location: locationKeys, props: propKeys });
    const request = buildShotRequest(shot, seedKey, preamble, pack.keys, loraKeys, loraSha256);
    // Job authorization reads the job's state fresh, immediately before dispatch.
    if (drawn) {
      if (!seedKey) throw new UnrecoverableError("This storybook/motion-comic shot has no drawn page (it was planned without a still).");
      request.fps = STILL_MOTION_FPS;
    }
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
    if (!drawn && adapter.id !== modelId) {
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
    // Quality gates (W5) before READY — never self-certify: the clip is
    // measured (ffprobe, black, freeze, sha256) and, for Film IR shots, a
    // frame is reviewed against canon. A blocking result regenerates the shot
    // with a new seed while attempts remain, then fails it (QUALITY_GATES /
    // VISUAL_REVIEW decide what blocks; unusable clips always block).
    const vMode = visualReviewMode();
    const inspection = await inspectClip((k, d) => storage.download(k, d), result.videoKey, { frame: Boolean(canonContext) && vMode !== "off", endFrame: true });
    const tech = judgeClip(inspection.facts, { durationSec: request.durationSec, width: request.width, height: request.height }, qualityMode());
    const gateResults: GateResult[] = [tech];
    let qcScore: number | null = null;
    if (canonContext && !tech.findings.some((f) => f.severity === "fatal")) {
      const deps = { ...visualGateDeps(projectId, { cameraType: shot.cameraType, cameraMovement: shot.cameraMovement }), grabFrames: async () => {
        if (!inspection.frames.length) throw new Error(inspection.frameError ?? "no frame could be taken from the clip");
        return inspection.frames;
      } };
      const visual = await gateVisual(deps, vMode, canonContext, result.videoKey, shotId);
      gaps.push(...visual.gaps);
      qcScore = visual.qcScore;
      gateResults.push(visualGateResult(visual, vMode));
    }
    for (const f of tech.findings.filter((x) => x.severity !== "fatal" && tech.outcome !== "fail")) {
      gaps.push(degradation("QUALITY_FLAGGED", "shot", `Technical check: ${f.message}.`, { refId: shotId, severity: f.severity === "fail" ? "major" : "info", detail: { code: f.code, ...f.detail } }));
    }
    const attempt = { made: job.attemptsMade, max: job.opts.attempts ?? 1 };
    await recordGates(prisma as unknown as GateDb, projectId, "shot", shotId, gateResults, attempt.made + 1);
    const decision = decideShot(gateResults, attempt);
    if (decision.action !== "accept") {
      await recordDegradations(prisma as unknown as DegradationDb, projectId, gaps);
      // A new seed for the next attempt — the same seed would reproduce the same defect.
      const seed = deterministicSeed(projectId, shot.scene.index, shot.index, "qc", attempt.made + 1);
      await prisma.shot.update({ where: { id: shotId }, data: { status: "QC_FAIL", qcScore, seed: BigInt(seed) } });
      if (decision.action === "regenerate") throw new Error(`QC_REGENERATE: ${decision.reason}`);
      throw new UnrecoverableError(`QUALITY_GATE_FAILED: ${decision.reason}`);
    }
    // End-state memory (W6): keep this shot's last frame for the next shot.
    if (inspection.endFrame) {
      await storage.putBytes(endFrameKey(projectId, shotId), inspection.endFrame, "image/jpeg").catch((e) =>
        console.warn(JSON.stringify({ event: "shot.end_frame", shotId, error: e instanceof Error ? e.message : String(e) })));
    }
    await recordDegradations(prisma as unknown as DegradationDb, projectId, gaps);
    if (adapter.runtimeCapabilities) await refreshGpuCaps(adapter.id, () => adapter.runtimeCapabilities!());

    await prisma.shot.update({
      where: { id: shotId },
      data: {
        status: "READY",
        videoKey: result.videoKey,
        thumbnailKey: result.thumbnailKey,
        ...(qcScore !== null ? { qcScore } : {}),
        seed: BigInt(result.seed),
        gpuMs: result.gpuMs,
        modelVersion: shot.modelVersion ?? MODEL_VERSIONS[modelId],
        attempts: { increment: 1 },
      },
    });
    // The shot points at its newest clip; every accepted clip stays a version (W8).
    await recordVersion(prisma as unknown as VersionDb, {
      projectId, assetType: "video", assetId: shotId, storageKey: result.videoKey,
      sha256: inspection.facts.sha256, durationSec: inspection.facts.durationSec,
      derivation: {
        role: "clip", source: "generated", model: modelId, modelVersion: shot.modelVersion ?? MODEL_VERSIONS[modelId] ?? null,
        seed: String(result.seed), attempt: attempt.made + 1, qcScore, cacheKey: shot.cacheKey, gpuMs: result.gpuMs,
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


    // Pause the project if it blew past its budget ceiling. Already-queued
    // shots then fail-fast at the gate above; the GPU drains and shuts down.
    if (shouldPauseForBudget(updatedProject.estimatedMs, updatedProject.spentMs)) {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "PAUSED", errorMessage: "Budget ceiling reached" },
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
  })();
});
