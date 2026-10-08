/**
 * Compiled Film IR → row fields, shared by the first plan (director.service)
 * and canon revisions (canon/revision.ts) so a regenerated shot is keyed and
 * prompted exactly as a freshly planned one would be.
 */
import { computeCacheKey, computePromptHash, deterministicSeed } from "@cineforge/shared";
import type { CompiledScene, CompiledShot } from "@cineforge/movie";

/** The continuity patch with database character ids (the engine resolves reference frames / LoRA from `id`). */
export function statePatchRow(sc: CompiledScene, charId: Map<string, string>) {
  const characters = Object.fromEntries(
    Object.entries(sc.statePatch.characters).map(([name, attrs]) => {
      const { key, ...rest } = attrs;
      return [name, { id: charId.get(key!)!, key: key!, ...rest }];
    }),
  );
  return { ...sc.statePatch, characters };
}

export interface ShotKeying {
  projectId: string;
  modelId: string;
  modelVersion: string;
  width: number;
  height: number;
}

/** Prompt, hashes and seed for one compiled shot. */
export function shotGenerationFields(k: ShotKeying, sceneIndex: number, sh: CompiledShot, charId: Map<string, string>) {
  const seed = deterministicSeed(k.projectId, sceneIndex, sh.index);
  const promptHash = computePromptHash({ prompt: sh.prompt, negativePrompt: sh.negativePrompt });
  const refs = sh.cameraPlan.subjectKeys.filter((s) => charId.has(s)).map((s) => charId.get(s)!);
  return {
    prompt: sh.prompt,
    negativePrompt: sh.negativePrompt,
    promptHash,
    // Content-addressed reuse (docs/24 §C7): keyed on the compiled prompt,
    // size, length and the characters in frame.
    cacheKey: computeCacheKey({
      modelId: k.modelId, modelVersion: k.modelVersion, promptHash, seed, width: k.width, height: k.height,
      durationSec: sh.durationSec, referenceKeys: refs,
    }),
    seed: BigInt(seed),
  };
}
