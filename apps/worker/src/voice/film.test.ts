import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VoiceEngine, VoiceEngineArtifact } from "@cineforge/voice-contracts";
import { chosenVoiceId, CUE_GAP_MS, NoVoiceEngineError, presetFor, renderSceneVoice, sceneCues, translateSpeech, type ChosenVoice, type SceneSpeech, type SceneVoiceDeps } from "./film";

let dir = "";
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "cf-scene-voice-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

const OWNER = "u-owner";
const scene = (over: Partial<SceneSpeech> = {}): SceneSpeech => ({
  id: "sc-1", narration: "The city sleeps.", dialogue: null, summary: "A street at night.",
  lines: [
    { id: "l-1", characterId: "c-maya", text: "Where were you?", emotion: "angry" },
    { id: "l-2", characterId: "c-tom", text: "Out.", emotion: null },
  ],
  ...over,
});

function engine(id: string, cloning: boolean, calls: string[]): VoiceEngine {
  return {
    id, version: "v1",
    getCapabilities: () => ({ voiceCloning: cloning, voiceDesign: false, multilingual: true, languages: "any", emotionControl: true, speedControl: true, streaming: false, batch: false, maxChars: 500, presets: ["narr", "p1", "p2", "p3"] }),
    enrollVoice: async () => ({ artifacts: [] }),
    synthesize: async (r) => {
      calls.push(`${id}|${r.voice?.uri ?? `preset:${r.preset}`}|${r.style?.emotion ?? "-"}|${r.text}`);
      await writeFile(r.outPath, "raw");
      return { path: r.outPath, format: "wav" };
    },
    health: async () => ({ ok: true }), unload: async () => {},
  };
}

function deps(opts: { env?: Record<string, string>; voices?: Record<string, Partial<ChosenVoice>>; artifact?: VoiceEngineArtifact | null } = {}) {
  const calls: string[] = [];
  const uploads: string[] = [];
  const d: SceneVoiceDeps = {
    env: opts.env ?? { VOICE_ENGINES: "fal-minimax:90,openai-tts:80", FAL_KEY: "k", OPENAI_API_KEY: "k" },
    engine: (id) => (id === "fal-minimax" ? engine(id, true, calls) : id === "openai-tts" ? engine(id, false, calls) : null),
    voice: async (id) => {
      const v = opts.voices?.[id];
      return v ? { id, userId: OWNER, status: "READY", consentType: "self", consentConfirmedAt: new Date(), provider: null, providerVoiceId: null, ...v } : null;
    },
    artifact: async () => opts.artifact ?? null,
    master: async (i, o) => copyFile(i, o),
    join: async (files, o) => copyFile(files[0]!, o),
    measure: async (p) => ({ durationSec: p.endsWith("scene-voice.wav") ? 6.2 : 1.5, integratedLufs: -16, truePeakDbtp: -1.6 }),
    upload: async (_p, key) => { uploads.push(key); },
  };
  return { d, calls, uploads };
}

const input = (over: Partial<Parameters<typeof renderSceneVoice>[0]> = {}) => ({
  scene: scene(), language: "en", ownerId: OWNER, castOrder: ["c-maya", "c-tom"], chosenVoices: {}, trackKey: "scenes/sc-1/audio/voice/j.wav", dir, ...over,
});

describe("scene cues", () => {
  it("narration first, then every line in order; legacy text only when nothing else", () => {
    expect(sceneCues(scene()).map((c) => c.lineId)).toEqual([null, "l-1", "l-2"]);
    expect(sceneCues(scene({ narration: null, lines: [] }))).toEqual([{ lineId: null, characterId: null, text: "A street at night.", emotion: null }]);
    expect(sceneCues(scene({ narration: " ", lines: [], summary: null }))).toEqual([]);
  });

  it("reads the chosen voice id only when it is a uuid", () => {
    expect(chosenVoiceId({ description: "warm", voiceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(chosenVoiceId({ voiceId: "Deep_Voice_Man" })).toBeUndefined();
    expect(chosenVoiceId(null)).toBeUndefined();
  });

  it("each character keeps one built-in voice, never the narrator's", () => {
    const presets = ["narr", "a", "b"];
    expect(presetFor(presets, ["c1", "c2", "c3"], null)).toBe("narr");
    expect(["c1", "c2", "c3"].map((c) => presetFor(presets, ["c1", "c2", "c3"], c))).toEqual(["a", "b", "a"]);
    expect(presetFor(presets, [], "c-unknown")).not.toBe("narr");
    expect(presetFor([], [], "c1")).toBeUndefined();
  });
});

describe("scene voice track", () => {
  it("speaks narration as the narrator and each character in their own built-in voice, with emotion", async () => {
    const { d, calls, uploads } = deps();
    const r = (await renderSceneVoice(input(), d))!;
    expect(calls).toEqual([
      "fal-minimax|preset:narr|-|The city sleeps.",
      "fal-minimax|preset:p1|angry|Where were you?",
      "fal-minimax|preset:p2|-|Out.",
    ]);
    expect(uploads).toEqual(["scenes/sc-1/audio/lines/l-1.wav", "scenes/sc-1/audio/lines/l-2.wav", "scenes/sc-1/audio/voice/j.wav"]);
    expect(r.cues.map((c) => [c.lineId, c.startMs, c.durationMs, c.voice])).toEqual([
      [null, 0, 1500, "built-in"],
      ["l-1", 1500 + CUE_GAP_MS, 1500, "built-in"],
      ["l-2", 2 * (1500 + CUE_GAP_MS), 1500, "built-in"],
    ]);
    expect(r).toMatchObject({ durationSec: 6.2, engine: "fal-minimax", substitutions: [], loudnessLufs: -16 });
  });

  it("speaks a character in the owner's cloned voice through its artifact", async () => {
    const { d, calls } = deps({ voices: { "v-maya": {} }, artifact: { artifactType: "provider_voice_id", uri: "mm-maya" } });
    const r = (await renderSceneVoice(input({ chosenVoices: { "c-maya": "v-maya" } }), d))!;
    expect(calls[1]).toBe("fal-minimax|mm-maya|angry|Where were you?");
    expect(r.cues[1]!.voice).toBe("cloned");
  });

  it("never uses someone else's voice: a built-in voice speaks and the substitution is reported", async () => {
    const { d, calls } = deps({ voices: { "v-x": { userId: "u-stranger" } }, artifact: { artifactType: "provider_voice_id", uri: "stolen" } });
    const r = (await renderSceneVoice(input({ chosenVoices: { "c-maya": "v-x" } }), d))!;
    expect(calls.join()).not.toContain("stolen");
    expect(r.substitutions).toEqual([{ characterId: "c-maya", reason: "the chosen voice is not one of the film owner's voices" }]);
  });

  it("reports a voice without consent, not ready, or with no cloning engine", async () => {
    const noConsent = deps({ voices: { v: { consentType: null, consentConfirmedAt: null } } });
    expect((await renderSceneVoice(input({ chosenVoices: { "c-maya": "v" } }), noConsent.d))!.substitutions[0]!.reason).toMatch(/no recorded consent/);
    const notReady = deps({ voices: { v: { status: "CLONING" } } });
    expect((await renderSceneVoice(input({ chosenVoices: { "c-maya": "v" } }), notReady.d))!.substitutions[0]!.reason).toMatch(/not ready/);
    const noClone = deps({ env: { VOICE_ENGINES: "openai-tts:80", OPENAI_API_KEY: "k" }, voices: { v: {} } });
    const r = (await renderSceneVoice(input({ chosenVoices: { "c-maya": "v" } }), noClone.d))!;
    expect(r.substitutions[0]!.reason).toMatch(/no voice engine can use a cloned voice.*openai-tts: cannot speak in a cloned voice/);
    expect(r.engine).toBe("openai-tts");
  });

  it("reports a substitution once per character, not once per line", async () => {
    const { d } = deps({ voices: { v: { status: "FAILED" } } });
    const lines = [1, 2, 3].map((n) => ({ id: `l-${n}`, characterId: "c-maya", text: `Line ${n}.`, emotion: null }));
    const r = (await renderSceneVoice(input({ scene: scene({ lines }), chosenVoices: { "c-maya": "v" } }), d))!;
    expect(r.substitutions).toHaveLength(1);
  });

  it("returns nothing for a silent scene and fails loudly with no engine at all", async () => {
    expect(await renderSceneVoice(input({ scene: scene({ narration: null, lines: [], summary: null }) }), deps().d)).toBeNull();
    await expect(renderSceneVoice(input(), deps({ env: {} }).d)).rejects.toBeInstanceOf(NoVoiceEngineError);
  });

  it("a dub stores no per-line files over the original language", async () => {
    const { d, uploads } = deps();
    const r = (await renderSceneVoice(input({ lineKeyPrefix: null, trackKey: "projects/p/film/dub/fr/sc-1.wav", language: "fr" }), d))!;
    expect(uploads).toEqual(["projects/p/film/dub/fr/sc-1.wav"]);
    expect(r.cues.every((c) => c.audioKey === null)).toBe(true);
    expect(r.trackPath.endsWith("scene-voice.wav")).toBe(true);
  });
});

describe("dubbing", () => {
  it("translates every spoken part in one call and keeps who says what", async () => {
    const calls: string[][] = [];
    const out = await translateSpeech(
      [scene(), scene({ id: "sc-2", narration: null, lines: [], summary: "Dawn." }), scene({ id: "sc-3", narration: null, lines: [], summary: null })],
      async (texts) => { calls.push(texts); return texts.map((t) => `FR:${t}`); },
    );
    expect(calls).toEqual([["The city sleeps.", "Where were you?", "Out.", "Dawn."]]);
    expect(out[0]).toEqual({
      id: "sc-1", narration: "FR:The city sleeps.", dialogue: null, summary: null,
      lines: [
        { id: "l-1", characterId: "c-maya", text: "FR:Where were you?", emotion: "angry" },
        { id: "l-2", characterId: "c-tom", text: "FR:Out.", emotion: null },
      ],
    });
    expect(out[1]).toMatchObject({ narration: "FR:Dawn.", lines: [] });
    expect(sceneCues(out[2]!)).toEqual([]);
  });

  it("refuses a translation that lost or added parts", async () => {
    await expect(translateSpeech([scene()], async () => ["only one"])).rejects.toThrow(/returned 1 parts for 3/);
  });
});
