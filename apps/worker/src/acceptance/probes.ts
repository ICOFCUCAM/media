/**
 * The real-provider probes (DirectorOS Part 2 §76; W10). One per provider the
 * platform can route to. Each makes ONE real, small, paid call through the same
 * adapter production uses and verifies what came back (./verify.ts).
 *
 *   planning   Claude and OpenAI: the master plan call for a 2-scene film,
 *              validated by the Film IR validator chain and compiled
 *   image      GPT-image: one still, decoded and measured
 *              ComfyUI: GATED until docs/39 Phase 1 is operationally complete
 *   video      Wan / Hunyuan on RunPod through the Media Runtime Gateway, and
 *              the hosted fal tier: one short clip, downloaded and QC'd; a
 *              self-hosted runtime must report real model execution
 *   voice      OpenAI TTS and fal MiniMax: one line, measured and mastered;
 *              self-hosted engines GATED
 *   music      fal text-to-music: a 10 s cue, measured
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AnthropicProvider,
  compileFilm,
  DEFAULT_MODEL,
  IntelligenceRouter,
  OpenAIProvider,
  parseRoutes,
  planFilm,
  type DecisionRecord,
  type ProductionConstraints,
} from "@cineforge/movie";
import { buildClusterRegistry, buildOpenAIProviders, falFindUrl, falRunQueue, type ExternalHooks, type JobContext } from "@cineforge/model-adapters";
import { ENGINE_REGISTRY } from "@cineforge/voice-contracts";
import { imageProvider, imageProviderStatuses } from "../images/providers";
import { lipSyncProvider } from "../lipsync/provider";
import { ffmpeg } from "../ffmpeg/ffmpeg";
import { FalMinimaxEngine, OpenAiTtsEngine } from "../voice/engines";
import { SCORE_MODEL } from "../audio/score";
import type { Capability, ProbeResult, ProbeStatus } from "./report";
import { ArtifactError, verifyAudio, verifyClip, verifyImage } from "./verify";

type Env = Record<string, string | undefined>;

/** What a probe needs from the outside world (storage and gateway only for video). */
export interface ProbeDeps {
  env: Env;
  /** Fresh scratch directory for this probe. */
  dir: string;
  fetch: typeof fetch;
  /** Read a stored object (video outputs land in storage). */
  download?: (key: string, to: string) => Promise<void>;
  /** Registry hooks for video (storage + Media Runtime Gateway authority). */
  videoHooks?: () => ExternalHooks;
}

export interface Probe {
  id: string;
  capability: Capability;
  provider: string;
  /** null = can run; otherwise why it cannot in this environment. */
  ready(env: Env): { status: Extract<ProbeStatus, "NOT_CONFIGURED" | "GATED">; reason: string } | null;
  run(d: ProbeDeps): Promise<Record<string, unknown>>;
}

const need = (env: Env, keys: string[]) => {
  const missing = keys.filter((k) => !env[k]);
  return missing.length ? { status: "NOT_CONFIGURED" as const, reason: `not configured (${missing.join(", ")})` } : null;
};

/** The planning brief and budget: a 2-scene, 20-second film (one small paid call). */
export const PROBE_BRIEF =
  "A lighthouse keeper finds a message in a bottle addressed to her, written in her own handwriting.";
export const PROBE_CONSTRAINTS: ProductionConstraints = {
  sceneCount: 2, sceneSec: 10, sceneTolerance: 0.2, maxShotsPerScene: 3, maxShotSec: 5, targetSeconds: 20, filmTolerance: 0.2,
};

function planningProbe(provider: "anthropic" | "openai"): Probe {
  const modelOf = (env: Env): string | null => {
    const routed = parseRoutes(env).film_plan.find((r) => r.provider === provider)?.model;
    if (routed) return routed;
    if (provider === "anthropic") return env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    return env.OPENAI_PLAN_MODEL || null;
  };
  return {
    id: `planning:${provider}`,
    capability: "planning",
    provider,
    ready(env) {
      if (provider === "anthropic") {
        return env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN ? null : { status: "NOT_CONFIGURED", reason: "not configured (ANTHROPIC_API_KEY)" };
      }
      return need(env, ["OPENAI_API_KEY"]) ?? (modelOf(env) ? null : { status: "NOT_CONFIGURED", reason: "no OpenAI planning model (OPENAI_PLAN_MODEL or an openai route for film_plan)" });
    },
    async run({ env }) {
      const model = modelOf(env)!;
      const decisions: DecisionRecord[] = [];
      // Only this provider: a probe must never pass on another provider's answer.
      const routes = `film_plan=${provider}:${model};film_plan_revision=${provider}:${model}`;
      const router = new IntelligenceRouter([new AnthropicProvider(env), new OpenAIProvider(env)], { ...env, INTELLIGENCE_ROUTES: routes }, (d) => {
        decisions.push(d);
      });
      const plan = await planFilm(router, PROBE_BRIEF, PROBE_CONSTRAINTS);
      const compiled = compileFilm(plan.pkg);
      const shots = compiled.scenes.reduce((n, s) => n + s.shots.length, 0);
      if (plan.provider !== provider) throw new ArtifactError(`answered by ${plan.provider}, not ${provider}`);
      if (!shots) throw new ArtifactError("the plan compiled to no shots");
      return {
        model: plan.model, revised: plan.revised, fixedIssues: plan.fixedIssues.map((i) => i.code),
        scenes: plan.pkg.scenes.length, cast: plan.pkg.cast.length, shots,
        inputTokens: decisions.reduce((n, d) => n + (d.inputTokens ?? 0), 0),
        outputTokens: decisions.reduce((n, d) => n + (d.outputTokens ?? 0), 0),
        calls: decisions.length,
      };
    },
  };
}

const imageOpenAI: Probe = {
  id: "image:openai",
  capability: "image",
  provider: "openai",
  ready: (env) => need(env, ["OPENAI_API_KEY"]),
  async run({ env, dir }) {
    let captured: { bytes: Uint8Array; contentType: string } | null = null;
    const { image } = buildOpenAIProviders(env as never, async (bytes, contentType) => {
      captured = { bytes, contentType };
      return "probe://image";
    });
    const out = await image!.generate({ prompt: "A weathered lighthouse on a rocky coast at dusk, film still, 35mm", width: 1280, height: 720 });
    const got = captured as { bytes: Uint8Array; contentType: string } | null;
    if (!got) throw new ArtifactError("the provider returned no image bytes", { imageKey: out.imageKey.slice(0, 40) });
    return { contentType: got.contentType, ...(await verifyImage(got.bytes, dir)) };
  },
};

const imageFal: Probe = {
  id: "image:fal",
  capability: "image",
  provider: "fal",
  ready: (env) => need(env, ["FAL_KEY"]),
  async run({ env, dir }) {
    let captured: { bytes: Uint8Array; contentType: string } | null = null;
    const { provider } = imageProvider(async (key, bytes, contentType) => {
      captured = { bytes, contentType };
      return key;
    }, { ...env, IMAGE_PROVIDERS: "fal", S3_BUCKET: env.S3_BUCKET ?? "probe" });
    if (!provider) throw new ArtifactError("the fal image provider could not be built");
    const out = await provider.generate("A weathered lighthouse on a rocky coast at dusk, film still, 35mm", "probe://image", { width: 1280, height: 720 }, { seed: 7 });
    const got = captured as { bytes: Uint8Array; contentType: string } | null;
    if (!got) throw new ArtifactError("the provider returned no image bytes");
    return { contentType: got.contentType, model: out.model, seed: out.seed, sha256: out.sha256, ...(await verifyImage(got.bytes, dir)) };
  },
};

/**
 * Lip sync (W21): a face drawn by the fal image model, held for 3 s, given a
 * spoken-length tone, through the lip-sync model; the result must be a real
 * clip of the same length.
 */
const lipSyncFal: Probe = {
  id: "lipsync:fal",
  capability: "video",
  provider: "fal",
  ready: (env) => need(env, ["FAL_KEY"]),
  async run({ env, dir }) {
    let face: Uint8Array | null = null;
    const { provider: images } = imageProvider(async (key, bytes) => { face = bytes; return key; }, { ...env, IMAGE_PROVIDERS: "fal", S3_BUCKET: env.S3_BUCKET ?? "probe" });
    if (!images) throw new ArtifactError("the fal image provider could not be built");
    await images.generate("Front-facing head-and-shoulders photo of a woman speaking, mouth slightly open, neutral background, soft light", "probe://face", { width: 768, height: 768 }, { seed: 11 });
    if (!face) throw new ArtifactError("no face image");
    const still = join(dir, "face.png");
    const clip = join(dir, "face.mp4");
    const tone = join(dir, "speech.wav");
    await writeFile(still, face);
    await ffmpeg(["-y", "-loop", "1", "-i", still, "-t", "3", "-r", "25", "-vf", "scale=512:512,format=yuv420p", "-c:v", "libx264", clip]);
    await ffmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=3", "-af", "volume=0.5,tremolo=f=4:d=0.9", tone]);
    const ls = lipSyncProvider(env);
    if (!ls) throw new ArtifactError("the lip-sync provider could not be built");
    const { readFile } = await import("node:fs/promises");
    const out = await ls.sync(new Uint8Array(await readFile(clip)), new Uint8Array(await readFile(tone)));
    const path = join(dir, "lipsync.mp4");
    await writeFile(path, out);
    return { model: ls.model, ...(await verifyClip(path, { durationSec: 3, width: 256, height: 256 }, true)) };
  },
};

const imageComfy: Probe = {
  id: "image:comfyui",
  capability: "image",
  provider: "comfyui",
  ready(env) {
    const s = imageProviderStatuses({ ...env, IMAGE_PROVIDERS: "comfyui" })[0]!;
    return s.gated ? { status: "GATED", reason: s.gated } : { status: "NOT_CONFIGURED", reason: "no ComfyUI adapter" };
  },
  async run() {
    throw new Error("unreachable: ComfyUI is gated");
  },
};

/** The shot every video probe asks for: short, small, a single subject. */
export const PROBE_SHOT = { durationSec: 2, width: 832, height: 480, fps: 16 } as const;

function videoProbe(id: string, modelId: (env: Env) => string, required: string[], hosted: boolean): Probe {
  return {
    id: `video:${id}`,
    capability: "video",
    provider: id,
    ready(env) {
      const urls = id === "wan" ? env.WAN_GPU_URLS || env.WAN_GPU_URL : id === "hunyuan" ? env.HUNYUAN_GPU_URLS || env.HUNYUAN_GPU_URL : "set";
      if (!urls) return { status: "NOT_CONFIGURED", reason: `not configured (${id.toUpperCase()}_GPU_URL)` };
      return need(env, required);
    },
    async run({ env, dir, download, videoHooks }) {
      if (!download || !videoHooks) throw new Error("video probes need storage");
      const registry = buildClusterRegistry(env, videoHooks());
      const adapter = registry.get(modelId(env));
      const job: JobContext = {
        shotId: `acceptance-${id}-${Date.now()}`, projectId: "_acceptance", shotStatus: "GENERATING", projectStatus: "GENERATING", modelId: adapter.id,
      };
      const out = await adapter.generate({
        prompt: "A lighthouse beam sweeps across dark sea waves at night, slow dolly in, cinematic",
        negativePrompt: "blurry, watermark, text",
        seed: 1234, ...PROBE_SHOT, job,
      });
      const local = join(dir, "clip.mp4");
      await download(out.videoKey, local);
      // A hosted API either generated the clip or failed; a self-hosted runtime has a placeholder mode and must say which ran.
      const real = hosted ? true : out.realExecution;
      return { modelId: adapter.id, videoKey: out.videoKey, gpuMs: out.gpuMs ?? null, ...(await verifyClip(local, PROBE_SHOT, real)) };
    },
  };
}

const LINE = "The light has not failed in forty years. Tonight it will not fail either.";

function voiceProbe(id: "openai-tts" | "fal-minimax"): Probe {
  return {
    id: `voice:${id}`,
    capability: "voice",
    provider: id,
    ready: (env) => need(env, ENGINE_REGISTRY[id]!.requires),
    async run({ env, dir }) {
      const engine = id === "openai-tts" ? new OpenAiTtsEngine(env) : new FalMinimaxEngine(env);
      const res = await engine.synthesize({ text: LINE, language: "en", voice: null, outPath: join(dir, `line.${id === "openai-tts" ? "wav" : "mp3"}`) });
      return { engine: id, version: engine.version, format: res.format, ...(await verifyAudio(res.path, dir, 2)) };
    },
  };
}

function gatedVoiceProbes(): Probe[] {
  return Object.values(ENGINE_REGISTRY).filter((d) => d.gated).map((d) => ({
    id: `voice:${d.id}`, capability: "voice" as const, provider: d.id,
    ready: () => ({ status: "GATED" as const, reason: d.gated! }),
    run: async () => { throw new Error("unreachable: gated"); },
  }));
}

const musicFal: Probe = {
  id: "music:fal",
  capability: "music",
  provider: "fal",
  ready: (env) => need(env, ["FAL_KEY"]),
  async run({ env, dir, fetch: f }) {
    const result = await falRunQueue(env.FAL_KEY!, SCORE_MODEL, { prompt: "Cinematic film score, instrumental, no vocals; mood: lonely, hopeful; solo cello and sea ambience", seconds_total: 10 }, { timeoutMs: 8 * 60_000 });
    const url = falFindUrl(result);
    if (!url) throw new ArtifactError("the music model returned no audio URL");
    const res = await f(url);
    if (!res.ok) throw new ArtifactError(`audio download ${res.status}`);
    const type = res.headers.get("content-type") ?? "audio/wav";
    const path = join(dir, `cue.${type.includes("mpeg") ? "mp3" : type.includes("ogg") ? "ogg" : "wav"}`);
    await writeFile(path, new Uint8Array(await res.arrayBuffer()));
    return { model: SCORE_MODEL, contentType: type, ...(await verifyAudio(path, dir, 5)) };
  },
};

export function allProbes(): Probe[] {
  return [
    planningProbe("anthropic"),
    planningProbe("openai"),
    imageOpenAI, imageFal,
    imageComfy,
    lipSyncFal,
    videoProbe("wan", () => "wan-2.1", ["DATABASE_URL", "S3_BUCKET"], false),
    videoProbe("hunyuan", () => "hunyuan", ["DATABASE_URL", "S3_BUCKET"], false),
    videoProbe("fal", (env) => env.FAL_MODEL_ID ?? "cinematic", ["FAL_KEY", "S3_BUCKET"], true),
    voiceProbe("openai-tts"),
    voiceProbe("fal-minimax"),
    ...gatedVoiceProbes(),
    musicFal,
  ];
}

/** Run probes one at a time (paid calls; a failure never stops the others). */
export async function runProbes(
  probes: Probe[],
  deps: Omit<ProbeDeps, "dir"> & { dir: string },
  log: (r: ProbeResult) => void = () => {},
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const p of probes) {
    const base = { id: p.id, capability: p.capability, provider: p.provider };
    const blocked = p.ready(deps.env);
    let r: ProbeResult;
    if (blocked) {
      r = { ...base, status: blocked.status, reason: blocked.reason, evidence: {}, latencyMs: null };
    } else {
      const dir = join(deps.dir, p.id.replace(/[^a-z0-9-]/gi, "_"));
      await mkdir(dir, { recursive: true });
      const t0 = Date.now();
      try {
        const evidence = await p.run({ ...deps, dir });
        r = { ...base, status: "PASS", reason: null, evidence, latencyMs: Date.now() - t0 };
      } catch (e) {
        const evidence = e instanceof ArtifactError ? e.evidence : {};
        r = { ...base, status: "FAIL", reason: (e instanceof Error ? e.message : String(e)).slice(0, 500), evidence, latencyMs: Date.now() - t0 };
      }
    }
    results.push(r);
    log(r);
  }
  return results;
}
