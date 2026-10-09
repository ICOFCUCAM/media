import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENGINE_REGISTRY, type SpeechSynthesisRequest, type VoiceEngine } from "@cineforge/voice-contracts";
import { ReadingError, renderReading, type ReadingDeps, type ReadingRow, type ReadingVoice } from "./reading";

let dir = "";
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "reading-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function engine(id: string, calls: SpeechSynthesisRequest[]): VoiceEngine {
  return {
    id, version: "1",
    getCapabilities: () => ENGINE_REGISTRY[id]!.capabilities,
    enrollVoice: async () => ({ artifacts: [] }),
    synthesize: async (r) => { calls.push(r); await writeFile(r.outPath, r.text); return { path: r.outPath, format: "wav" }; },
    health: async () => ({ ok: true }),
    unload: async () => {},
  };
}

const voice = (over: Partial<ReadingVoice> = {}): ReadingVoice => ({
  id: "v-own", userId: OWNER, status: "READY", shareStatus: "PRIVATE", consentType: "self", consentConfirmedAt: new Date(), provider: null, providerVoiceId: null, ...over,
});

function setup(voices: ReadingVoice[] = [voice()], licences: string[] = []) {
  const calls: SpeechSynthesisRequest[] = [];
  const uploads: string[] = [];
  const deps: ReadingDeps = {
    env: { FAL_KEY: "k", OPENAI_API_KEY: "k", VOICE_ENGINES: "fal-minimax,openai-tts" },
    engine: (id) => engine(id, calls),
    voice: async (id) => voices.find((v) => v.id === id) ?? null,
    licensed: async (voiceId, userId) => licences.includes(`${voiceId}:${userId}`),
    artifact: async (voiceId, engineId) => ({ artifactType: "provider_voice_id", uri: `${engineId}:${voiceId}` }),
    master: async (i, o) => { await writeFile(o, await readFile(i)); },
    join: async (files, out) => { await writeFile(out, (await Promise.all(files.map((f) => readFile(f, "utf8")))).join("|")); },
    measure: async () => ({ durationSec: 12.5 }),
    encodeMp3: async (w, m) => { await writeFile(m, await readFile(w)); },
    upload: async (_p, key) => { uploads.push(key); },
  };
  return { deps, calls, uploads };
}

const row = (over: Partial<ReadingRow> = {}): ReadingRow =>
  ({ id: "vo1", userId: OWNER, voiceId: null, text: "Good evening. Here is the news.", language: "en", mode: "narrator", style: {}, speakers: [], ...over });

describe("a reading on the Voice Engine (W15)", () => {
  it("a built-in narrator reads in the mode's style with the owner's controls, mastered and uploaded", async () => {
    const { deps, calls, uploads } = setup();
    const out = await renderReading(row({ mode: "presenter", style: { emotion: "happy" } }), dir, deps);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ voice: null, style: { energy: 0.7, speed: 1.05, emotion: "happy" }, language: "en" });
    expect(out).toMatchObject({ audioKey: `voiceovers/${OWNER}/vo1.mp3`, durationMs: 12500, engines: ["fal-minimax"], parts: 1, segments: 1 });
    expect(uploads).toEqual([`voiceovers/${OWNER}/vo1.mp3`]);
  });

  it("the owner's cloned voice speaks through its engine artifact", async () => {
    const { deps, calls } = setup();
    await renderReading(row({ voiceId: "v-own" }), dir, deps);
    expect(calls[0]).toMatchObject({ voice: { uri: "fal-minimax:v-own" }, voiceId: "v-own" });
  });

  it("someone else's voice speaks only with an active licence while it is offered (§170)", async () => {
    const shared = voice({ id: "v-shared", userId: OTHER, shareStatus: "APPROVED" });
    await expect(renderReading(row({ voiceId: "v-shared" }), dir, setup([shared]).deps)).rejects.toThrow(/no licence/);
    const { deps, calls } = setup([shared], [`v-shared:${OWNER}`]);
    await renderReading(row({ voiceId: "v-shared" }), dir, deps);
    expect(calls).toHaveLength(1);
    const withdrawn = voice({ id: "v-shared", userId: OTHER, shareStatus: "PRIVATE" });
    await expect(renderReading(row({ voiceId: "v-shared" }), dir, setup([withdrawn], [`v-shared:${OWNER}`]).deps)).rejects.toThrow(ReadingError);
  });

  it("a voice without consent never speaks, and a chosen voice never falls back to a stock narrator", async () => {
    await expect(renderReading(row({ voiceId: "v-own" }), dir, setup([voice({ consentType: null, consentConfirmedAt: null })]).deps)).rejects.toThrow(/consent/);
    const { deps, calls } = setup();
    deps.artifact = async () => null;
    await expect(renderReading(row({ voiceId: "v-own" }), dir, deps)).rejects.toThrow(/not enrolled/);
    expect(calls).toHaveLength(0);
  });

  it("a conversation gives each speaker their own voice; built-in speakers get distinct presets", async () => {
    const { deps, calls } = setup();
    const out = await renderReading(row({
      mode: "conversation",
      text: "Ada: Did you see it?\nBen: I did.\nCal: Me too.\nAda: Good.",
      speakers: [{ label: "Ada", voice_id: "v-own" }, { label: "Ben" }, { label: "Cal" }],
    }), dir, deps);
    expect(out.parts).toBe(4);
    expect(calls.map((c) => (c.voice ? "clone" : c.preset))).toEqual(["clone", expect.any(String), expect.any(String), "clone"]);
    expect(calls[1]!.preset).not.toBe(calls[2]!.preset);
    await expect(renderReading(row({ mode: "conversation", text: "Ada: hi\nZed: yo", speakers: [{ label: "Ada" }, { label: "Ben" }] }), dir, deps))
      .rejects.toThrow(/no voice chosen for Zed/);
  });

  it("refuses an empty or over-long reading before speaking", async () => {
    const { deps, calls } = setup();
    deps.env.VOICEOVER_MAX_CHARS = "10";
    await expect(renderReading(row(), dir, deps)).rejects.toThrow(/too long/);
    await expect(renderReading(row({ text: "  " }), dir, deps)).rejects.toThrow(/empty/);
    expect(calls).toHaveLength(0);
  });
});
