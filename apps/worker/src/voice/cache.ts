/**
 * The speech cache in the worker (DirectorOS W14; Part 4 §154). `cachedEngine`
 * wraps any VoiceEngine: a request whose key was generated before is served
 * from storage — no generation, no GPU time, no provider charge (wrap the
 * metered engine, so a hit is never billed). A miss generates, then stores
 * the clip for next time. The cache can never break speech: a failure to
 * read or write it is logged and the request is generated as usual.
 *
 * A deleted cloned voice's clips are purged (`purgeOrphanedSpeech`): its rows
 * lose their voice id when the voice is deleted, and the worker deletes the
 * objects and the rows.
 */
import { stat } from "node:fs/promises";
import { speechCacheKey, speechCacheObjectKey, type SpeechSynthesisRequest, type SpeechSynthesisResult, type VoiceEngine } from "@cineforge/voice-contracts";

export interface SpeechCacheEntry {
  key: string;
  storageKey: string;
  format: "mp3" | "wav";
}

export interface SpeechCacheStore {
  find(key: string): Promise<SpeechCacheEntry | null>;
  hit(key: string): Promise<void>;
  save(row: {
    key: string; engineId: string; engineVersion: string; voiceId: string | null; cloned: boolean;
    language: string; chars: number; storageKey: string; format: "mp3" | "wav"; bytes: number | null;
  }): Promise<void>;
  download(storageKey: string, path: string): Promise<void>;
  upload(path: string, storageKey: string, contentType: string): Promise<void>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
}

const CONTENT_TYPE = { mp3: "audio/mpeg", wav: "audio/wav" } as const;

export function cachedEngine(inner: VoiceEngine, store: SpeechCacheStore, stats?: CacheStats, log: (e: Record<string, unknown>) => void = (e) => console.warn(JSON.stringify(e))): VoiceEngine {
  const engine = inner;
  return {
    get id() { return engine.id; },
    get version() { return engine.version; },
    getCapabilities: () => engine.getCapabilities(),
    enrollVoice: (r) => engine.enrollVoice(r),
    health: () => engine.health(),
    unload: () => engine.unload(),
    async synthesize(req: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
      const key = speechCacheKey(engine, req);
      try {
        const found = await store.find(key);
        if (found) {
          const path = `${req.outPath}.${found.format}`;
          await store.download(found.storageKey, path);
          await store.hit(key).catch(() => {});
          if (stats) stats.hits++;
          return { path, format: found.format };
        }
      } catch (e) {
        if (stats) stats.errors++;
        log({ event: "speech_cache.read_failed", key, error: e instanceof Error ? e.message : String(e) });
      }
      const out = await engine.synthesize(req);
      if (stats) stats.misses++;
      try {
        const storageKey = speechCacheObjectKey(key, out.format, req.voice ? req.voiceId ?? null : null);
        await store.upload(out.path, storageKey, CONTENT_TYPE[out.format]);
        const bytes = await stat(out.path).then((s) => s.size).catch(() => null);
        await store.save({
          key, engineId: engine.id, engineVersion: engine.version, voiceId: req.voice ? req.voiceId ?? null : null, cloned: !!req.voice,
          language: req.language, chars: req.text.length, storageKey, format: out.format, bytes,
        });
      } catch (e) {
        if (stats) stats.errors++;
        log({ event: "speech_cache.write_failed", key, error: e instanceof Error ? e.message : String(e) });
      }
      return out;
    },
  };
}

/** Delete the clips of voices that no longer exist (their rows lost the voice id). */
export async function purgeOrphanedSpeech(
  db: { speechCache: { findMany(a: object): Promise<{ key: string; storageKey: string }[]>; deleteMany(a: object): Promise<{ count: number }> } },
  deleteObjects: (keys: string[]) => Promise<void>,
  limit = 500,
): Promise<number> {
  const orphans = await db.speechCache.findMany({ where: { cloned: true, voiceId: null }, select: { key: true, storageKey: true }, take: limit });
  if (!orphans.length) return 0;
  await deleteObjects(orphans.map((o) => o.storageKey));
  const { count } = await db.speechCache.deleteMany({ where: { key: { in: orphans.map((o) => o.key) } } });
  return count;
}

/** The production store: rows in speech_cache, clips in object storage. */
export function prismaSpeechCache(
  db: { speechCache: {
    findUnique(a: object): Promise<{ key: string; storageKey: string; format: string; cloned: boolean; voiceId: string | null } | null>;
    update(a: object): Promise<unknown>;
    upsert(a: object): Promise<unknown>;
  } },
  storage: { download(key: string, path: string): Promise<void>; upload(path: string, key: string, type?: string): Promise<void> },
): SpeechCacheStore {
  return {
    find: async (key) => {
      const r = await db.speechCache.findUnique({ where: { key }, select: { key: true, storageKey: true, format: true, cloned: true, voiceId: true } });
      // A deleted voice's clips are never served, even before the purge runs.
      if (!r || (r.cloned && !r.voiceId)) return null;
      return { key: r.key, storageKey: r.storageKey, format: r.format as "mp3" | "wav" };
    },
    hit: async (key) => { await db.speechCache.update({ where: { key }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }); },
    save: async (row) => {
      const data = { ...row, bytes: row.bytes == null ? null : BigInt(row.bytes) };
      await db.speechCache.upsert({ where: { key: row.key }, create: data, update: {} });
    },
    download: (k, path) => storage.download(k, path),
    upload: (path, k, type) => storage.upload(path, k, type),
  };
}

/** SPEECH_CACHE=0 turns the cache off (for a benchmark that must generate every time). */
export const speechCacheEnabled = (env: Record<string, string | undefined> = process.env) => env.SPEECH_CACHE !== "0";
