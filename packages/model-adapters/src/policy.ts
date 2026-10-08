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

export interface ModelResolution {
  modelId: string;
  /** True when the requested model was replaced; callers must record or refuse it. */
  substituted: boolean;
  requested: string;
  reason?: "MODEL_NOT_ALLOWED_FOR_TIER" | "MODEL_UNKNOWN";
}

/**
 * Route to the requested model if allowed, else to the primary model — and say
 * so. A substitution is never silent (DirectorOS DOS-75): the caller records a
 * degradation or refuses the job.
 */
export function resolveModel(modelId: string, tier: Tier): ModelResolution {
  if (isModelAllowed(modelId, tier)) return { modelId, substituted: false, requested: modelId };
  return {
    modelId: "wan-2.1",
    substituted: true,
    requested: modelId,
    reason: modelId in MODEL_TIERS ? "MODEL_NOT_ALLOWED_FOR_TIER" : "MODEL_UNKNOWN",
  };
}
