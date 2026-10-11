/**
 * Self-hosted voice engines behind the VoiceEngine boundary (docs/74; Part 4
 * §136, §150–155): qwen3-tts, cosyvoice-3 and gpt-sovits, each on its own GPU
 * deployment of apps/gpu-voice.
 *
 * Every call goes through the Media Runtime Gateway exactly like the video
 * worker's (docs/39): the Gateway Authority resolves the URL to a registered,
 * approved deployment, presigns one-time URLs for the objects the pod may read
 * and write — only inside the owner's own `voices/<owner>/` folder — and
 * mints a short-lived Ed25519 execution token bound to the deployment, the
 * action, the grant, the exact body and the voice authorization digest
 * (engine, approved checkpoint/revision/weights, and each input by content
 * hash). The pod holds no storage credentials.
 *
 * Nothing is trusted from the pod: before work, its /capabilities must name
 * this engine, the checkpoint and revision this worker is configured for
 * (VOICE_GPU_<ENGINE>_REVISION), and real execution — a placeholder result is
 * refused unless VOICE_GPU_ALLOW_PLACEHOLDER=1 (local wiring only). After work,
 * every granted output is verified (exists, size matches) before it is used.
 *
 * Engines return raw 16-bit WAV at their native rate; segmentation happens
 * before (jobs.ts) and mastering after (mastering.ts), outside the model.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PreparedVoiceCall, VoiceCallAuthorizer, VoicePrepareRequest } from "@cineforge/model-adapters";
import {
  ENGINE_REGISTRY,
  SELF_HOSTED_VOICE_ENGINES,
  VOICE_LICENCES,
  type EngineHealth,
  type SelfHostedVoiceEngineId,
  type SpeechSynthesisRequest,
  type SpeechSynthesisResult,
  type VoiceArtifactType,
  type VoiceEngine,
  type VoiceEngineArtifact,
  type VoiceEnrollmentRequest,
  type VoiceEnrollmentResult,
  type VoiceStyle,
} from "@cineforge/voice-contracts";

type Env = Record<string, string | undefined>;

export interface VoiceStorage {
  download(key: string, path: string): Promise<void>;
  upload(path: string, key: string, contentType?: string): Promise<void>;
  deleteKeys(keys: string[]): Promise<void>;
}

export interface SelfHostedDeps {
  authorizer(): Promise<VoiceCallAuthorizer>;
  storage(): Promise<VoiceStorage>;
  fetch: typeof fetch;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/** What each engine's enrollment stores (apps/gpu-voice/app/engines/*.py). */
const ARTIFACT: Record<SelfHostedVoiceEngineId, { type: VoiceArtifactType; ext: string; contentType: string }> = {
  "qwen3-tts": { type: "speaker_embedding", ext: "safetensors", contentType: "application/octet-stream" },
  "cosyvoice-3": { type: "speaker_embedding", ext: "safetensors", contentType: "application/octet-stream" },
  "gpt-sovits": { type: "prompt_audio", ext: "wav", contentType: "audio/wav" },
};

const SHA256 = /^[0-9a-f]{64}$/;
const CAPS_TTL_MS = 60_000;

interface GpuCaps {
  model?: string;
  engineVersion?: string;
  execution?: string;
  realExecution?: boolean;
  unavailableReason?: string | null;
  manifest?: { models?: { role: string; id: string; revision: string | null }[] };
}

interface Execution {
  mode?: string;
  vramPeakMb?: number | null;
  styleIgnored?: string[];
}

export class SelfHostedVoiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SelfHostedVoiceError";
  }
}

/** The default production wiring: the worker's Gateway Authority and S3 storage, built on first use. */
export function defaultSelfHostedDeps(): SelfHostedDeps {
  let authorizer: Promise<VoiceCallAuthorizer> | null = null;
  let storage: Promise<VoiceStorage> | null = null;
  return {
    authorizer: () => (authorizer ??= import("../gateway").then((m) => m.buildGatewayAuthority())),
    storage: () => (storage ??= import("../storage/storage").then((m) => new m.S3Storage())),
    fetch: (...a) => fetch(...a),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}

/** `voices/<owner>/…` → owner; anything else is not a self-hosted voice object. */
export function ownerOf(key: string): string | null {
  const m = /^voices\/([^/]+)\//.exec(key);
  return m && !key.includes("..") ? m[1]! : null;
}

export class SelfHostedVoiceEngine implements VoiceEngine {
  readonly version: string;
  readonly checkpoint: string;
  readonly revision: string | null;
  private readonly baseUrl: string;
  private caps: { at: number; value: GpuCaps } | null = null;
  /** Peak GPU memory of the last speech job, as the deployment reported it (benchmark VRAM). */
  lastVramPeakMb: number | null = null;
  private readonly shaCache = new Map<string, string>();

  constructor(readonly id: SelfHostedVoiceEngineId, private readonly env: Env, private readonly deps: SelfHostedDeps = defaultSelfHostedDeps()) {
    const names = SELF_HOSTED_VOICE_ENGINES[id];
    this.baseUrl = (env[names.url] ?? "").replace(/\/+$/, "");
    this.revision = env[names.revision]?.trim() || null;
    this.checkpoint = env[names.checkpoint]?.trim() || VOICE_LICENCES.find((l) => l.modelId === id)?.checkpoint.id || id;
    // Artifacts and cached speech belong to this exact checkpoint revision.
    const v = `${this.checkpoint}@${(this.revision ?? "unpinned").slice(0, 12)}`;
    // voice_engine_artifacts.engine_version holds at most 64 characters.
    this.version = v.length <= 64 ? v : `${this.id}:${createHash("sha256").update(this.checkpoint).digest("hex").slice(0, 16)}@${(this.revision ?? "unpinned").slice(0, 12)}`;
  }

  getCapabilities() {
    return ENGINE_REGISTRY[this.id]!.capabilities;
  }

  private allowPlaceholder() {
    return this.env.VOICE_GPU_ALLOW_PLACEHOLDER === "1";
  }

  // ── gateway plumbing ─────────────────────────────────────────────────
  private async statusHeaders(path: string): Promise<Record<string, string>> {
    const a = await this.deps.authorizer();
    return (await a.prepare({ baseUrl: this.baseUrl, path, scope: "status" })).headers;
  }

  private async capabilities(force = false): Promise<GpuCaps> {
    if (!force && this.caps && this.deps.now() - this.caps.at < CAPS_TTL_MS) return this.caps.value;
    const res = await this.deps.fetch(`${this.baseUrl}/capabilities`, { headers: await this.statusHeaders("/capabilities") });
    if (!res.ok) throw new SelfHostedVoiceError("GPU_UNREACHABLE", `${this.id} /capabilities ${res.status}`);
    const value = (await res.json()) as GpuCaps;
    this.caps = { at: this.deps.now(), value };
    return value;
  }

  /** The pod must run this engine, this checkpoint at this revision, for real. */
  private async checkDeployment(): Promise<void> {
    if (!this.baseUrl) throw new SelfHostedVoiceError("NOT_CONFIGURED", `${SELF_HOSTED_VOICE_ENGINES[this.id].url} not set`);
    if (!this.revision) throw new SelfHostedVoiceError("NOT_CONFIGURED", `${SELF_HOSTED_VOICE_ENGINES[this.id].revision} not set (the pinned checkpoint revision)`);
    const caps = await this.capabilities();
    if (caps.model !== this.id) throw new SelfHostedVoiceError("WRONG_ENGINE", `the deployment runs ${caps.model ?? "unknown"}, not ${this.id}`);
    const tts = caps.manifest?.models?.find((m) => m.role === "tts");
    if (!tts || tts.id !== this.checkpoint || tts.revision !== this.revision) {
      throw new SelfHostedVoiceError("WRONG_CHECKPOINT", `the deployment runs ${tts?.id ?? "?"}@${tts?.revision ?? "?"}, this worker is configured for ${this.checkpoint}@${this.revision}`);
    }
    if (!caps.realExecution && !this.allowPlaceholder()) {
      throw new SelfHostedVoiceError("NOT_REAL", `${this.id} is ${caps.execution ?? "not running"}${caps.unavailableReason ? ` (${caps.unavailableReason})` : ""} — no real model execution`);
    }
  }

  /** POST a prepared call; follow an async task to its end. */
  private async run<T>(path: string, call: PreparedVoiceCall): Promise<T> {
    const timeout = Number(this.env.VOICE_GPU_TIMEOUT_MS ?? 30 * 60_000);
    const started = this.deps.now();
    try {
      const res = await this.deps.fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cineforge-async": "1", ...call.headers },
        body: call.body,
      });
      if (!res.ok) throw new SelfHostedVoiceError(`HTTP_${res.status}`, `${this.id} ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status !== 202) return (await res.json()) as T;
      const { taskId } = (await res.json()) as { taskId: string };
      const poll = `/v1/jobs/${encodeURIComponent(taskId)}`;
      for (let wait = 500; ; wait = Math.min(wait * 2, 5_000)) {
        if (this.deps.now() - started > timeout) throw new SelfHostedVoiceError("TIMEOUT", `${this.id} ${path} ran longer than ${Math.round(timeout / 1000)}s`);
        await this.deps.sleep(wait);
        let r: Response;
        try {
          r = await this.deps.fetch(`${this.baseUrl}${poll}`, { headers: await this.statusHeaders(poll) });
        } catch {
          continue; // a proxy hiccup while polling is retried until the timeout
        }
        if (r.status >= 500) continue;
        if (!r.ok) throw new SelfHostedVoiceError(`HTTP_${r.status}`, `${this.id} ${poll} ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const s = (await r.json()) as { status: string; result?: T; httpStatus?: number; detail?: unknown };
        if (s.status === "done") return s.result as T;
        if (s.status === "error") throw new SelfHostedVoiceError(`HTTP_${s.httpStatus ?? 500}`, `${this.id} ${path} ${s.httpStatus}: ${JSON.stringify(s.detail).slice(0, 300)}`);
      }
    } catch (e) {
      await call.grant?.fail(e instanceof SelfHostedVoiceError ? e.code : "ERROR").catch(() => {});
      throw e;
    }
  }

  private async prepare(req: Omit<VoicePrepareRequest, "baseUrl" | "engineId">): Promise<PreparedVoiceCall> {
    return (await this.deps.authorizer()).prepareVoice({ ...req, baseUrl: this.baseUrl, engineId: this.id });
  }

  private refusePlaceholder(real: boolean | undefined, what: string) {
    if (!real && !this.allowPlaceholder()) throw new SelfHostedVoiceError("NOT_REAL", `${this.id} returned placeholder ${what}; refused`);
  }

  /** Content hash of a stored artifact: recorded at enrollment, else read from storage once. */
  private async artifactSha(a: VoiceEngineArtifact): Promise<string> {
    const recorded = a.metadata?.sha256;
    if (typeof recorded === "string" && SHA256.test(recorded)) return recorded;
    const hit = this.shaCache.get(a.uri);
    if (hit) return hit;
    const path = join(tmpdir(), `cf-voice-art-${randomUUID()}`);
    try {
      await (await this.deps.storage()).download(a.uri, path);
      const sha = createHash("sha256").update(await readFile(path)).digest("hex");
      this.shaCache.set(a.uri, sha);
      return sha;
    } finally {
      await rm(path, { force: true });
    }
  }

  // ── VoiceEngine ──────────────────────────────────────────────────────
  async enrollVoice(req: VoiceEnrollmentRequest): Promise<VoiceEnrollmentResult> {
    const owner = req.referenceKey ? ownerOf(req.referenceKey) : null;
    if (!req.userId || !req.referenceKey || owner !== req.userId) {
      throw new SelfHostedVoiceError("REFERENCE_SCOPE", `${this.id} enrolls only the owner's own stored recording (voices/<owner>/…)`);
    }
    await this.checkDeployment();
    const sha256 = createHash("sha256").update(await readFile(req.referencePath)).digest("hex");
    const reference = { key: req.referenceKey, sha256 };
    const art = ARTIFACT[this.id];
    const call = await this.prepare({
      path: "/v1/voices/enroll",
      scope: "voice:enroll",
      ownerId: req.userId,
      payload: { voiceId: req.voiceId, language: req.language, reference, ...(req.referenceText ? { referenceText: req.referenceText } : {}) },
      inputs: [reference],
      outputs: [{ name: "artifact", key: `voices/${req.userId}/${req.voiceId}/engines/${this.id}/{grant}.${art.ext}`, contentType: art.contentType }],
      outputField: "output",
    });
    const out = await this.run<{
      artifactType: VoiceArtifactType; artifactKey: string; artifactBytes: number; artifactSha256: string;
      metadata: Record<string, unknown>; gpuMs: number; realExecution: boolean; execution?: Execution;
    }>("/v1/voices/enroll", call);
    const granted = call.grant?.outputKeys.artifact;
    if (granted && out.artifactKey !== granted) {
      await call.grant?.fail("OUTPUT_KEY_MISMATCH");
      throw new SelfHostedVoiceError("OUTPUT_KEY_MISMATCH", `${this.id} wrote ${out.artifactKey}, not the granted ${granted}`);
    }
    await call.grant?.complete([{ key: out.artifactKey, bytes: out.artifactBytes }], out.gpuMs);
    if (!out.realExecution && !this.allowPlaceholder()) {
      await (await this.deps.storage()).deleteKeys([out.artifactKey]).catch(() => {});
      this.refusePlaceholder(false, "voice artifact");
    }
    if (out.artifactType !== art.type) throw new SelfHostedVoiceError("ARTIFACT_TYPE", `${this.id} returned a ${out.artifactType}`);
    return {
      artifacts: [{
        artifactType: out.artifactType,
        uri: out.artifactKey,
        metadata: { ...out.metadata, sha256: out.artifactSha256, bytes: out.artifactBytes, engineVersion: this.version, gpuMs: out.gpuMs, realExecution: out.realExecution },
      }],
    };
  }

  async synthesize(req: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    return (await this.synthesizeBatch([req]))[0]!;
  }

  /** Many lines, one GPU job per run of lines sharing voice, language and style (§155). */
  async synthesizeBatch(requests: SpeechSynthesisRequest[]): Promise<SpeechSynthesisResult[]> {
    if (!requests.length) return [];
    const results: SpeechSynthesisResult[] = new Array(requests.length);
    let i = 0;
    while (i < requests.length) {
      const first = requests[i]!;
      const key = groupKey(first);
      let j = i + 1;
      const max = Number(this.env.VOICE_GPU_BATCH_MAX ?? 100);
      while (j < requests.length && j - i < max && groupKey(requests[j]!) === key) j++;
      const group = await this.speakGroup(requests.slice(i, j));
      group.forEach((r, k) => (results[i + k] = r));
      i = j;
    }
    return results;
  }

  private async speakGroup(reqs: SpeechSynthesisRequest[]): Promise<SpeechSynthesisResult[]> {
    const { voice, language, style } = reqs[0]!;
    if (!voice) throw new SelfHostedVoiceError("VOICE_REQUIRED", `${this.id} speaks only enrolled voices (it has no built-in voices)`);
    if (voice.artifactType !== ARTIFACT[this.id].type) throw new SelfHostedVoiceError("ARTIFACT_TYPE", `${this.id} cannot use a ${voice.artifactType}`);
    const owner = ownerOf(voice.uri);
    if (!owner) throw new SelfHostedVoiceError("ARTIFACT_SCOPE", `${this.id} artifact ${voice.uri} is not in an owner's voices/ folder`);
    await this.checkDeployment();
    const ref = { key: voice.uri, sha256: await this.artifactSha(voice) };
    const items = reqs.map((r, n) => ({ id: `s${n}`, text: r.text }));
    const call = await this.prepare({
      path: "/v1/speech",
      scope: "voice:run",
      ownerId: owner,
      payload: {
        language,
        voice: { artifactType: voice.artifactType, key: ref.key, sha256: ref.sha256, metadata: gpuMetadata(voice) },
        ...(style ? { style: gpuStyle(style) } : {}),
        items,
      },
      inputs: [ref],
      outputs: items.map((it) => ({ name: it.id, key: `voices/${owner}/tmp/{grant}/${it.id}.wav`, contentType: "audio/wav" })),
    });
    const out = await this.run<{ items: { id: string; key: string; bytes: number; durationSec: number }[]; gpuMs: number; realExecution: boolean; execution?: Execution }>(
      "/v1/speech", call);
    this.lastVramPeakMb = typeof out.execution?.vramPeakMb === "number" ? out.execution.vramPeakMb : null;
    const storage = await this.deps.storage();
    const written = out.items.map((x) => ({ key: x.key, bytes: x.bytes }));
    try {
      await call.grant?.complete(written, out.gpuMs);
      this.refusePlaceholder(out.realExecution, "speech");
      const results: SpeechSynthesisResult[] = [];
      for (const [n, r] of reqs.entries()) {
        const it = out.items.find((x) => x.id === `s${n}`);
        const granted = call.grant?.outputKeys[`s${n}`] ?? it?.key;
        if (!it || it.key !== granted) throw new SelfHostedVoiceError("OUTPUT_MISSING", `${this.id} returned no audio for line ${n + 1}`);
        await storage.download(it.key, r.outPath);
        results.push({ path: r.outPath, format: "wav" });
      }
      return results;
    } finally {
      // The pod's output is a hand-off, not storage: removed once read.
      await storage.deleteKeys(out.items.map((x) => x.key)).catch(() => {});
    }
  }

  /**
   * Voice-similarity scoring for the benchmark: cosine similarity of the
   * deployment's speaker embeddings of each recording to the reference.
   */
  async similarity(referenceKey: string, paths: string[]): Promise<{ scores: number[]; scorer: string }> {
    const owner = ownerOf(referenceKey);
    if (!owner) throw new SelfHostedVoiceError("REFERENCE_SCOPE", "similarity reference must be an owner's voices/ object");
    await this.checkDeployment();
    const storage = await this.deps.storage();
    const scratch = `voices/${owner}/tmp/similarity-${randomUUID()}`;
    const keys: string[] = [];
    try {
      const reference = { key: referenceKey, sha256: await this.artifactSha({ artifactType: "reference_audio", uri: referenceKey }) };
      const candidates = [];
      for (const [n, p] of paths.entries()) {
        const key = `${scratch}/${n}.wav`;
        await storage.upload(p, key, "audio/wav");
        keys.push(key);
        candidates.push({ key, sha256: createHash("sha256").update(await readFile(p)).digest("hex") });
      }
      const call = await this.prepare({ path: "/v1/similarity", scope: "voice:score", ownerId: owner,
        payload: { reference, candidates }, inputs: [reference, ...candidates] });
      const out = await this.run<{ scores: Record<string, number>; realExecution: boolean; gpuMs: number }>("/v1/similarity", call);
      await call.grant?.complete([], out.gpuMs);
      this.refusePlaceholder(out.realExecution, "similarity scores");
      return { scores: candidates.map((c) => out.scores[c.key] ?? Number.NaN), scorer: `${this.id} speaker encoder (${this.version})` };
    } finally {
      if (keys.length) await storage.deleteKeys(keys).catch(() => {});
    }
  }

  /**
   * Voice erasure (W27): delete the stored artifact (only an owner's
   * voices/ object) and drop it from the deployment's warm cache. Eviction is
   * best effort — a sleeping pod has nothing warm, and the file is gone.
   */
  async deleteVoice(artifact: VoiceEngineArtifact): Promise<void> {
    const owner = ownerOf(artifact.uri);
    if (!owner) throw new SelfHostedVoiceError("ARTIFACT_SCOPE", `refusing to delete ${artifact.uri}: not an owner's voices/ object`);
    await (await this.deps.storage()).deleteKeys([artifact.uri]);
    if (!this.baseUrl) return;
    try {
      const call = await this.prepare({ path: "/v1/voices/evict", scope: "voice:evict", ownerId: owner, payload: { keys: [artifact.uri] } });
      await this.deps.fetch(`${this.baseUrl}/v1/voices/evict`, { method: "POST", headers: { "content-type": "application/json", ...call.headers }, body: call.body });
    } catch {
      // best effort
    }
  }

  async health(): Promise<EngineHealth> {
    try {
      await this.checkDeployment();
      const res = await this.deps.fetch(`${this.baseUrl}/health`, { headers: await this.statusHeaders("/health") });
      if (!res.ok) return { ok: false, detail: `/health ${res.status}` };
      const h = (await res.json()) as { status?: string; execution?: string };
      return h.status === "ok" ? { ok: true, detail: `${this.version} (${h.execution})` } : { ok: false, detail: JSON.stringify(h).slice(0, 200) };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  async unload(): Promise<void> {}
}

function gpuStyle(s: VoiceStyle) {
  return { ...(s.speed !== undefined ? { speed: s.speed } : {}), ...(s.emotion ? { emotion: s.emotion } : {}),
    ...(s.energy !== undefined ? { energy: s.energy } : {}), ...(s.pitch !== undefined ? { pitch: s.pitch } : {}) };
}

/** What the GPU needs from the stored artifact metadata (GPT-SoVITS: the prompt transcript and language). */
function gpuMetadata(a: VoiceEngineArtifact): Record<string, unknown> {
  const m = a.metadata ?? {};
  const out: Record<string, unknown> = {};
  for (const k of ["mode", "promptText", "promptLang", "format"]) if (m[k] !== undefined) out[k] = m[k];
  return out;
}

function groupKey(r: SpeechSynthesisRequest): string {
  return JSON.stringify([r.voice?.artifactType ?? null, r.voice?.uri ?? null, r.language, r.style ?? null]);
}
