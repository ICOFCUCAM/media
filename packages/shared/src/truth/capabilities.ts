/**
 * Capability Registry (DirectorOS DOS-77/78).
 *
 * Every capability declares what is actually operational, computed at run
 * time from configuration and probes — never from hand-written badges. The UI
 * offers only what the registry says works (DOS-78).
 */

/** Runtime state of a capability. */
export type CapabilityStatus =
  | "production_ready" // real execution, verified
  | "experimental" // real execution, not yet validated for production
  | "unavailable" // should work but is not reachable / not configured now
  | "disabled" // deliberately off (e.g. the LoRA trainer)
  | "not_implemented";

export type CapabilityId =
  | "film_planning"
  | "content_moderation"
  | "seed_image_generation"
  | "video_generation"
  | "video_generation_cinematic"
  | "reference_image_conditioning"
  | "reference_video_conditioning"
  | "camera_control"
  | "lora_identity"
  | "lora_training"
  | "narration_tts"
  | "voice_cloning"
  | "music_generation"
  | "sfx_generation"
  | "translation"
  | "upscale_4k"
  | "storage"
  | "visual_qc"
  | "technical_qc";

export interface Capability {
  capability: CapabilityId;
  provider: string | null;
  status: CapabilityStatus;
  realExecution: boolean;
  requiresGpu?: boolean;
  /** Supported variants, e.g. output formats "480p" | "720p" | "1080p" | "4k", aspect "16:9" | "9:16". */
  supports?: string[];
  /** Why it is not production_ready (shown to operators). */
  note?: string;
}

/** Inputs the worker can observe without side effects. */
export interface CapabilityProbe {
  env: Record<string, string | undefined>;
  /** GPU worker `/capabilities` per model id, when reachable. */
  gpu?: Record<string, GpuCapabilitiesWire | null>;
  /** Intelligence router availability per reasoning task (first configured route's provider). */
  intelligence?: Partial<Record<"film_plan" | "translation" | "visual_review", { available: boolean; provider: string | null }>>;
}

/** The subset of apps/gpu-worker `/capabilities` the registry reads. */
export interface GpuCapabilitiesWire {
  model?: string;
  execution?: string;
  realExecution?: boolean;
  supportsRefImage?: boolean;
  supportsRefVideo?: boolean;
  supportsCamera?: boolean;
  supportsLora?: boolean;
  maxResolution?: [number, number] | null;
}

const has = (env: CapabilityProbe["env"], ...keys: string[]) => keys.every((k) => !!env[k]);

/** Output formats a runtime can actually deliver at a max resolution. */
export function formatsFor(max: [number, number] | null | undefined): string[] {
  if (!max) return [];
  const [w, h] = max;
  const out: string[] = [];
  if (w >= 832 && h >= 480) out.push("480p");
  if (w >= 1280 && h >= 720) out.push("720p");
  if (w >= 1920 && h >= 1080) out.push("1080p");
  return out;
}

/**
 * Build the registry. Pure: the worker passes env and the probes it ran.
 * Status rules:
 *  - a capability with no provider configured is `unavailable` (or `not_implemented`
 *    when no code path exists at all);
 *  - real execution that has no passing real-provider test yet is `experimental`
 *    (DOS-73: nothing is production_ready on wiring alone).
 */
export function buildCapabilityRegistry(probe: CapabilityProbe): Capability[] {
  const { env } = probe;
  const wan = probe.gpu?.["wan-2.1"] ?? null;
  const gpuReal = wan?.realExecution === true;
  const gpuMode = wan?.execution ?? (probe.gpu ? "unreachable" : "unprobed");
  const cap = (c: Capability) => c;
  const brain = (task: "film_plan" | "translation" | "visual_review") =>
    probe.intelligence?.[task] ?? { available: has(env, "ANTHROPIC_API_KEY"), provider: has(env, "ANTHROPIC_API_KEY") ? "anthropic" : null };
  const plan = brain("film_plan");
  const tr = brain("translation");
  const list: Capability[] = [
    cap({
      capability: "film_planning",
      provider: plan.available ? plan.provider : null,
      status: plan.available ? "experimental" : "unavailable",
      realExecution: plan.available,
      note: plan.available ? "no real-provider test in CI yet" : "no planning model configured (INTELLIGENCE_ROUTES / ANTHROPIC_API_KEY) — films cannot be planned",
    }),
    cap({
      capability: "content_moderation",
      provider: has(env, "OPENAI_API_KEY") ? "openai" : null,
      status: has(env, "OPENAI_API_KEY") ? "experimental" : "unavailable",
      realExecution: has(env, "OPENAI_API_KEY"),
    }),
    (() => {
      // Image provider registry (W6): IMAGE_PROVIDERS, default "openai"; ComfyUI is gated on Phase 1.
      const listed = (env.IMAGE_PROVIDERS ?? "openai").split(",").map((x) => x.trim());
      const openai = listed.includes("openai") && has(env, "OPENAI_API_KEY");
      const gated = listed.includes("comfyui") ? "ComfyUI waits on Phase 1 (docs/39)" : null;
      return cap({
        capability: "seed_image_generation",
        provider: openai ? "openai" : null,
        status: openai ? "experimental" : listed.includes("none") ? "disabled" : "unavailable",
        realExecution: openai,
        note: [gated, openai ? null : "no image provider configured (IMAGE_PROVIDERS / OPENAI_API_KEY)"].filter(Boolean).join("; ") || undefined,
      });
    })(),
    cap({
      capability: "video_generation",
      provider: wan ? "wan-2.1" : null,
      status: gpuReal ? "experimental" : "unavailable",
      realExecution: gpuReal,
      requiresGpu: true,
      supports: gpuReal ? formatsFor(wan?.maxResolution) : [],
      note: gpuReal ? "real-provider test pending (W10)" : `GPU worker ${gpuMode}`,
    }),
    cap({
      capability: "video_generation_cinematic",
      provider: has(env, "FAL_KEY") ? "fal" : null,
      status: has(env, "FAL_KEY") ? "experimental" : "unavailable",
      realExecution: has(env, "FAL_KEY"),
    }),
    cap({
      capability: "reference_image_conditioning",
      provider: wan ? "wan-2.1" : null,
      status: gpuReal && wan?.supportsRefImage ? "experimental" : "unavailable",
      realExecution: gpuReal && !!wan?.supportsRefImage,
      note: gpuReal && !wan?.supportsRefImage ? "no I2V model configured (WAN_I2V_MODEL_ID)" : undefined,
    }),
    cap({ capability: "reference_video_conditioning", provider: null, status: "not_implemented", realExecution: false }),
    cap({ capability: "camera_control", provider: null, status: "not_implemented", realExecution: false }),
    cap({
      capability: "lora_identity",
      provider: wan ? "wan-2.1" : null,
      status: gpuReal && wan?.supportsLora ? "experimental" : "unavailable",
      realExecution: gpuReal && !!wan?.supportsLora,
    }),
    cap({
      capability: "lora_training",
      provider: has(env, "LORA_TRAINER_URL") ? "external" : null,
      status: has(env, "LORA_TRAINER_URL") ? "experimental" : "disabled",
      realExecution: has(env, "LORA_TRAINER_URL"),
      note: has(env, "LORA_TRAINER_URL") ? undefined : "trainer not configured; the GPU worker's /train is disabled",
    }),
    (() => {
      // Film narration and dialogue run on the Voice Engine (W7b): the first
      // listed cloud engine that is configured speaks.
      const listed = (env.VOICE_ENGINES ?? "fal-minimax:90,openai-tts:80").split(",").map((x) => x.split(":")[0]!.trim());
      const engine = listed.find((id) => (id === "fal-minimax" && has(env, "FAL_KEY")) || (id === "openai-tts" && has(env, "OPENAI_API_KEY"))) ?? null;
      return cap({
        capability: "narration_tts",
        provider: engine,
        status: engine ? "experimental" : "unavailable",
        realExecution: !!engine,
        note: engine ? "narration and each character's dialogue, mastered per line" : "no voice engine configured (VOICE_ENGINES / FAL_KEY / OPENAI_API_KEY) — films have no voice track",
      });
    })(),
    (() => {
      // Voice Engine router (W7): VOICE_ENGINES, default "fal-minimax:90,openai-tts:80".
      // Self-hosted voice models are listed but gated on Phase 1 (docs/39).
      const listed = (env.VOICE_ENGINES ?? "fal-minimax:90,openai-tts:80").split(",").map((x) => x.split(":")[0]!.trim());
      const fal = listed.includes("fal-minimax") && has(env, "FAL_KEY");
      const gated = listed.filter((id) => ["qwen3-tts", "cosyvoice-3", "gpt-sovits"].includes(id));
      return cap({
        capability: "voice_cloning",
        provider: fal ? "fal-minimax" : null,
        status: fal ? "experimental" : "unavailable",
        realExecution: fal,
        note: [
          gated.length ? `${gated.join(", ")} wait on Phase 1 (docs/39)` : null,
          fal ? "consent required; recordings judged before cloning" : "no cloning engine configured (VOICE_ENGINES / FAL_KEY)",
        ].filter(Boolean).join("; "),
      });
    })(),
    cap({
      capability: "music_generation",
      provider: has(env, "FAL_KEY") ? "fal" : null,
      status: has(env, "FAL_KEY") ? "experimental" : "unavailable",
      realExecution: has(env, "FAL_KEY"),
    }),
    // W16: each scene's ambience bed and planned effects from the text-to-audio model.
    cap({
      capability: "sfx_generation",
      provider: has(env, "FAL_KEY") && env.SOUND_DESIGN !== "0" ? "fal" : null,
      status: env.SOUND_DESIGN === "0" ? "disabled" : has(env, "FAL_KEY") ? "experimental" : "unavailable",
      realExecution: has(env, "FAL_KEY") && env.SOUND_DESIGN !== "0",
    }),
    cap({
      capability: "translation",
      provider: tr.available ? tr.provider : null,
      status: tr.available ? "experimental" : "unavailable",
      realExecution: tr.available,
    }),
    cap({
      capability: "upscale_4k",
      provider: has(env, "FAL_KEY") ? "fal" : null,
      status: has(env, "FAL_KEY") ? "experimental" : "unavailable",
      realExecution: has(env, "FAL_KEY"),
      supports: has(env, "FAL_KEY") ? ["4k"] : [],
    }),
    cap({
      capability: "storage",
      provider: has(env, "S3_ENDPOINT") || has(env, "S3_BUCKET") ? "s3" : null,
      status: has(env, "S3_ACCESS_KEY", "S3_SECRET_KEY") || has(env, "AWS_ACCESS_KEY_ID") ? "production_ready" : "unavailable",
      realExecution: has(env, "S3_ACCESS_KEY", "S3_SECRET_KEY") || has(env, "AWS_ACCESS_KEY_ID"),
    }),
    (() => {
      const vr = brain("visual_review");
      const mode = env.VISUAL_REVIEW === "off" || env.VISUAL_REVIEW === "enforce" ? env.VISUAL_REVIEW : "record";
      if (mode === "off") return cap({ capability: "visual_qc", provider: null, status: "disabled", realExecution: false, note: "VISUAL_REVIEW=off" });
      return cap({
        capability: "visual_qc",
        provider: vr.available ? vr.provider : null,
        status: vr.available ? "experimental" : "unavailable",
        realExecution: vr.available,
        supports: vr.available ? [mode] : [],
        note: vr.available
          ? mode === "record" ? "frames reviewed against canon; contradictions recorded, shots not blocked (not calibrated)" : "contradictions fail the shot"
          : "no vision model configured (visual_review route) — shots are not reviewed",
      });
    })(),
    cap({
      capability: "technical_qc",
      provider: "cineforge",
      status: "experimental",
      realExecution: true,
      note: "artifact verification + timing gate; full sync gate in the render path is W5",
    }),
  ];
  return list;
}

/** Output formats a production may request right now (DOS-78: the UI offers only these). */
export function offeredFormats(registry: Capability[]): string[] {
  const video = registry.find((c) => c.capability === "video_generation");
  const up = registry.find((c) => c.capability === "upscale_4k");
  const base = video?.realExecution ? video.supports ?? [] : [];
  return up?.realExecution && base.length ? [...base, "4k"] : base;
}
