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
 *
 * Self-hosted engines (docs/74, re-checked 2026-10-11 against the sources
 * listed on each entry). Check states:
 *   verified          checked against a primary source (licence file / package metadata)
 *   owner_to_confirm  found, but the primary source could not be read from the
 *                     build environment (Hugging Face is blocked there): the
 *                     owner confirms it on the model card when approving —
 *                     the approval is the record of that confirmation
 *   undisclosed       checked; the publisher does not disclose it (e.g.
 *                     training-data terms) — the owner's approval accepts the risk
 *   restricted        checked; a restriction was found — blocks production until
 *                     a legal review is recorded HERE (code, reviewed), never by
 *                     an environment variable
 *   unverified        not checked — blocks
 * An entry with `blocked` (its licence forbids commercial use) never speaks.
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

export type CheckState = "verified" | "unverified" | "not_applicable" | "owner_to_confirm" | "undisclosed" | "restricted";

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
  /** Primary sources, linked (docs/74 lists them for the owner). */
  sources?: { label: string; url: string }[];
  /** Conditions and restrictions found (attribution, data terms, …). */
  restrictions?: string[];
  /** Set when the licence forbids commercial use: the model never speaks in CineForge. */
  blocked?: string;
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
    modelId: "qwen3-tts", name: "Qwen3-TTS (12 Hz Base)", kind: "self-hosted",
    codeLicence: "Apache-2.0", commercialUse: "allowed",
    checkpoint: {
      id: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
      licence: "Apache-2.0 — Qwen's release statement (\"we release both tokenizers and models under the Apache 2.0 license\") and the Hugging Face listing, seen through secondary sources; confirm on the model card",
      state: "owner_to_confirm",
    },
    trainingData: "undisclosed", dependencies: "verified",
    source: "GitHub QwenLM/Qwen3-TTS LICENSE at 022e286b98fb (Apache-2.0); PyPI qwen-tts 0.1.1 metadata (Apache-2.0); dependency licences from PyPI metadata of the pinned versions",
    checkedAt: "2026-10-11",
    notes: "Primary self-hosted candidate (§140). Code and package verified Apache-2.0. The weights' licence could not be read at the source from the build environment (Hugging Face blocked) — the owner confirms it on the model card when approving. Training data is not disclosed (technical report arXiv:2601.15621). The 0.6B Base is the smaller worker; approving it needs this entry changed.",
    sources: [
      { label: "Code licence (Apache-2.0)", url: "https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE" },
      { label: "Package licence (PyPI qwen-tts 0.1.1)", url: "https://pypi.org/project/qwen-tts/0.1.1/" },
      { label: "Model card — confirm the licence here", url: "https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base" },
      { label: "Technical report", url: "https://arxiv.org/abs/2601.15621" },
    ],
    restrictions: [
      "Apache-2.0: keep the licence and NOTICE files when redistributing; no trademark rights.",
      "Training data undisclosed: the owner's approval accepts that risk.",
      "Image ships ffmpeg and SoX (GPL builds from Ubuntu), run as separate programs, not linked.",
    ],
  },
  {
    modelId: "cosyvoice-3", name: "CosyVoice 3 (Fun-CosyVoice3-0.5B-2512)", kind: "self-hosted",
    codeLicence: "Apache-2.0", commercialUse: "allowed",
    checkpoint: {
      id: "FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
      licence: "Apache-2.0 — per the model listing as reported by secondary sources (a fork states it inherits Apache-2.0); confirm on the model card",
      state: "owner_to_confirm",
    },
    trainingData: "undisclosed", dependencies: "verified",
    source: "GitHub FunAudioLLM/CosyVoice LICENSE at 074ca6dc9e80 (Apache-2.0); Matcha-TTS submodule LICENSE (MIT); inference dependency licences from PyPI metadata of the pinned versions (pyworld MIT and wetext Apache-2.0 from their repositories)",
    checkedAt: "2026-10-11",
    notes: "Fallback / multilingual candidate (§140, §151.4). Code verified Apache-2.0. The weights' licence could not be read at the source from the build environment — the owner confirms it on the model card when approving. The repository README's disclaimer (\"for academic purposes only\") concerns its demo content, not the licence. Training data (about 1M hours, in the wild) is not itemised. The checkpoint bundles CAM++ (3D-Speaker, Apache-2.0) as its speaker encoder.",
    sources: [
      { label: "Code licence (Apache-2.0)", url: "https://github.com/FunAudioLLM/CosyVoice/blob/main/LICENSE" },
      { label: "Model card — confirm the licence here", url: "https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512" },
      { label: "Paper (CosyVoice 3)", url: "https://arxiv.org/abs/2505.17589" },
      { label: "Speaker encoder (3D-Speaker, Apache-2.0)", url: "https://github.com/modelscope/3D-Speaker/blob/main/LICENSE" },
    ],
    restrictions: [
      "Apache-2.0: keep the licence and NOTICE files when redistributing.",
      "Training data undisclosed (in-the-wild speech): the owner's approval accepts that risk.",
      "TensorRT/deepspeed/ttsfrd are NOT installed (NVIDIA/other terms); inference runs without them.",
    ],
  },
  {
    modelId: "gpt-sovits", name: "GPT-SoVITS (v2Pro)", kind: "self-hosted",
    codeLicence: "MIT", commercialUse: "allowed",
    checkpoint: {
      id: "lj1995/GPT-SoVITS",
      licence: "MIT — the repository's model-card metadata (seen through search results); confirm on the model card",
      state: "owner_to_confirm",
    },
    trainingData: "restricted", dependencies: "verified",
    source: "GitHub RVC-Boss/GPT-SoVITS LICENSE at 1b47ca07ef43 (MIT); README credits for the bundled pretrained components; WenetSpeech licence on its official site (wenet-e2e/WenetSpeech gh-pages 162c58ff26de); TencentGameMate/chinese_speech_pretrain README; dependency licences from PyPI metadata of the pinned versions",
    checkedAt: "2026-10-11",
    notes: "Low-VRAM candidate (§151.4). Code MIT. Its required feature extractor chinese-hubert-base (TencentGameMate) was pretrained on WenetSpeech, which is \"available to download for non-commercial purposes\" and whose audio (YouTube, podcasts) remains the original owners' copyright. Whether that restriction reaches a model trained on it is a legal question: GPT-SoVITS stays blocked for production until a legal review is recorded in this entry. Benchmark evaluation only.",
    sources: [
      { label: "Code licence (MIT)", url: "https://github.com/RVC-Boss/GPT-SoVITS/blob/main/LICENSE" },
      { label: "Pretrained models — confirm the licence here", url: "https://huggingface.co/lj1995/GPT-SoVITS" },
      { label: "chinese-hubert-base: pretrained on WenetSpeech", url: "https://github.com/TencentGameMate/chinese_speech_pretrain" },
      { label: "WenetSpeech licence (non-commercial download)", url: "https://wenet-e2e.github.io/WenetSpeech/" },
      { label: "chinese-roberta-wwm-ext-large (Apache-2.0)", url: "https://github.com/ymcui/Chinese-BERT-wwm/blob/master/LICENSE" },
      { label: "ERes2NetV2 speaker model (3D-Speaker, Apache-2.0)", url: "https://github.com/modelscope/3D-Speaker/blob/main/LICENSE" },
    ],
    restrictions: [
      "chinese-hubert-base was trained on WenetSpeech: non-commercial download licence; audio copyright with the original owners.",
      "Pretrained GPT/SoVITS weights: training data not disclosed.",
      "chardet (LGPL-2.1+) and tqdm (MPL-2.0) are used unmodified as libraries.",
    ],
  },
  {
    modelId: "fish-speech", name: "Fish Speech / Fish Audio S2", kind: "self-hosted",
    codeLicence: "Fish Audio Research License", commercialUse: "research_only",
    checkpoint: { id: null, licence: "Fish Audio Research License", state: "verified" }, trainingData: "unverified", dependencies: "unverified",
    source: "GitHub fishaudio/fish-speech LICENSE (Fish Audio Research License, last updated 2026-03-07), checked at bdd39477922a",
    checkedAt: "2026-10-11",
    notes: "Not usable in CineForge without a written commercial licence from Fish Audio.",
    sources: [{ label: "Fish Audio Research License", url: "https://github.com/fishaudio/fish-speech/blob/main/LICENSE" }],
    restrictions: ["Commercial purpose — explicitly including a hosted service or API and internal business operations — needs a separate written licence."],
    blocked: "Fish Audio Research License: any commercial use, including a hosted product or API, requires a separate written licence from Fish Audio",
  },
  {
    modelId: "f5-tts", name: "F5-TTS", kind: "self-hosted",
    codeLicence: "MIT", commercialUse: "research_only",
    checkpoint: { id: null, licence: "CC-BY-NC (pretrained models)", state: "verified" }, trainingData: "restricted", dependencies: "unverified",
    source: "GitHub SWivid/F5-TTS README §License at 283252563dbf: code MIT; pre-trained models CC-BY-NC because of the Emilia training data",
    checkedAt: "2026-10-11",
    notes: "Listed so the router and benchmark can say why it is never used (§135, §137.2).",
    sources: [{ label: "F5-TTS README, License section", url: "https://github.com/SWivid/F5-TTS#license" }],
    restrictions: ["Pretrained weights are CC-BY-NC (non-commercial) because of the Emilia training data."],
    blocked: "pretrained weights are CC-BY-NC (non-commercial)",
  },
];

export interface LicenceStatus {
  modelId: string;
  cleared: boolean;
  /** Why it may not speak (empty when cleared). */
  reasons: string[];
  /** The owner approval that cleared a self-hosted model. */
  approval: { checkpoint: string; by: string; on: string } | null;
  /** What the owner's approval also confirmed or accepted (owner_to_confirm / undisclosed items). */
  confirmedOnApproval: string[];
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

const CHECKS = [
  { field: "checkpoint", what: "exact checkpoint and its licence", unverified: "exact checkpoint and its licence not checked (§141.1)" },
  { field: "trainingData", what: "training-data terms", unverified: "training-data terms not checked (§141.1)" },
  { field: "dependencies", what: "dependency licences", unverified: "dependency licences not checked (§141.1)" },
] as const;

function stateOf(l: VoiceLicence, field: (typeof CHECKS)[number]["field"]): CheckState {
  return field === "checkpoint" ? l.checkpoint.state : l[field];
}

/** Whether a model may speak in CineForge, and every reason it may not. */
export function licenceStatus(modelId: string, env: Record<string, string | undefined> = {}, registry: VoiceLicence[] = VOICE_LICENCES): LicenceStatus {
  const l = registry.find((x) => x.modelId === modelId);
  if (!l) return { modelId, cleared: false, reasons: ["no licence registry entry"], approval: null, confirmedOnApproval: [] };
  const reasons: string[] = [];
  if (l.blocked) reasons.push(`blocked: ${l.blocked}`);
  if (l.commercialUse === "research_only") reasons.push("research-only licence: commercial hosted use needs a separate written licence");
  if (l.commercialUse === "unknown") reasons.push("commercial use not established");
  const onApproval: string[] = [];
  if (l.kind === "self-hosted") {
    for (const c of CHECKS) {
      const st = stateOf(l, c.field);
      if (st === "unverified") reasons.push(c.unverified);
      else if (st === "restricted") reasons.push(`${c.what}: restricted — needs a legal review recorded in the licence registry (§141.1)`);
      else if (st === "owner_to_confirm") onApproval.push(`${c.what} confirmed by the owner at the source`);
      else if (st === "undisclosed") onApproval.push(`${c.what} not disclosed by the publisher — risk accepted by the owner`);
    }
  }
  let approval: LicenceStatus["approval"] = null;
  if (l.kind === "self-hosted") {
    let a: LicenceStatus["approval"] = null;
    try {
      a = parseApprovals(env.VOICE_MODEL_APPROVALS).get(modelId) ?? null;
    } catch (e) {
      reasons.push(e instanceof Error ? e.message : String(e));
    }
    if (!a) reasons.push(onApproval.length ? `no owner approval (§130.2) — approving also records: ${onApproval.join("; ")}` : "no owner approval (§130.2)");
    else if (l.checkpoint.id && a.checkpoint !== l.checkpoint.id) reasons.push(`owner approval is for checkpoint ${a.checkpoint}, not ${l.checkpoint.id}`);
    else approval = a;
  }
  const cleared = reasons.length === 0;
  return { modelId, cleared, reasons, approval, confirmedOnApproval: cleared ? onApproval : [] };
}

/**
 * Whether the voice benchmark may run a model to EVALUATE it (Part 4 §136) —
 * never production speech. Allowed when its licence permits commercial use and
 * nothing blocks it outright; an engine that merely lacks the owner's approval
 * (or whose data terms await review) may be evaluated so the owner can decide.
 */
export function evaluationAllowed(modelId: string, registry: VoiceLicence[] = VOICE_LICENCES): { allowed: boolean; reason: string | null } {
  const l = registry.find((x) => x.modelId === modelId);
  if (!l) return { allowed: false, reason: "no licence registry entry" };
  if (l.blocked) return { allowed: false, reason: `blocked: ${l.blocked}` };
  if (l.commercialUse !== "allowed" && l.commercialUse !== "provider_terms") return { allowed: false, reason: `commercial use ${l.commercialUse}` };
  return { allowed: true, reason: null };
}
