import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { speechCacheKey, type SpeechSynthesisRequest, type VoiceEngine } from "@cineforge/voice-contracts";
import { cachedEngine, prismaSpeechCache, purgeOrphanedSpeech, type CacheStats, type SpeechCacheStore } from "./cache";

let dir = "";
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "speech-cache-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

function fakeEngine() {
  const calls: string[] = [];
  const e: VoiceEngine = {
    id: "openai-tts", version: "1",
    getCapabilities: () => ({ voiceCloning: false, voiceDesign: false, multilingual: true, languages: "any", emotionControl: false, speedControl: true, streaming: false, batch: false, maxChars: 4000, presets: ["onyx"] }),
    enrollVoice: async () => ({ artifacts: [] }),
    synthesize: async (r) => { calls.push(r.text); await writeFile(r.outPath, `audio:${r.text}`); return { path: r.outPath, format: "wav" }; },
    health: async () => ({ ok: true }),
    unload: async () => {},
  };
  return { e, calls };
}

/** An in-memory store standing in for speech_cache + object storage. */
function memoryStore() {
  const rows = new Map<string, { storageKey: string; format: "mp3" | "wav"; hits: number; voiceId: string | null; cloned: boolean }>();
  const objects = new Map<string, Buffer>();
  const store: SpeechCacheStore = {
    find: async (key) => { const r = rows.get(key); return r ? { key, storageKey: r.storageKey, format: r.format } : null; },
    hit: async (key) => { rows.get(key)!.hits++; },
    save: async (row) => { rows.set(row.key, { storageKey: row.storageKey, format: row.format, hits: 0, voiceId: row.voiceId, cloned: row.cloned }); },
    download: async (k, path) => { await writeFile(path, objects.get(k)!); },
    upload: async (path, k) => { objects.set(k, await readFile(path)); },
  };
  return { store, rows, objects };
}

const req = (text: string, over: Partial<SpeechSynthesisRequest> = {}): SpeechSynthesisRequest =>
  ({ text, language: "en", voice: null, preset: "onyx", outPath: join(dir, `${Math.random()}`), ...over });

describe("speech cache (Part 4 §154)", () => {
  it("the key changes with voice, engine version, text, language and style — and not with spacing", () => {
    const base = speechCacheKey({ id: "openai-tts", version: "1" }, { text: "Welcome to BalanceVid.", language: "en", voice: null, preset: "onyx" });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(speechCacheKey({ id: "openai-tts", version: "1" }, { text: "  Welcome   to BalanceVid. ", language: "EN", voice: null, preset: "onyx" })).toBe(base);
    const variants = [
      speechCacheKey({ id: "openai-tts", version: "2" }, { text: "Welcome to BalanceVid.", language: "en", voice: null, preset: "onyx" }),
      speechCacheKey({ id: "openai-tts", version: "1" }, { text: "Welcome to BalanceVid!", language: "en", voice: null, preset: "onyx" }),
      speechCacheKey({ id: "openai-tts", version: "1" }, { text: "Welcome to BalanceVid.", language: "fr", voice: null, preset: "onyx" }),
      speechCacheKey({ id: "openai-tts", version: "1" }, { text: "Welcome to BalanceVid.", language: "en", voice: null, preset: "nova" }),
      speechCacheKey({ id: "openai-tts", version: "1" }, { text: "Welcome to BalanceVid.", language: "en", voice: { artifactType: "provider_voice_id", uri: "v1" } }),
      speechCacheKey({ id: "openai-tts", version: "1" }, { text: "Welcome to BalanceVid.", language: "en", voice: null, preset: "onyx", style: { speed: 1.1 } }),
      speechCacheKey({ id: "openai-tts", version: "1" }, { text: "Welcome to BalanceVid.", language: "en", voice: null, preset: "onyx", style: { pitch: 2 } }),
    ];
    expect(new Set([base, ...variants]).size).toBe(8);
  });

  it("the same sentence is generated once; the second request is served from storage", async () => {
    const { e, calls } = fakeEngine();
    const { store, rows } = memoryStore();
    const stats: CacheStats = { hits: 0, misses: 0, errors: 0 };
    const engine = cachedEngine(e, store, stats);
    const a = await engine.synthesize(req("Welcome to BalanceVid."));
    const b = await engine.synthesize(req("Welcome to BalanceVid."));
    expect(calls).toEqual(["Welcome to BalanceVid."]);
    expect(await readFile(b.path, "utf8")).toBe(await readFile(a.path, "utf8"));
    expect(stats).toEqual({ hits: 1, misses: 1, errors: 0 });
    expect([...rows.values()][0]).toMatchObject({ hits: 1, cloned: false, voiceId: null, storageKey: expect.stringMatching(/^audio_cache\/stock\/[0-9a-f]{64}\.wav$/) });
  });

  it("a cloned voice's clips are filed under that voice", async () => {
    const { e } = fakeEngine();
    const { store, rows } = memoryStore();
    await cachedEngine(e, store).synthesize(req("Hello.", { voice: { artifactType: "provider_voice_id", uri: "abc" }, voiceId: "11111111-1111-4111-8111-111111111111" }));
    expect([...rows.values()][0]).toMatchObject({ cloned: true, voiceId: "11111111-1111-4111-8111-111111111111", storageKey: expect.stringMatching(/^audio_cache\/voice\/11111111-1111-4111-8111-111111111111\//) });
  });

  it("the cache never breaks speech: a broken store still generates", async () => {
    const { e, calls } = fakeEngine();
    const broken: SpeechCacheStore = {
      find: async () => { throw new Error("db down"); }, hit: async () => {}, save: async () => { throw new Error("db down"); },
      download: async () => {}, upload: async () => { throw new Error("s3 down"); },
    };
    const stats: CacheStats = { hits: 0, misses: 0, errors: 0 };
    const logs: unknown[] = [];
    const out = await cachedEngine(e, broken, stats, (l) => logs.push(l)).synthesize(req("Still speaks."));
    expect(await readFile(out.path, "utf8")).toBe("audio:Still speaks.");
    expect(calls).toEqual(["Still speaks."]);
    expect(stats.errors).toBe(2);
    expect(logs).toHaveLength(2);
  });

  it("a deleted voice's clips are never served and are purged", async () => {
    const row = { key: "k1", storageKey: "audio_cache/voice/v/k1.mp3", format: "mp3", cloned: true, voiceId: null as string | null };
    const db = {
      speechCache: {
        findUnique: async () => row, update: async () => ({}), upsert: async () => ({}),
        findMany: async () => [{ key: "k1", storageKey: row.storageKey }],
        deleteMany: async () => ({ count: 1 }),
      },
    };
    const store = prismaSpeechCache(db, { download: async () => {}, upload: async () => {} });
    expect(await store.find("k1")).toBeNull();
    const deleted: string[] = [];
    expect(await purgeOrphanedSpeech(db, async (keys) => { deleted.push(...keys); })).toBe(1);
    expect(deleted).toEqual(["audio_cache/voice/v/k1.mp3"]);
  });
});
