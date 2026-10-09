/**
 * Voice job runner (Part 4 §159, §164; W7a). One voice_jobs row moves through
 *
 *   queued → claimed → loading_model → generating → post_processing → completed
 *
 * or ends failed (cancelled is the API's). Terminal states are final (the
 * database refuses to change them), so a retried BullMQ attempt on a finished
 * job is a no-op.
 *
 *   voice.enroll       consent checked, recording analysed and judged, the
 *                      routed engine enrolls the voice, its artifact stored
 *   speech.synthesis   script segmented, each segment spoken and mastered,
 *                      joined into audio/<jobId>/final.wav
 *   speech.batch       the same per item → audio/<jobId>/<itemId>.wav
 *
 * A voice is used only by its owner. A cloned voice never falls back to a
 * stock narrator: if no engine can speak it, the job fails and says why.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BatchSpeechBody,
  SpeechBody,
  judgeVoiceSample,
  routeVoice,
  segmentScript,
  type VoiceEngine,
  type VoiceEngineArtifact,
  type VoiceJobState,
  type VoiceJobType,
  type VoiceQualityReport,
  type VoiceSampleFacts,
  type VoiceStyle,
} from "@cineforge/voice-contracts";
import type { SpeechMeasure } from "./mastering";

export interface VoiceJobRow {
  id: string;
  userId: string;
  voiceId: string | null;
  type: VoiceJobType;
  status: VoiceJobState;
  payload: Record<string, unknown>;
}

export interface VoiceRow {
  id: string;
  userId: string;
  status: string;
  sampleKey: string | null;
  language: string | null;
  consentType: string | null;
  consentConfirmedAt: Date | null;
  provider: string | null;
  providerVoiceId: string | null;
}

export interface JobUpdate {
  status?: VoiceJobState;
  engine?: string;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface VoiceUpdate {
  status?: "CLONING" | "READY" | "FAILED";
  errorMessage?: string | null;
  quality?: VoiceQualityReport;
  language?: string;
  provider?: string;
  providerVoiceId?: string;
}

export interface VoiceJobDeps {
  env: Record<string, string | undefined>;
  db: {
    job(id: string): Promise<VoiceJobRow | null>;
    setJob(id: string, data: JobUpdate): Promise<void>;
    voice(id: string): Promise<VoiceRow | null>;
    setVoice(id: string, data: VoiceUpdate): Promise<void>;
    artifact(voiceId: string, engineId: string, engineVersion: string): Promise<VoiceEngineArtifact | null>;
    saveArtifacts(voiceId: string, engineId: string, engineVersion: string, artifacts: VoiceEngineArtifact[]): Promise<void>;
  };
  engine(id: string): VoiceEngine | null;
  download(key: string, dest: string): Promise<void>;
  upload(path: string, key: string, contentType: string): Promise<void>;
  analyze(path: string): Promise<VoiceSampleFacts>;
  master(input: string, output: string): Promise<void>;
  join(files: string[], output: string, dir: string): Promise<void>;
  measure(path: string): Promise<SpeechMeasure>;
  progress?(fraction: number): Promise<void>;
}

/** An expected refusal (bad input, no consent, nothing can speak it): the job fails with this message. */
export class VoiceJobError extends Error {}

const TERMINAL: VoiceJobState[] = ["completed", "failed", "cancelled"];
/** Longest text one job may speak (cost ceiling; split longer work into several jobs). */
const maxChars = (env: VoiceJobDeps["env"]) => Number(env.VOICE_MAX_CHARS ?? 20_000);

export async function runVoiceJob(jobId: string, deps: VoiceJobDeps): Promise<{ status: VoiceJobState }> {
  const job = await deps.db.job(jobId);
  if (!job) return { status: "failed" };
  if (TERMINAL.includes(job.status)) return { status: job.status };
  const set = (status: VoiceJobState, extra: JobUpdate = {}) => deps.db.setJob(jobId, { status, ...extra });
  await set("claimed", { startedAt: new Date() });
  const dir = await mkdtemp(join(tmpdir(), "cf-voice-"));
  try {
    const result =
      job.type === "voice.enroll" ? await enroll(job, deps, dir, set) : await speak(job, deps, dir, set);
    await set("completed", { result, completedAt: new Date() });
    return { status: "completed" };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 2000);
    await set("failed", { error: message, completedAt: new Date() });
    if (job.type === "voice.enroll" && job.voiceId) await deps.db.setVoice(job.voiceId, { status: "FAILED", errorMessage: message.slice(0, 400) }).catch(() => {});
    if (!(e instanceof VoiceJobError)) console.error(`[voice-engine] job ${jobId} failed:`, e);
    return { status: "failed" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type Set = (status: VoiceJobState, extra?: JobUpdate) => Promise<void>;

/** The caller's own voice, or a refusal that does not reveal whether someone else's exists. */
async function ownedVoice(job: VoiceJobRow, deps: VoiceJobDeps): Promise<VoiceRow> {
  const voice = job.voiceId ? await deps.db.voice(job.voiceId) : null;
  if (!voice || voice.userId !== job.userId) throw new VoiceJobError("voice not found");
  return voice;
}

function pickEngine(deps: VoiceJobDeps, needs: { cloning: boolean; language: string }): VoiceEngine {
  const choice = routeVoice(needs, deps.env);
  const engine = choice.engine ? deps.engine(choice.engine.id) : null;
  if (!engine) {
    const why = choice.passedOver.map((p) => `${p.id}: ${p.reason}`).join("; ") || "no engines configured (VOICE_ENGINES)";
    throw new VoiceJobError(`no voice engine can ${needs.cloning ? "use a cloned voice" : "speak"} in ${needs.language} right now — ${why}`);
  }
  return engine;
}

async function enroll(job: VoiceJobRow, deps: VoiceJobDeps, dir: string, set: Set): Promise<Record<string, unknown>> {
  const voice = await ownedVoice(job, deps);
  if (!voice.consentType || !voice.consentConfirmedAt)
    throw new VoiceJobError("consent is required: confirm the voice is yours or that you are authorised to use it");
  if (!voice.sampleKey) throw new VoiceJobError("no reference recording uploaded");
  if (!voice.sampleKey.startsWith(`voices/${job.userId}/`)) throw new VoiceJobError("the reference recording must be your own upload");
  const language = voice.language ?? "en";
  await deps.db.setVoice(voice.id, { status: "CLONING", errorMessage: null });

  await set("loading_model");
  const engine = pickEngine(deps, { cloning: true, language });
  await deps.db.setJob(job.id, { engine: engine.id });
  const ext = voice.sampleKey.split(".").pop()?.toLowerCase() ?? "wav";
  const sample = join(dir, `reference.${ext}`);
  await deps.download(voice.sampleKey, sample);
  let facts: VoiceSampleFacts;
  try {
    facts = await deps.analyze(sample);
  } catch (e) {
    throw new VoiceJobError(`the recording could not be read (${e instanceof Error ? e.message : String(e)})`);
  }
  const quality = judgeVoiceSample(facts);
  await deps.db.setVoice(voice.id, { quality, language });
  if (quality.quality === "poor") throw new VoiceJobError(`the recording is not good enough to clone: ${quality.issues.join(" ")}`);

  await set("generating");
  const { artifacts } = await engine.enrollVoice({ voiceId: voice.id, language, referencePath: sample });
  if (!artifacts.length) throw new Error(`${engine.id} returned no voice artifact`);
  await deps.db.saveArtifacts(voice.id, engine.id, engine.version, artifacts);

  await set("post_processing");
  const providerId = artifacts.find((a) => a.artifactType === "provider_voice_id")?.uri;
  // The Voice Lab's reader still speaks through provider_voice_id.
  await deps.db.setVoice(voice.id, { status: "READY", errorMessage: null, provider: engine.id, ...(providerId ? { providerVoiceId: providerId } : {}) });
  return { voice_id: voice.id, status: "ready", quality };
}

interface Item {
  id: string;
  text: string;
}

async function speak(job: VoiceJobRow, deps: VoiceJobDeps, dir: string, set: Set): Promise<Record<string, unknown>> {
  const batch = job.type === "speech.batch";
  const parsed = batch ? BatchSpeechBody.safeParse(job.payload) : SpeechBody.safeParse(job.payload);
  if (!parsed.success) throw new VoiceJobError(`invalid request: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  const body = parsed.data;
  const items: Item[] = "items" in body ? body.items : [{ id: "final", text: body.text }];
  const total = items.reduce((n, i) => n + i.text.length, 0);
  if (total > maxChars(deps.env)) throw new VoiceJobError(`text too long for one job (${total} > ${maxChars(deps.env)} characters) — split it into several jobs`);
  const style: VoiceStyle | undefined = body.style;

  const voice = job.voiceId ? await ownedVoice(job, deps) : null;
  if (voice && voice.status !== "READY") throw new VoiceJobError("the voice is not ready yet");

  await set("loading_model");
  const engine = pickEngine(deps, { cloning: !!voice, language: body.language });
  await deps.db.setJob(job.id, { engine: engine.id });
  let artifact: VoiceEngineArtifact | null = null;
  if (voice) {
    artifact = await deps.db.artifact(voice.id, engine.id, engine.version);
    // Voices cloned by the Voice Lab before W7 carry the provider id on the voice itself.
    if (!artifact && voice.provider === engine.id && voice.providerVoiceId) artifact = { artifactType: "provider_voice_id", uri: voice.providerVoiceId };
    if (!artifact) throw new VoiceJobError(`the voice is not enrolled with the current voice engine — enroll it again`);
  }

  await set("generating");
  const limit = Math.min(engine.getCapabilities().maxChars, 1000);
  const plan = items.map((item) => ({ item, segments: segmentScript(item.text, limit) }));
  const count = plan.reduce((n, p) => n + p.segments.length, 0);
  let done = 0;
  const raws: string[][] = [];
  for (const [i, p] of plan.entries()) {
    const files: string[] = [];
    for (const seg of p.segments) {
      const out = join(dir, `raw-${i}-${seg.sequence}`);
      const r = await engine.synthesize({ text: seg.text, language: body.language, voice: artifact, style, outPath: out, voiceId: voice?.id ?? null });
      files.push(r.path);
      await deps.progress?.(++done / count);
    }
    raws.push(files);
  }

  await set("post_processing");
  const delivered: Record<string, unknown>[] = [];
  for (const [i, p] of plan.entries()) {
    const mastered: string[] = [];
    for (const [j, raw] of raws[i]!.entries()) {
      const m = join(dir, `mastered-${i}-${j}.wav`);
      await deps.master(raw, m);
      mastered.push(m);
    }
    const final = join(dir, `item-${i}.wav`);
    await deps.join(mastered, final, dir);
    const measured = await deps.measure(final);
    const key = `audio/${job.id}/${p.item.id}.wav`;
    await deps.upload(final, key, "audio/wav");
    delivered.push({
      id: p.item.id,
      audio_key: key,
      duration_seconds: +measured.durationSec.toFixed(3),
      segments: p.segments.length,
      loudness_lufs: measured.integratedLufs,
      true_peak_dbtp: measured.truePeakDbtp,
    });
  }
  const format = { format: "wav", sample_rate: 48000, channels: 1 };
  if (batch) return { items: delivered.map(({ segments: _s, loudness_lufs: _l, true_peak_dbtp: _t, ...rest }) => rest), ...format };
  const { id: _id, ...one } = delivered[0]!;
  return { ...one, ...format };
}
