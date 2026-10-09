import { copyFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { VoiceEngine, VoiceEngineArtifact, VoiceSampleFacts } from "@cineforge/voice-contracts";
import { runVoiceJob, type JobUpdate, type VoiceJobDeps, type VoiceJobRow, type VoiceRow, type VoiceUpdate } from "./jobs";

const ME = "u-me";
const goodSample: VoiceSampleFacts = { durationSec: 30, sampleRate: 48000, channels: 1, silenceRatio: 0.15, peakDbfs: -3, noiseFloorDbfs: -62 };

function fakeEngine(id: string, cloning: boolean, calls: string[]): VoiceEngine {
  return {
    id,
    version: "v1",
    getCapabilities: () => ({ voiceCloning: cloning, voiceDesign: false, multilingual: true, languages: "any", emotionControl: false, speedControl: true, streaming: false, batch: false, maxChars: 120, presets: ["p0", "p1", "p2"] }),
    enrollVoice: async () => ({ artifacts: [{ artifactType: "provider_voice_id", uri: `${id}-voice-1` }] }),
    synthesize: async (r) => {
      calls.push(`${id}:${r.voice?.uri ?? "stock"}:${r.text.length}`);
      await writeFile(r.outPath, "raw");
      return { path: r.outPath, format: "mp3" };
    },
    health: async () => ({ ok: true }),
    unload: async () => {},
  };
}

function world(opts: { job: Partial<VoiceJobRow>; voice?: Partial<VoiceRow> | null; env?: Record<string, string>; sample?: VoiceSampleFacts; artifact?: VoiceEngineArtifact | null }) {
  const job: VoiceJobRow = { id: "job-1", userId: ME, voiceId: null, type: "speech.synthesis", status: "queued", payload: {}, ...opts.job };
  const voice: VoiceRow | null = opts.voice === null ? null : {
    id: "v-1", userId: ME, status: "CLONING", sampleKey: `voices/${ME}/a.wav`, language: "en",
    consentType: "self", consentConfirmedAt: new Date(), provider: null, providerVoiceId: null, ...opts.voice,
  };
  const states: string[] = [];
  const jobUpdates: JobUpdate[] = [];
  const voiceUpdates: VoiceUpdate[] = [];
  const saved: VoiceEngineArtifact[] = [];
  const uploads: string[] = [];
  const calls: string[] = [];
  const env = opts.env ?? { VOICE_ENGINES: "fal-minimax:90,openai-tts:80", FAL_KEY: "k", OPENAI_API_KEY: "k" };
  const deps: VoiceJobDeps = {
    env,
    db: {
      job: async () => job,
      setJob: async (_id, d) => {
        jobUpdates.push(d);
        if (d.status) { states.push(d.status); job.status = d.status; }
      },
      voice: async (id) => (voice && voice.id === id ? voice : null),
      setVoice: async (_id, d) => { voiceUpdates.push(d); },
      artifact: async () => opts.artifact ?? null,
      saveArtifacts: async (_v, _e, _ver, a) => { saved.push(...a); },
    },
    engine: (id) => (id === "fal-minimax" ? fakeEngine(id, true, calls) : id === "openai-tts" ? fakeEngine(id, false, calls) : null),
    download: async (_k, dest) => writeFile(dest, "sample"),
    upload: async (_p, key) => { uploads.push(key); },
    analyze: async () => opts.sample ?? goodSample,
    master: async (i, o) => copyFile(i, o),
    join: async (files, o) => copyFile(files[0]!, o),
    measure: async () => ({ durationSec: 12.5, integratedLufs: -16.1, truePeakDbtp: -1.6 }),
  };
  return { deps, job, states, jobUpdates, voiceUpdates, saved, uploads, calls };
}

const error = (w: ReturnType<typeof world>) => w.jobUpdates.find((u) => u.error)?.error ?? "";
const result = (w: ReturnType<typeof world>) => w.jobUpdates.find((u) => u.result)?.result;

describe("voice.enroll", () => {
  it("walks the eight-state path, stores the engine artifact and marks the voice ready", async () => {
    const w = world({ job: { type: "voice.enroll", voiceId: "v-1" } });
    expect(await runVoiceJob("job-1", w.deps)).toEqual({ status: "completed" });
    expect(w.states).toEqual(["claimed", "loading_model", "generating", "post_processing", "completed"]);
    expect(w.saved).toEqual([{ artifactType: "provider_voice_id", uri: "fal-minimax-voice-1" }]);
    expect(w.voiceUpdates.at(-1)).toMatchObject({ status: "READY", provider: "fal-minimax", providerVoiceId: "fal-minimax-voice-1" });
    expect(result(w)).toMatchObject({ voice_id: "v-1", status: "ready", quality: { quality: "good" } });
  });

  it("refuses a voice without recorded consent", async () => {
    const w = world({ job: { type: "voice.enroll", voiceId: "v-1" }, voice: { consentType: null, consentConfirmedAt: null } });
    expect((await runVoiceJob("job-1", w.deps)).status).toBe("failed");
    expect(error(w)).toMatch(/consent is required/);
    expect(w.saved).toEqual([]);
    expect(w.voiceUpdates.at(-1)).toMatchObject({ status: "FAILED" });
  });

  it("never enrolls someone else's voice, and does not say whether it exists", async () => {
    const w = world({ job: { type: "voice.enroll", voiceId: "v-1" }, voice: { userId: "u-other" } });
    await runVoiceJob("job-1", w.deps);
    expect(error(w)).toBe("voice not found");
  });

  it("refuses a recording outside the caller's own upload prefix", async () => {
    const w = world({ job: { type: "voice.enroll", voiceId: "v-1" }, voice: { sampleKey: "voices/u-other/x.wav" } });
    await runVoiceJob("job-1", w.deps);
    expect(error(w)).toMatch(/your own upload/);
  });

  it("judges the recording first and refuses a poor one with the reasons", async () => {
    const w = world({ job: { type: "voice.enroll", voiceId: "v-1" }, sample: { ...goodSample, durationSec: 3, peakDbfs: 0 } });
    await runVoiceJob("job-1", w.deps);
    expect(error(w)).toMatch(/not good enough to clone.*10 seconds.*clipping/);
    expect(w.voiceUpdates.find((u) => u.quality)?.quality?.quality).toBe("poor");
    expect(w.saved).toEqual([]);
  });

  it("fails with the reasons when no configured engine can clone", async () => {
    const w = world({ job: { type: "voice.enroll", voiceId: "v-1" }, env: { VOICE_ENGINES: "qwen3-tts:100,openai-tts:80", OPENAI_API_KEY: "k" } });
    await runVoiceJob("job-1", w.deps);
    expect(error(w)).toMatch(/qwen3-tts: self-hosted voice model — waits on Phase 1/);
    expect(error(w)).toMatch(/openai-tts: cannot speak in a cloned voice/);
  });
});

describe("speech.synthesis", () => {
  const long = Array.from({ length: 8 }, (_, i) => `Sentence number ${i + 1} of the long script is here.`).join(" ");

  it("segments a long script, speaks every segment, masters and delivers one 48 kHz WAV", async () => {
    const w = world({ job: { payload: { text: long } } });
    expect((await runVoiceJob("job-1", w.deps)).status).toBe("completed");
    expect(w.states).toEqual(["claimed", "loading_model", "generating", "post_processing", "completed"]);
    expect(w.calls.length).toBeGreaterThan(1);
    expect(w.calls.every((c) => c.startsWith("fal-minimax:stock:"))).toBe(true);
    expect(w.uploads).toEqual(["audio/job-1/final.wav"]);
    expect(result(w)).toMatchObject({ audio_key: "audio/job-1/final.wav", duration_seconds: 12.5, format: "wav", sample_rate: 48000, channels: 1, loudness_lufs: -16.1 });
  });

  it("speaks in the caller's cloned voice through its stored artifact", async () => {
    const w = world({ job: { voiceId: "v-1", payload: { text: "Hello there." } }, voice: { status: "READY" }, artifact: { artifactType: "provider_voice_id", uri: "minimax-123" } });
    await runVoiceJob("job-1", w.deps);
    expect(w.calls).toEqual(["fal-minimax:minimax-123:12"]);
  });

  it("uses a Voice Lab voice cloned before W7 through its provider id", async () => {
    const w = world({ job: { voiceId: "v-1", payload: { text: "Hello there." } }, voice: { status: "READY", provider: "fal-minimax", providerVoiceId: "legacy-9" } });
    await runVoiceJob("job-1", w.deps);
    expect(w.calls).toEqual(["fal-minimax:legacy-9:12"]);
  });

  it("never falls back to a stock narrator for a cloned voice", async () => {
    const w = world({ job: { voiceId: "v-1", payload: { text: "Hello." } }, voice: { status: "READY" }, env: { VOICE_ENGINES: "fal-minimax:90,openai-tts:80", OPENAI_API_KEY: "k" } });
    await runVoiceJob("job-1", w.deps);
    expect(w.calls).toEqual([]);
    expect(error(w)).toMatch(/no voice engine can use a cloned voice.*fal-minimax: not configured \(FAL_KEY\)/);
  });

  it("refuses someone else's voice id", async () => {
    const w = world({ job: { voiceId: "v-1", payload: { text: "Hello." } }, voice: { userId: "u-other", status: "READY" } });
    await runVoiceJob("job-1", w.deps);
    expect(error(w)).toBe("voice not found");
    expect(w.calls).toEqual([]);
  });

  it("refuses text over the per-job ceiling", async () => {
    const w = world({ job: { payload: { text: "a".repeat(50) } }, env: { FAL_KEY: "k", VOICE_MAX_CHARS: "20" } });
    await runVoiceJob("job-1", w.deps);
    expect(error(w)).toMatch(/text too long for one job \(50 > 20/);
  });

  it("is a no-op on a job that already finished (a retried attempt)", async () => {
    const w = world({ job: { status: "completed", payload: { text: "Hi." } } });
    expect(await runVoiceJob("job-1", w.deps)).toEqual({ status: "completed" });
    expect(w.states).toEqual([]);
  });
});

describe("speech.batch", () => {
  it("delivers one file per item under the job's prefix", async () => {
    const w = world({ job: { type: "speech.batch", payload: { items: [{ id: "line-1", text: "One." }, { id: "line-2", text: "Two." }] } } });
    await runVoiceJob("job-1", w.deps);
    expect(w.uploads).toEqual(["audio/job-1/line-1.wav", "audio/job-1/line-2.wav"]);
    expect(result(w)).toMatchObject({ items: [{ id: "line-1", audio_key: "audio/job-1/line-1.wav" }, { id: "line-2" }], format: "wav" });
  });

  it("rejects item ids that could escape the job's prefix", async () => {
    const w = world({ job: { type: "speech.batch", payload: { items: [{ id: "../x", text: "One." }] } } });
    await runVoiceJob("job-1", w.deps);
    expect(error(w)).toMatch(/invalid request: item ids/);
  });
});
