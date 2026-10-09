import { describe, expect, it } from "vitest";
import { VoiceApi, type StoredJob, type StoredVoice, type VoiceStore } from "./voice-api";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const V1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const J1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function setup(opts: { voices?: Partial<StoredVoice>[]; jobs?: Partial<StoredJob>[]; active?: number; env?: Record<string, string> } = {}) {
  const voices: StoredVoice[] = (opts.voices ?? []).map((v) => ({
    id: V1, userId: ME, name: "Me", status: "READY", language: "en", quality: { quality: "good" },
    consentType: "self", consentConfirmedAt: new Date("2026-10-01T00:00:00Z"), errorMessage: null, createdAt: new Date("2026-10-01T00:00:00Z"), ...v,
  }));
  const jobs: StoredJob[] = (opts.jobs ?? []).map((j) => ({
    id: J1, userId: ME, type: "speech.synthesis", status: "completed", result: { audio_key: `audio/${J1}/final.wav` }, error: null,
    createdAt: new Date("2026-10-01T00:00:00Z"), completedAt: new Date("2026-10-01T00:01:00Z"), ...j,
  }));
  const created: { voices: unknown[]; jobs: { voiceId: string | null; type: string; payload: Record<string, unknown> }[] } = { voices: [], jobs: [] };
  const enqueued: string[] = [];
  const deleted: string[] = [];
  const store: VoiceStore = {
    createVoice: async (v) => { created.voices.push(v); return { id: "new-voice" }; },
    voice: async (id) => voices.find((v) => v.id === id) ?? null,
    deleteVoice: async (id) => { deleted.push(id); },
    createJob: async (j) => { created.jobs.push(j); return { id: "new-job" }; },
    job: async (id) => jobs.find((j) => j.id === id) ?? null,
    activeJobs: async () => opts.active ?? 0,
  };
  const api = new VoiceApi({ store, env: opts.env ?? {}, enqueue: async (id, type) => { enqueued.push(`${type}:${id}`); }, now: () => new Date("2026-10-09T00:00:00Z") });
  return { api, created, enqueued, deleted };
}

const enrollBody = { name: "My voice", language: "en", reference_audio_key: `voices/${ME}/sample.wav`, consent: { confirmed: true, type: "self" } };
const status = async (p: Promise<unknown>) => p.then(() => 200, (e: { getStatus?: () => number }) => e.getStatus?.() ?? 500);

describe("POST /v1/voices", () => {
  it("records consent, queues an enrollment and returns at once", async () => {
    const s = setup();
    expect(await s.api.enroll(ME, enrollBody)).toEqual({ voice_id: "new-voice", status: "processing", job_id: "new-job" });
    expect(s.created.voices[0]).toMatchObject({ userId: ME, sampleKey: `voices/${ME}/sample.wav`, consentType: "self", consentConfirmedAt: new Date("2026-10-09T00:00:00Z") });
    expect(s.created.jobs[0]).toMatchObject({ voiceId: "new-voice", type: "voice.enroll" });
    expect(s.enqueued).toEqual(["voice.enroll:new-job"]);
  });

  it("refuses without confirmed consent", async () => {
    const s = setup();
    expect(await status(s.api.enroll(ME, { ...enrollBody, consent: { confirmed: false, type: "self" } }))).toBe(400);
    expect(await status(s.api.enroll(ME, { ...enrollBody, consent: undefined }))).toBe(400);
    expect(s.created.voices).toEqual([]);
  });

  it("refuses a recording that is not the caller's own upload", async () => {
    const s = setup();
    expect(await status(s.api.enroll(ME, { ...enrollBody, reference_audio_key: `voices/${OTHER}/x.wav` }))).toBe(400);
    expect(await status(s.api.enroll(ME, { ...enrollBody, reference_audio_key: `voices/${ME}/../${OTHER}/x.wav` }))).toBe(400);
  });

  it("limits jobs in progress per user", async () => {
    expect(await status(setup({ active: 5 }).api.enroll(ME, enrollBody))).toBe(429);
  });
});

describe("GET/DELETE /v1/voices/:id", () => {
  it("shows the owner the voice without engine internals", async () => {
    const v = await setup({ voices: [{}] }).api.getVoice(ME, V1);
    expect(v).toEqual({
      voice_id: V1, name: "Me", language: "en", status: "ready", quality: { quality: "good" },
      consent: { type: "self", confirmed_at: "2026-10-01T00:00:00.000Z" }, error: null, created_at: "2026-10-01T00:00:00.000Z",
    });
    expect(JSON.stringify(v)).not.toMatch(/minimax|provider|engine/);
  });

  it("answers 404 to anyone else, and to malformed ids", async () => {
    const s = setup({ voices: [{}] });
    expect(await status(s.api.getVoice(OTHER, V1))).toBe(404);
    expect(await status(s.api.deleteVoice(OTHER, V1))).toBe(404);
    expect(await status(s.api.getVoice(ME, "not-a-uuid"))).toBe(404);
    expect(s.deleted).toEqual([]);
  });

  it("lets the owner delete it", async () => {
    const s = setup({ voices: [{}] });
    expect(await s.api.deleteVoice(ME, V1)).toEqual({ voice_id: V1, deleted: true });
    expect(s.deleted).toEqual([V1]);
  });
});

describe("POST /v1/speech and /v1/speech/batch", () => {
  it("queues a stock-narrator job with the validated request", async () => {
    const s = setup();
    expect(await s.api.speech(ME, { text: "Hello world." })).toEqual({ job_id: "new-job", status: "queued" });
    expect(s.created.jobs[0]).toMatchObject({ voiceId: null, type: "speech.synthesis", payload: { text: "Hello world.", language: "en", output: { format: "wav", sample_rate: 48000, channels: 1 } } });
  });

  it("never accepts someone else's voice id", async () => {
    const s = setup({ voices: [{ userId: OTHER }] });
    expect(await status(s.api.speech(ME, { voice_id: V1, text: "Hi." }))).toBe(404);
    expect(await status(s.api.batch(ME, { voice_id: V1, items: [{ id: "a", text: "Hi." }] }))).toBe(404);
    expect(s.created.jobs).toEqual([]);
  });

  it("waits for a voice to be ready", async () => {
    expect(await status(setup({ voices: [{ status: "CLONING" }] }).api.speech(ME, { voice_id: V1, text: "Hi." }))).toBe(409);
  });

  it("refuses text over the per-job ceiling", async () => {
    const s = setup({ env: { VOICE_MAX_CHARS: "10" } });
    expect(await status(s.api.speech(ME, { text: "This is far too long." }))).toBe(400);
    expect(await status(s.api.batch(ME, { items: [{ id: "a", text: "123456" }, { id: "b", text: "123456" }] }))).toBe(400);
  });

  it("validates batch items", async () => {
    const s = setup();
    expect(await status(s.api.batch(ME, { items: [{ id: "a", text: "x" }, { id: "a", text: "y" }] }))).toBe(400);
    expect(await status(s.api.batch(ME, { items: [{ id: "../a", text: "x" }] }))).toBe(400);
    expect(await s.api.batch(ME, { items: [{ id: "line-1", text: "One." }] })).toEqual({ job_id: "new-job", status: "queued", items: 1 });
  });
});

describe("GET /v1/jobs/:id", () => {
  it("returns the owner's job and its result", async () => {
    expect(await setup({ jobs: [{}] }).api.getJob(ME, J1)).toEqual({
      job_id: J1, type: "speech.synthesis", status: "completed", result: { audio_key: `audio/${J1}/final.wav` }, error: null,
      created_at: "2026-10-01T00:00:00.000Z", completed_at: "2026-10-01T00:01:00.000Z",
    });
  });

  it("is 404 for anyone else", async () => {
    expect(await status(setup({ jobs: [{}] }).api.getJob(OTHER, J1))).toBe(404);
  });
});
