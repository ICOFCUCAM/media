import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FalMinimaxEngine, OpenAiTtsEngine, voiceEngine, type FalDeps } from "./engines";

let dir = "";
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "cf-voice-eng-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

const audio = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

describe("fal-minimax engine", () => {
  function fal() {
    const runs: { model: string; input: Record<string, unknown> }[] = [];
    const deps: FalDeps = {
      upload: async () => "https://fal/sample",
      run: async (_k, model, input) => {
        runs.push({ model, input });
        return model.includes("clone") ? { custom_voice_id: "mm-42" } : { audio: { url: "https://fal/out.mp3" } };
      },
      fetch: (async () => audio()) as typeof fetch,
    };
    return { runs, deps };
  }

  it("enrolls a recording into a provider voice id artifact, versioned by the clone model", async () => {
    const f = fal();
    const ref = join(dir, "ref.wav");
    await writeFile(ref, "x");
    const e = new FalMinimaxEngine({ FAL_KEY: "k" }, f.deps);
    expect(e.version).toBe("fal-ai/minimax/voice-clone");
    const r = await e.enrollVoice({ voiceId: "v", language: "en", referencePath: ref });
    expect(r.artifacts).toEqual([{ artifactType: "provider_voice_id", uri: "mm-42", metadata: { model: "fal-ai/minimax/voice-clone" } }]);
  });

  it("speaks with the cloned voice, speed and a known emotion; unknown emotions are left out", async () => {
    const f = fal();
    const e = new FalMinimaxEngine({ FAL_KEY: "k" }, f.deps);
    const out = join(dir, "a.mp3");
    await e.synthesize({ text: "Hi", language: "fr", voice: { artifactType: "provider_voice_id", uri: "mm-42" }, style: { speed: 1.2, emotion: "Sad" }, outPath: out });
    await e.synthesize({ text: "Hi", language: "en", voice: null, style: { emotion: "wistful" }, outPath: out });
    expect(f.runs[0]!.input).toMatchObject({ voice_setting: { voice_id: "mm-42", speed: 1.2, emotion: "sad" }, language_boost: "French" });
    expect(f.runs[1]!.input.voice_setting).toEqual({ voice_id: "Deep_Voice_Man", speed: 1 });
    expect(await readFile(out)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("is unhealthy without FAL_KEY", async () => {
    expect(await new FalMinimaxEngine({}).health()).toEqual({ ok: false, detail: "FAL_KEY not configured" });
  });
});

describe("openai-tts engine", () => {
  it("asks for WAV with the configured stock voice and speed", async () => {
    let body: Record<string, unknown> = {};
    const f = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return audio(); }) as unknown as typeof fetch;
    const r = await new OpenAiTtsEngine({ OPENAI_API_KEY: "k", OPENAI_TTS_VOICE: "nova" }, f).synthesize({ text: "Hello", language: "en", voice: null, style: { speed: 0.9 }, outPath: join(dir, "o.wav") });
    expect(body).toEqual({ model: "tts-1", voice: "nova", input: "Hello", response_format: "wav", speed: 0.9 });
    expect(r.format).toBe("wav");
  });

  it("uses a known preset and ignores an unknown one", async () => {
    const bodies: Record<string, unknown>[] = [];
    const f = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return audio(); }) as unknown as typeof fetch;
    const e = new OpenAiTtsEngine({ OPENAI_API_KEY: "k" }, f);
    await e.synthesize({ text: "a", language: "en", voice: null, preset: "nova", outPath: join(dir, "p1.wav") });
    await e.synthesize({ text: "a", language: "en", voice: null, preset: "Deep_Voice_Man", outPath: join(dir, "p2.wav") });
    expect(bodies.map((b) => b.voice)).toEqual(["nova", "onyx"]);
  });

  it("cannot clone and refuses a cloned voice", async () => {
    const e = new OpenAiTtsEngine({ OPENAI_API_KEY: "k" });
    await expect(e.enrollVoice()).rejects.toThrow(/cannot clone/);
    await expect(e.synthesize({ text: "x", language: "en", voice: { artifactType: "provider_voice_id", uri: "v" }, outPath: "/dev/null" })).rejects.toThrow(/cannot speak in a cloned voice/);
  });
});

it("gated self-hosted engines have no adapter", () => {
  expect(voiceEngine("qwen3-tts", { VOICE_GPU_URL: "http://gpu" })).toBeNull();
  expect(voiceEngine("fal-minimax", {})?.id).toBe("fal-minimax");
});
