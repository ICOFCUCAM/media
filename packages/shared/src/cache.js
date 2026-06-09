import { createHash } from "node:crypto";
/**
 * Deterministic hashing for the content-addressed asset cache + provenance
 * (docs/24 §C7). Identical generation inputs produce identical `cacheKey`s, so
 * a re-render (e.g. editing one scene) reuses every unaffected shot with zero
 * GPU spend. Pure + dependency-free so it's shared by the Director (key
 * assignment) and the video worker (cache lookup).
 */
export function sha1(input) {
    return createHash("sha1").update(input).digest("hex");
}
export function computePromptHash(p) {
    return sha1(JSON.stringify([p.prompt, p.negativePrompt ?? ""]));
}
/** Stable across runs: sorts reference keys so ordering doesn't change the key. */
export function computeCacheKey(i) {
    return sha1(JSON.stringify([
        i.modelId,
        i.modelVersion,
        i.promptHash,
        i.seed,
        i.width,
        i.height,
        i.durationSec,
        (i.referenceKeys ?? []).slice().sort(),
        i.loraKey ?? "",
    ]));
}
/** Reproducible per-shot seed so the same shot always anchors to the same noise. */
export function deterministicSeed(...parts) {
    return parseInt(sha1(parts.join(":")).slice(0, 8), 16); // 32-bit
}
