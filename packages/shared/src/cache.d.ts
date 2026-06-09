/**
 * Deterministic hashing for the content-addressed asset cache + provenance
 * (docs/24 §C7). Identical generation inputs produce identical `cacheKey`s, so
 * a re-render (e.g. editing one scene) reuses every unaffected shot with zero
 * GPU spend. Pure + dependency-free so it's shared by the Director (key
 * assignment) and the video worker (cache lookup).
 */
export declare function sha1(input: string): string;
export declare function computePromptHash(p: {
    prompt: string;
    negativePrompt?: string;
}): string;
export interface CacheKeyInput {
    modelId: string;
    modelVersion: string;
    promptHash: string;
    seed: number;
    width: number;
    height: number;
    durationSec: number;
    referenceKeys?: string[];
    loraKey?: string;
}
/** Stable across runs: sorts reference keys so ordering doesn't change the key. */
export declare function computeCacheKey(i: CacheKeyInput): string;
/** Reproducible per-shot seed so the same shot always anchors to the same noise. */
export declare function deterministicSeed(...parts: Array<string | number>): number;
