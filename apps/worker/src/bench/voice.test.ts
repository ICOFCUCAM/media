import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_REGISTRY, type VoiceEngine } from "@cineforge/voice-contracts";
import { benchmarkStatus, runVoiceBenchmark, type VoiceBenchDeps } from "./voice";
import { openAiTranscriber, similarityScorer } from "./voice-cli";

function fakeEngine(id: string, opts: { fail?: boolean } = {}): VoiceEngine & { texts: string[] } {
  const texts: string[] = [];
  return {
    id, version: "1", texts,
    getCapabilities: () => ENGINE_REGISTRY[id]!.capabilities,
    enrollVoice: async () => ({ artifacts: [] }),
    synthesize: async (r) => {
      if (opts.fail) throw new Error("provider 500");
      texts.push(r.text);
      await writeFile(r.outPath, r.text);
      return { path: r.outPath, format: "wav" };
    },
    health: async () => ({ ok: true }),
    unload: async () => {},
  };
}

function deps(over: Partial<VoiceBenchDeps> = {}): VoiceBenchDeps {
  let clock = 0;
  const spoken = new Map<string, string>();
  return {
    env: { FAL_KEY: "k", OPENAI_API_KEY: "k", VOICE_ENGINES: "fal-minimax,openai-tts,qwen3-tts" },
    engine: (id) => fakeEngine(id),
    artifact: async () => ({ artifactType: "provider_voice_id", uri: "v-1" }),
    // 2.5 words per second, -16 LUFS; generation takes 1 s per call.
    measure: async (path) => {
      const text = await import("node:fs/promises").then((f) => f.readFile(path, "utf8"));
      spoken.set(path, text);
      return { durationSec: text.split(/\s+/).length / 2.5, integratedLufs: -16 };
    },
    transcribe: async (path) => spoken.get(path) ?? "",
    now: () => (clock += 500),
    ...over,
  };
}

describe("voice benchmark (Part 4 §136)", () => {
  it("runs every usable engine on the same scripts and never runs a gated or uncleared model", async () => {
    const r = await runVoiceBenchmark(deps(), { scripts: ["en-narration-30s", "en-narration-2m"] });
    expect(Object.keys(r.engines)).toEqual(["fal-minimax", "openai-tts", "qwen3-tts"]);
    expect(r.engines["qwen3-tts"]!.skipped).toMatch(/^licence: .*no owner approval/);
    expect(r.engines["qwen3-tts"]!.licence.cleared).toBe(false);
    const fal = r.engines["fal-minimax"]!;
    expect(fal.cases.map((c) => c.script)).toEqual(["en-narration-30s", "en-narration-2m"]);
    expect(fal.cases.every((c) => c.ok && c.wer === 0)).toBe(true);
    expect(fal.summary).toMatchObject({ cases: 2, succeeded: 2, medianWer: 0 });
    expect(fal.cases[1]!.loudnessSpreadLu).toBe(0);
    expect(fal.cases[0]!.realTimeFactor).toBeGreaterThan(0);
    expect(r.notMeasured.voiceSimilarity).toMatch(/not measured/);
    expect(benchmarkStatus(r)).toBe("pass");
  });

  it("in a cloned voice, an engine that cannot clone or has no enrolment is skipped with the reason", async () => {
    const r = await runVoiceBenchmark(deps({ artifact: async () => null }), { voiceId: "v", scripts: ["en-emotional"], engines: ["fal-minimax", "openai-tts"] });
    expect(r.engines["openai-tts"]!.skipped).toMatch(/cloned voice/);
    expect(r.engines["fal-minimax"]!.skipped).toMatch(/not enrolled/);
    expect(benchmarkStatus(r)).toBe("incomplete");
  });

  it("an unconfigured engine is skipped; a failing engine fails the run; no transcriber → pronunciation not measured", async () => {
    const r = await runVoiceBenchmark(
      deps({ engine: (id) => (id === "openai-tts" ? null : fakeEngine(id, { fail: true })), transcribe: null }),
      { scripts: ["en-documentary"], engines: ["fal-minimax", "openai-tts"] },
    );
    expect(r.engines["openai-tts"]!.skipped).toMatch(/not configured/);
    expect(r.engines["fal-minimax"]!.cases[0]).toMatchObject({ ok: false, error: "provider 500" });
    expect(r.notMeasured.pronunciation).toMatch(/no transcriber/);
    expect(benchmarkStatus(r)).toBe("fail");
  });

  it("--evaluate runs a configured self-hosted engine that is not yet approved, marked evaluation only; never a blocked one", async () => {
    const env = { VOICE_GPU_QWEN3_URL: "https://gpu", VOICE_GPU_QWEN3_REVISION: "a".repeat(40) };
    const r = await runVoiceBenchmark(deps({ env }), { scripts: ["en-emotional", "no-narration-30s"], engines: ["qwen3-tts", "gpt-sovits"], evaluation: true });
    expect(r.engines["qwen3-tts"]).toMatchObject({ evaluationOnly: true, licence: { cleared: false } });
    // Qwen3-TTS does not speak Norwegian: listed, not run, not a failure.
    expect(r.engines["qwen3-tts"]!.unsupportedScripts).toEqual(["no-narration-30s"]);
    expect(r.engines["qwen3-tts"]!.cases.map((c) => c.script)).toEqual(["en-emotional"]);
    expect(r.engines["gpt-sovits"]!.evaluationOnly).toBe(true);
    expect(benchmarkStatus(r)).toBe("pass");
    // Without --evaluate it is never run.
    const plain = await runVoiceBenchmark(deps({ env }), { scripts: ["en-emotional"], engines: ["qwen3-tts"] });
    expect(plain.engines["qwen3-tts"]!.skipped).toMatch(/^licence: /);
  });

  it("--enroll enrolls the owner's voice with an engine first; similarity is measured by one scorer", async () => {
    const enrolled: string[] = [];
    const scored: number[] = [];
    const r = await runVoiceBenchmark(deps({
      artifact: async () => null,
      enroll: async (voiceId, engine) => { enrolled.push(`${voiceId}:${engine.id}`); return { artifactType: "speaker_embedding", uri: "voices/u/v/engines/x/g.safetensors" }; },
      similarity: async (paths) => { scored.push(paths.length); return { scores: paths.map((_, i) => 0.7 + i * 0.05), scorer: "cosyvoice-3 speaker encoder" }; },
    }), { voiceId: "v", scripts: ["en-documentary"], engines: ["fal-minimax"], enroll: true });
    expect(enrolled).toEqual(["v:fal-minimax"]);
    expect(r.engines["fal-minimax"]!.enrolledForBenchmark).toBe(true);
    const c = r.engines["fal-minimax"]!.cases[0]!;
    expect(c.voiceSimilarity).toBeGreaterThanOrEqual(0.7);
    expect(r.engines["fal-minimax"]!.summary!.medianVoiceSimilarity).toBe(c.voiceSimilarity);
    expect(r.similarityScorer).toBe("cosyvoice-3 speaker encoder");
    expect(r.notMeasured.voiceSimilarity).toBeUndefined();
    await expect(runVoiceBenchmark(deps(), { enroll: true })).rejects.toThrow(/--enroll needs --voice/);
  });

  it("the transcriber is OpenAI speech-to-text and only exists with a key", async () => {
    expect(openAiTranscriber({})).toBeNull();
    const calls: { url: string; auth: string | null }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("authorization") });
      return new Response(JSON.stringify({ text: "hello there" }), { status: 200 });
    }) as unknown as typeof fetch;
    const t = openAiTranscriber({ OPENAI_API_KEY: "sk" }, f)!;
    const path = join(tmpdir(), `vb-${Date.now()}.wav`);
    await writeFile(path, "x");
    expect(await t(path, "en")).toBe("hello there");
    expect(calls[0]).toEqual({ url: expect.stringMatching(/\/audio\/transcriptions$/), auth: "Bearer sk" });
    await rm(path, { force: true });
  });
});

describe("voice similarity scorer (VOICE_SIMILARITY_ENGINE)", () => {
  it("is a configured self-hosted engine with a speaker encoder, else not measured with the reason", () => {
    expect(similarityScorer({})).toEqual({ engine: null, why: null });
    expect(similarityScorer({ VOICE_SIMILARITY_ENGINE: "gpt-sovits" }).why).toMatch(/no speaker encoder/);
    expect(similarityScorer({ VOICE_SIMILARITY_ENGINE: "cosyvoice-3" }).why).toMatch(/not configured/);
    expect(similarityScorer({ VOICE_SIMILARITY_ENGINE: "cosyvoice-3", VOICE_GPU_COSYVOICE_URL: "https://gpu" }).engine?.id).toBe("cosyvoice-3");
  });
});
