import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINE_REGISTRY, type VoiceEngine } from "@cineforge/voice-contracts";
import { benchmarkStatus, runVoiceBenchmark, type VoiceBenchDeps } from "./voice";
import { openAiTranscriber } from "./voice-cli";

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
    expect(r.engines["qwen3-tts"]!.skipped).toMatch(/Phase 1/);
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
