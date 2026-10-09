/**
 * Mirrors the real backend's planning + cost math (packages/shared/planning.ts,
 * packages/model-adapters/cost.ts) so the Studio shows the same numbers the
 * server would compute. Single source for the UI.
 */

export const AVG_SCENE_SEC = 18;
export const AVG_SHOT_SEC = 5;

export type Tier = "FREE" | "CREATOR" | "STUDIO" | "AGENCY" | "ENTERPRISE";

export interface ModelInfo {
  id: string;
  name: string;
  klass: "primary" | "premium";
  tiers: Tier[];
  msPer720Shot: number;
}

export const MODELS: ModelInfo[] = [
  // msPer720Shot must track REAL inference time: the worker pauses a project
  // when GPU spend exceeds estimate × 1.25, so a low-ball here strands films
  // mid-generation. Measured: Wan on the A40 ≈ 40–80s/shot (14B much more);
  // Cinematic (fal.ai frontier models) ≈ 1–3 wall-minutes/shot, run in parallel.
  { id: "wan-2.1", name: "Wan 2.1 · own GPU", klass: "primary", tiers: ["FREE", "CREATOR", "STUDIO", "AGENCY", "ENTERPRISE"], msPer720Shot: 80_000 },
  { id: "cinematic", name: "Kling 2.1 · fal.ai", klass: "premium", tiers: ["STUDIO", "AGENCY", "ENTERPRISE"], msPer720Shot: 180_000 },
];

export function modelAllowed(modelId: string, tier: Tier): boolean {
  return MODELS.find((m) => m.id === modelId)?.tiers.includes(tier) ?? false;
}

export function planScenes(targetSeconds: number): number {
  return Math.min(400, Math.max(1, Math.round(targetSeconds / AVG_SCENE_SEC)));
}
export function planShotsPerScene(): number {
  return Math.max(1, Math.ceil(AVG_SCENE_SEC / AVG_SHOT_SEC));
}
export function planShots(targetSeconds: number): number {
  return planScenes(targetSeconds) * planShotsPerScene();
}

/** GPU-ms estimate (docs/24 §C8). */
export function estimateMs(modelId: string, targetSeconds: number): number {
  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0];
  const scenes = planScenes(targetSeconds);
  const shots = planShots(targetSeconds);
  const video = shots * model.msPer720Shot;
  const audio = scenes * 2_000;
  const render = Math.round(video * 0.05);
  return video + audio + render;
}

/** Rough USD using an A40 at ~$0.45/hr (self-hosted; no per-generation fees). */
export function msToUsd(ms: number): number {
  return ms * (0.45 / 3_600_000);
}

export function fmtMs(ms: number): string {
  const min = ms / 60_000;
  return min >= 1 ? `${min.toFixed(1)} GPU-min` : `${(ms / 1000).toFixed(1)} GPU-s`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? (s ? `${m}m ${s}s` : `${m}m`) : `${s}s`;
}

/**
 * Reality Gate (DirectorOS DOS-73): how far each subsystem actually is — never
 * "complete" because it is wired.
 *  DESIGNED          documented only
 *  SCAFFOLDED        code shape exists, no real operation
 *  WIRED             connected, real operation not proven
 *  FUNCTIONAL        the real operation runs and is unit-tested
 *  INTEGRATED        runs in the production path end to end
 *  VALIDATED         an independent acceptance test verifies real artifacts
 *  PRODUCTION_READY  validated + operated in production
 * Nothing here is VALIDATED yet: the real-provider and 3-minute-film
 * acceptance tests exist (W10, docs/55) but have not been run on production.
 * Whether a capability is reachable RIGHT NOW comes from the live registry
 * (lib/truth.ts), not from this list.
 */
export type Maturity = "DESIGNED" | "SCAFFOLDED" | "WIRED" | "FUNCTIONAL" | "INTEGRATED" | "VALIDATED" | "PRODUCTION_READY";

export interface Subsystem {
  name: string;
  maturity: Maturity;
  blurb: string;
  doc: string;
  /** Live capability (system_capabilities) that says whether it runs now. */
  capability?: string;
}

export const MATURITY_TONE: Record<Maturity, "ok" | "live" | "warn" | "idle"> = {
  PRODUCTION_READY: "ok",
  VALIDATED: "ok",
  INTEGRATED: "live",
  FUNCTIONAL: "live",
  WIRED: "warn",
  SCAFFOLDED: "warn",
  DESIGNED: "idle",
};

export const SUBSYSTEMS: Subsystem[] = [
  { name: "AI Director (provider-neutral)", maturity: "INTEGRATED", capability: "film_planning", blurb: "One master call returns the Film IR (cast, world, props, acts, threads, scenes, dialogue, shots); a five-stage validator and at most one surgical revision; a deterministic compiler turns it into the plan. Routed per task (Claude by default) and logged per call.", doc: "docs/45-directoros-intelligence.md" },
  { name: "Continuity Engine", maturity: "INTEGRATED", blurb: "Typed, id-keyed world state per scene (wardrobe, injuries, holdings, story time, who knows what, who is alive, how characters stand with each other). Every shot is checked against it before generation and gets only the in-frame characters' references; canon changes regenerate only the shots they touch. It checks plans and requests, not generated pixels (W5).", doc: "docs/46-directoros-world-state.md" },
  { name: "Character & World Bible", maturity: "INTEGRATED", capability: "lora_identity", blurb: "The whole cast, locations and props with canonical identity and wardrobe, versioned with the film's plan. Reference frames feed identity per character, plus a generated reference still per wardrobe that is remade when canon changes; identity-model training is disabled until a trainer is configured.", doc: "docs/07-character-bible.md" },
  { name: "Video Models (Wan / Hunyuan / External)", maturity: "INTEGRATED", capability: "video_generation", blurb: "Pluggable adapters behind the Media Runtime Gateway. The GPU reports what it actually ran (size, frames, inputs used); placeholder output is refused.", doc: "docs/22-video-models.md" },
  { name: "OpenAI Images (GPT-image-1)", maturity: "INTEGRATED", capability: "seed_image_generation", blurb: "Seed stills for image-to-video. When unavailable the shot runs text-to-video and that is recorded on the production.", doc: "docs/22-video-models.md" },
  { name: "Film voices", maturity: "INTEGRATED", capability: "narration_tts", blurb: "Each scene's voice-over and dialogue on the Voice Engine: the narrator, and every character in the voice you chose for them or a distinct built-in voice; each line mastered and timed. A chosen voice that cannot be used is reported. Plans are checked so speech fits its scene.", doc: "docs/51-directoros-voice-engine.md" },
  { name: "Voice Engine", maturity: "INTEGRATED", capability: "voice_cloning", blurb: "Model-independent voice service: a voice is cloned only with recorded consent and after its recording passes a quality check; speech is segmented, spoken by the configured engine, mastered to -16 LUFS 48 kHz WAV outside the model, and delivered as a job. Only the owner can use a voice. Self-hosted voice models wait on Phase 1.", doc: "docs/51-directoros-voice-engine.md" },
  { name: "Auto GPU Lifecycle", maturity: "INTEGRATED", blurb: "Reference-counted start-on-demand + auto-shutdown after the last job. Unit-tested.", doc: "docs/23-gpu-lifecycle-manager.md" },
  { name: "Cluster Scheduler (C5)", maturity: "FUNCTIONAL", blurb: "Heterogeneous routing + weighted-fair per-tenant scheduling, unit-tested; production runs one GPU pool today.", doc: "docs/24-phase-3-film-studio.md" },
  { name: "Cost Governor (C8)", maturity: "INTEGRATED", blurb: "Pre-flight estimate, credit gate, metered debit, live budget pause/resume. Meters video GPU time only (LLM, TTS, image and music are not metered yet).", doc: "docs/24-phase-3-film-studio.md" },
  { name: "Asset Cache + Provenance (C7)", maturity: "INTEGRATED", blurb: "Content-addressed cacheKey + seed/model-version provenance. The key does not yet include continuity state (W4).", doc: "docs/24-phase-3-film-studio.md" },
  { name: "BullMQ Queues + Flow", maturity: "INTEGRATED", blurb: "film → scene → video/audio → render fan-out; a terminal shot failure fails the film with its reason.", doc: "docs/13-queues.md" },
  { name: "FFmpeg Render Engine", maturity: "INTEGRATED", capability: "technical_qc", blurb: "Concat → ducked mix → mux, with real-FFmpeg regression tests. Refuses films with missing shots, unmixable sound or no storage. HLS ladder optional (RENDER_HLS=1).", doc: "docs/10-ffmpeg-render.md" },
  { name: "Realtime (Supabase)", maturity: "INTEGRATED", blurb: "Postgres Changes to the browser. The Socket.IO gateway in apps/api is not deployed.", doc: "docs/04-api-spec.md" },
  { name: "Evaluation & acceptance", maturity: "FUNCTIONAL", blurb: "Real-provider probes that decode and measure every artifact, a 100-scene benchmark with labelled continuity, dialogue, camera and voice cases that gates every change, prompt versions scored on live plans, and the 3-minute film checked sixteen ways. Built and tested; not yet run against production.", doc: "docs/55-directoros-evaluation-and-acceptance.md" },
  { name: "Visual & sync quality gate", maturity: "INTEGRATED", capability: "visual_qc", blurb: "Every shot is measured before it is ready (picture, length, black, frozen) and a frame is checked against canon; the finished film is measured before delivery (length, sound, loudness). Defects are recorded and shown; blocking them is switched on after calibration. The editorial pass is W8.", doc: "docs/49-directoros-quality-gates.md" },
];

/** Languages for multilingual export + Voice Studio (mirror of shared/i18n). */
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
  { code: "ar", name: "Arabic" },
  { code: "sw", name: "Swahili" },
  { code: "hi", name: "Hindi" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ru", name: "Russian" },
  { code: "yo", name: "Yoruba" },
  { code: "no", name: "Norwegian" },
  { code: "sv", name: "Swedish" },
  { code: "ig", name: "Igbo" },
  { code: "ln", name: "Lingala" },
  { code: "lg", name: "Luganda" },
  { code: "zu", name: "Zulu" },
  { code: "pcm", name: "Nigerian Pidgin" },
] as const;
