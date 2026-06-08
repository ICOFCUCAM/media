/**
 * Model routing policy (docs/24 §C5, docs/15). Pure tier→model gating so the
 * API can validate/route a request without a live registry. This is the first
 * seam of the Model Routing Engine; the full multi-GPU scheduler (heterogeneous
 * routing + fair scheduling) builds on top of it.
 */

export type Tier = "FREE" | "CREATOR" | "STUDIO" | "ENTERPRISE";

/** Which tiers may use each model. Mirrors each adapter's capabilities().tiers. */
export const MODEL_TIERS: Record<string, Tier[]> = {
  "wan-2.1": ["FREE", "CREATOR", "STUDIO", "ENTERPRISE"],
  hunyuan: ["STUDIO", "ENTERPRISE"],
};

export function isModelAllowed(modelId: string, tier: Tier): boolean {
  return (MODEL_TIERS[modelId] ?? []).includes(tier);
}

export function allowedModels(tier: Tier): string[] {
  return Object.keys(MODEL_TIERS).filter((m) => isModelAllowed(m, tier));
}

/** Route to the requested model if allowed, else fall back to the primary model. */
export function resolveModel(modelId: string, tier: Tier): string {
  return isModelAllowed(modelId, tier) ? modelId : "wan-2.1";
}
