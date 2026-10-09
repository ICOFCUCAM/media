/**
 * The voice model licence registry (DirectorOS Part 3 §114, §129; Part 4
 * §130.2, §139, §141). A model being downloadable does not make it usable in
 * a commercial, hosted CineForge (§114.1). Before a model may speak:
 *
 *   - its licence permits commercial, hosted use (§139),
 *   - the EXACT checkpoint, its training-data terms and its dependencies have
 *     been checked, not just the repository's licence (§141.1),
 *   - and, for a self-hosted model, the owner has approved that checkpoint.
 *
 * Cloud engines are used through the provider's paid API; the provider's
 * terms govern the output, and the owner accepted them with the key.
 *
 * Entries record what was checked and where it came from. "unverified" is an
 * honest answer and keeps the model off — this file never claims a check
 * nobody made.
 */

export type CommercialUse =
  /** Commercial hosted use permitted by the licence itself. */
  | "allowed"
  /** A paid provider API whose terms govern output (the owner accepted them with the key). */
  | "provider_terms"
  /** Free for research only; commercial use needs a separate written licence. */
  | "research_only"
  /** Not yet established. */
  | "unknown";

export type CheckState = "verified" | "unverified" | "not_applicable";

export interface VoiceLicence {
  /** Engine id (the router's) or a model the engine registry does not list. */
  modelId: string;
  name: string;
  kind: "cloud" | "self-hosted";
  /** Licence of the code repository / package, as recorded. */
  codeLicence: string;
  commercialUse: CommercialUse;
  /** §141.1: the exact checkpoint's own terms. */
  checkpoint: { id: string | null; licence: string | null; state: CheckState };
  trainingData: CheckState;
  dependencies: CheckState;
  /** Where the recorded facts come from, and when. */
  source: string;
  checkedAt: string;
  notes: string;
}

export const VOICE_LICENCES: VoiceLicence[] = [
  {
    modelId: "fal-minimax", name: "MiniMax speech (fal.ai API)", kind: "cloud",
    codeLicence: "proprietary (API)", commercialUse: "provider_terms",
    checkpoint: { id: null, licence: null, state: "not_applicable" }, trainingData: "not_applicable", dependencies: "not_applicable",
    source: "fal.ai paid API; provider terms accepted with FAL_KEY", checkedAt: "2026-10-08",
    notes: "Voice cloning through the provider; consent is enforced by CineForge before any clone (W7).",
  },
  {
    modelId: "openai-tts", name: "OpenAI text-to-speech API", kind: "cloud",
    codeLicence: "proprietary (API)", commercialUse: "provider_terms",
    checkpoint: { id: null, licence: null, state: "not_applicable" }, trainingData: "not_applicable", dependencies: "not_applicable",
    source: "OpenAI paid API; provider terms accepted with OPENAI_API_KEY", checkedAt: "2026-10-08",
    notes: "Built-in voices only; no cloning.",
  },
  {
    modelId: "qwen3-tts", name: "Qwen3-TTS", kind: "self-hosted",
    codeLicence: "Apache-2.0 (Qwen TTS package)", commercialUse: "allowed",
    checkpoint: { id: null, licence: null, state: "unverified" }, trainingData: "unverified", dependencies: "unverified",
    source: "Part 4 §139.4 (author's check of the package licence)", checkedAt: "2026-10-08",
    notes: "Primary self-hosted choice (§140, §142). The package licence is not the checkpoint's: record the checkpoint, its terms, training-data terms and dependency licences before approval.",
  },
  {
    modelId: "cosyvoice-3", name: "CosyVoice 3", kind: "self-hosted",
    codeLicence: "unverified", commercialUse: "unknown",
    checkpoint: { id: null, licence: null, state: "unverified" }, trainingData: "unverified", dependencies: "unverified",
    source: "Part 4 §140–142 (named as a fallback; licence not recorded)", checkedAt: "2026-10-08",
    notes: "Fallback (§142). Nothing about its licence is recorded yet.",
  },
  {
    modelId: "gpt-sovits", name: "GPT-SoVITS", kind: "self-hosted",
    codeLicence: "MIT (software repository)", commercialUse: "allowed",
    checkpoint: { id: null, licence: null, state: "unverified" }, trainingData: "unverified", dependencies: "unverified",
    source: "Part 4 §139.2 (author's check of the repository licence)", checkedAt: "2026-10-08",
    notes: "Fallback (§142). The MIT licence covers the code; pretrained weights carry their own terms.",
  },
  {
    modelId: "fish-speech", name: "Fish Speech", kind: "self-hosted",
    codeLicence: "Fish Audio Research License", commercialUse: "research_only",
    checkpoint: { id: null, licence: null, state: "unverified" }, trainingData: "unverified", dependencies: "unverified",
    source: "Part 4 §139.3 (author's check): commercial use, incl. a hosted product/API, needs a separate written licence from Fish Audio", checkedAt: "2026-10-08",
    notes: "Not usable in CineForge without a written commercial licence.",
  },
];

export interface LicenceStatus {
  modelId: string;
  cleared: boolean;
  /** Why it may not speak (empty when cleared). */
  reasons: string[];
  /** The owner approval that cleared a self-hosted model. */
  approval: { checkpoint: string; by: string; on: string } | null;
}

/**
 * Owner approvals (§130.2): VOICE_MODEL_APPROVALS =
 * "qwen3-tts@<checkpoint>=<approver>:<YYYY-MM-DD>,…". Deploy configuration the
 * owner controls — never set by code. An approval names the checkpoint it covers.
 */
export function parseApprovals(spec: string | undefined): Map<string, { checkpoint: string; by: string; on: string }> {
  const out = new Map<string, { checkpoint: string; by: string; on: string }>();
  for (const part of (spec ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z0-9-]+)@([^=]+)=([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(part);
    if (!m) throw new Error(`VOICE_MODEL_APPROVALS: cannot read "${part}" (expected model@checkpoint=approver:YYYY-MM-DD)`);
    out.set(m[1]!, { checkpoint: m[2]!.trim(), by: m[3]!.trim(), on: m[4]! });
  }
  return out;
}

/** Whether a model may speak in CineForge, and every reason it may not. */
export function licenceStatus(modelId: string, env: Record<string, string | undefined> = {}, registry: VoiceLicence[] = VOICE_LICENCES): LicenceStatus {
  const l = registry.find((x) => x.modelId === modelId);
  if (!l) return { modelId, cleared: false, reasons: ["no licence registry entry"], approval: null };
  const reasons: string[] = [];
  if (l.commercialUse === "research_only") reasons.push("research-only licence: commercial hosted use needs a separate written licence");
  if (l.commercialUse === "unknown") reasons.push("commercial use not established");
  if (l.kind === "self-hosted") {
    if (l.checkpoint.state !== "verified") reasons.push("exact checkpoint and its licence not checked (§141.1)");
    if (l.trainingData !== "verified") reasons.push("training-data terms not checked (§141.1)");
    if (l.dependencies !== "verified") reasons.push("dependency licences not checked (§141.1)");
  }
  let approval: LicenceStatus["approval"] = null;
  if (l.kind === "self-hosted") {
    let a: LicenceStatus["approval"] = null;
    try {
      a = parseApprovals(env.VOICE_MODEL_APPROVALS).get(modelId) ?? null;
    } catch (e) {
      reasons.push(e instanceof Error ? e.message : String(e));
    }
    if (!a) reasons.push("no owner approval (§130.2)");
    else if (l.checkpoint.id && a.checkpoint !== l.checkpoint.id) reasons.push(`owner approval is for checkpoint ${a.checkpoint}, not ${l.checkpoint.id}`);
    else approval = a;
  }
  return { modelId, cleared: reasons.length === 0, reasons, approval };
}
