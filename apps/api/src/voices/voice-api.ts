/**
 * The /v1 Voice API logic (Part 4 §173; W7a, docs/51), kept free of Nest and
 * Prisma so it is tested directly. Every request returns at once with a job;
 * the worker does the work. Rules:
 *
 *  - a voice is enrolled only with consent, from the caller's own upload;
 *  - a voice is read, used or deleted only by its owner — anyone else gets
 *    404, never "forbidden", so ids do not leak;
 *  - which engine serves a voice is never returned (engine internals stay in
 *    voice_engine_artifacts and voice_jobs.engine).
 */
import { BadRequestException, ConflictException, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { BatchSpeechBody, EnrollVoiceBody, SpeechBody, type VoiceJobState, type VoiceJobType } from "@cineforge/voice-contracts";
import type { ZodType } from "zod";

export interface StoredVoice {
  id: string;
  userId: string;
  name: string;
  status: string;
  language: string | null;
  quality: unknown;
  consentType: string | null;
  consentConfirmedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface StoredJob {
  id: string;
  userId: string;
  type: string;
  status: string;
  result: unknown;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface VoiceStore {
  createVoice(v: { userId: string; name: string; sampleKey: string; language: string; consentType: string; consentConfirmedAt: Date }): Promise<{ id: string }>;
  voice(id: string): Promise<StoredVoice | null>;
  deleteVoice(id: string): Promise<void>;
  createJob(j: { userId: string; voiceId: string | null; type: VoiceJobType; payload: Record<string, unknown> }): Promise<{ id: string }>;
  job(id: string): Promise<StoredJob | null>;
  activeJobs(userId: string): Promise<number>;
}

export interface VoiceApiDeps {
  store: VoiceStore;
  enqueue(jobId: string, type: VoiceJobType): Promise<void>;
  env: Record<string, string | undefined>;
  now?: () => Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T>(schema: ZodType<T, any, any>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException({ error: "invalid_request", issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  return r.data;
}

/** The public status of a voice (the database's states are an implementation detail). */
export function voiceStatus(status: string): "processing" | "ready" | "failed" {
  return status === "READY" ? "ready" : status === "FAILED" ? "failed" : "processing";
}

export class VoiceApi {
  constructor(private readonly deps: VoiceApiDeps) {}

  private get maxActive() { return Number(this.deps.env.VOICE_MAX_ACTIVE_JOBS ?? 5); }
  private get maxChars() { return Number(this.deps.env.VOICE_MAX_CHARS ?? 20_000); }

  private async owned(userId: string, id: string): Promise<StoredVoice> {
    const v = UUID.test(id) ? await this.deps.store.voice(id) : null;
    if (!v || v.userId !== userId) throw new NotFoundException("voice not found");
    return v;
  }

  private async admit(userId: string) {
    if ((await this.deps.store.activeJobs(userId)) >= this.maxActive)
      throw new HttpException(`too many voice jobs in progress (limit ${this.maxActive}) — wait for one to finish`, HttpStatus.TOO_MANY_REQUESTS);
  }

  private async submit(userId: string, voiceId: string | null, type: VoiceJobType, payload: Record<string, unknown>) {
    const job = await this.deps.store.createJob({ userId, voiceId, type, payload });
    await this.deps.enqueue(job.id, type);
    return job.id;
  }

  /** POST /v1/voices */
  async enroll(userId: string, body: unknown) {
    const b = parse(EnrollVoiceBody, body);
    const key = b.reference_audio_key;
    if (!key.startsWith(`voices/${userId}/`) || key.includes("..")) throw new BadRequestException("reference_audio_key must be one of your own uploads (voices/<your id>/…)");
    await this.admit(userId);
    const voice = await this.deps.store.createVoice({
      userId, name: b.name, sampleKey: key, language: b.language,
      consentType: b.consent.type, consentConfirmedAt: (this.deps.now ?? (() => new Date()))(),
    });
    const jobId = await this.submit(userId, voice.id, "voice.enroll", {});
    return { voice_id: voice.id, status: "processing" as const, job_id: jobId };
  }

  /** GET /v1/voices/:id */
  async getVoice(userId: string, id: string) {
    const v = await this.owned(userId, id);
    return {
      voice_id: v.id,
      name: v.name,
      language: v.language,
      status: voiceStatus(v.status),
      quality: v.quality ?? null,
      consent: v.consentType ? { type: v.consentType, confirmed_at: v.consentConfirmedAt?.toISOString() ?? null } : null,
      error: v.status === "FAILED" ? v.errorMessage : null,
      created_at: v.createdAt.toISOString(),
    };
  }

  /** DELETE /v1/voices/:id — the voice and its engine artifacts go; past jobs keep their history. */
  async deleteVoice(userId: string, id: string) {
    const v = await this.owned(userId, id);
    await this.deps.store.deleteVoice(v.id);
    return { voice_id: v.id, deleted: true };
  }

  private async speechVoice(userId: string, voiceId: string | undefined) {
    if (!voiceId) return null;
    const v = await this.owned(userId, voiceId);
    if (v.status !== "READY") throw new ConflictException("the voice is not ready yet");
    return v.id;
  }

  private checkLength(chars: number) {
    if (chars > this.maxChars) throw new BadRequestException(`text too long for one job (${chars} > ${this.maxChars} characters) — split it into several requests`);
  }

  /** POST /v1/speech */
  async speech(userId: string, body: unknown) {
    const b = parse(SpeechBody, body);
    this.checkLength(b.text.length);
    const voiceId = await this.speechVoice(userId, b.voice_id);
    await this.admit(userId);
    const jobId = await this.submit(userId, voiceId, "speech.synthesis", b as unknown as Record<string, unknown>);
    return { job_id: jobId, status: "queued" as VoiceJobState };
  }

  /** POST /v1/speech/batch */
  async batch(userId: string, body: unknown) {
    const b = parse(BatchSpeechBody, body);
    this.checkLength(b.items.reduce((n, i) => n + i.text.length, 0));
    const voiceId = await this.speechVoice(userId, b.voice_id);
    await this.admit(userId);
    const jobId = await this.submit(userId, voiceId, "speech.batch", b as unknown as Record<string, unknown>);
    return { job_id: jobId, status: "queued" as VoiceJobState, items: b.items.length };
  }

  /** GET /v1/jobs/:id */
  async getJob(userId: string, id: string) {
    const j = UUID.test(id) ? await this.deps.store.job(id) : null;
    if (!j || j.userId !== userId) throw new NotFoundException("job not found");
    return {
      job_id: j.id,
      type: j.type,
      status: j.status,
      result: j.status === "completed" ? j.result ?? null : null,
      error: j.status === "failed" ? j.error : null,
      created_at: j.createdAt.toISOString(),
      completed_at: j.completedAt?.toISOString() ?? null,
    };
  }
}
