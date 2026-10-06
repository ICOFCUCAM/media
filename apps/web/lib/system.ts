/**
 * Mirrors the real backend's planning + cost math (packages/shared/planning.ts,
 * packages/model-adapters/cost.ts) so the Studio shows the same numbers the
 * server would compute. Single source for the UI.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "";
export const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL ?? "";
export const IS_LIVE = API_URL.length > 0;

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

/** The subsystems actually built in this repo — the "window into the system". */
export interface Subsystem {
  name: string;
  status: "Implemented" | "Stubbed" | "Design";
  blurb: string;
  doc: string;
}

export const SUBSYSTEMS: Subsystem[] = [
  { name: "AI Director (Anthropic Claude)", status: "Implemented", blurb: "Prompt → screenplay (logline, synopsis, scenes with story narration) via Claude tool-use, plus content moderation and 20-language translation. Writes every film in production.", doc: "docs/05-director-ai.md" },
  { name: "Continuity Engine", status: "Implemented", blurb: "Director-authored scene bridges + state patches fold into a per-shot state preamble and character reference frames — the same face, wardrobe and world, scene after scene. Unit-tested, runs on every shot.", doc: "docs/06-continuity-engine.md" },
  { name: "Character & World Bible", status: "Implemented", blurb: "Canonical character/location rows per film with reference frames driving visual identity; per-character LoRA training auto-enqueues (trainer pod is the remaining integration).", doc: "docs/07-character-bible.md" },
  { name: "Video Models (Wan / Hunyuan / External)", status: "Implemented", blurb: "Pluggable VideoModelAdapter + registry; self-hosted Wan/Hunyuan plus a drop-in external provider. New models = one adapter.", doc: "docs/22-video-models.md" },
  { name: "OpenAI Images (GPT-image-1)", status: "Implemented", blurb: "Seed frames for image-to-video + standalone stills, in three orientations. Adapter unit-tested.", doc: "docs/22-video-models.md" },
  { name: "OpenAI Voice (TTS · onyx)", status: "Implemented", blurb: "Narration & dialogue via tts-1 (voice 'onyx'); bytes uploaded to storage. Adapter unit-tested.", doc: "docs/22-video-models.md" },
  { name: "Auto GPU Lifecycle", status: "Implemented", blurb: "Reference-counted start-on-demand + auto-shutdown after the last job. Unit-tested.", doc: "docs/23-gpu-lifecycle-manager.md" },
  { name: "Cluster Scheduler (C5)", status: "Implemented", blurb: "Heterogeneous A40/A100/H100 routing + weighted-fair per-tenant scheduling. Tested.", doc: "docs/24-phase-3-film-studio.md" },
  { name: "Cost Governor (C8)", status: "Implemented", blurb: "Pre-flight estimate, credit gate, metered debit, live budget pause/resume. Tested.", doc: "docs/24-phase-3-film-studio.md" },
  { name: "Asset Cache + Provenance (C7)", status: "Implemented", blurb: "Content-addressed cacheKey + seed/model-version provenance; cheap editor re-renders. Tested.", doc: "docs/24-phase-3-film-studio.md" },
  { name: "BullMQ Queues + Flow", status: "Implemented", blurb: "film → scene → video/audio → render fan-out with dependency-enforcing flows.", doc: "docs/13-queues.md" },
  { name: "FFmpeg Render Engine", status: "Implemented", blurb: "Normalize → concat → ducked mix → mux → HLS ladder → S3. Builders unit-tested.", doc: "docs/10-ffmpeg-render.md" },
  { name: "Realtime (Supabase / WebSocket)", status: "Implemented", blurb: "Postgres Changes to the browser; Redis pub/sub → Socket.IO room fan-out with ownership checks.", doc: "docs/04-api-spec.md" },
];

/** Languages for multilingual export + Voice Lab (mirror of shared/i18n). */
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
