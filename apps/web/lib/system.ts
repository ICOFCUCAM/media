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

export type Tier = "FREE" | "CREATOR" | "STUDIO" | "ENTERPRISE";

export interface ModelInfo {
  id: string;
  name: string;
  klass: "primary" | "premium";
  tiers: Tier[];
  msPer720Shot: number;
}

export const MODELS: ModelInfo[] = [
  { id: "wan-2.1", name: "Wan 2.1", klass: "primary", tiers: ["FREE", "CREATOR", "STUDIO", "ENTERPRISE"], msPer720Shot: 12_000 },
  { id: "hunyuan", name: "Hunyuan Video", klass: "premium", tiers: ["STUDIO", "ENTERPRISE"], msPer720Shot: 22_000 },
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
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** The subsystems actually built in this repo — the "window into the system". */
export interface Subsystem {
  name: string;
  status: "Implemented" | "Stubbed" | "Design";
  blurb: string;
  doc: string;
}

export const SUBSYSTEMS: Subsystem[] = [
  { name: "AI Director", status: "Stubbed", blurb: "Prompt → screenplay → scenes → shots with deterministic seeds, prompts & camera. LLM content stubbed; structure is real.", doc: "docs/05-director-ai.md" },
  { name: "Continuity Engine", status: "Design", blurb: "Per-scene canonical state (wardrobe, world, story flags) so characters & locations never drift.", doc: "docs/06-continuity-engine.md" },
  { name: "Character & World Bible", status: "Stubbed", blurb: "Reusable, referenced (not inlined) character/location definitions with identity refs.", doc: "docs/07-character-bible.md" },
  { name: "Model Abstraction (Wan / Hunyuan)", status: "Implemented", blurb: "Pluggable VideoModelAdapter + registry; tier-gated routing. New models = one adapter.", doc: "docs/22-video-models.md" },
  { name: "Auto GPU Lifecycle", status: "Implemented", blurb: "Reference-counted start-on-demand + auto-shutdown after the last job. Unit-tested.", doc: "docs/23-gpu-lifecycle-manager.md" },
  { name: "Cluster Scheduler (C5)", status: "Implemented", blurb: "Heterogeneous A40/A100/H100 routing + weighted-fair per-tenant scheduling. Tested.", doc: "docs/24-phase-3-film-studio.md" },
  { name: "Cost Governor (C8)", status: "Implemented", blurb: "Pre-flight estimate, credit gate, metered debit, live budget pause/resume. Tested.", doc: "docs/24-phase-3-film-studio.md" },
  { name: "Asset Cache + Provenance (C7)", status: "Implemented", blurb: "Content-addressed cacheKey + seed/model-version provenance; cheap editor re-renders. Tested.", doc: "docs/24-phase-3-film-studio.md" },
  { name: "BullMQ Queues + Flow", status: "Implemented", blurb: "film → scene → video/audio → render fan-out with dependency-enforcing flows.", doc: "docs/13-queues.md" },
  { name: "FFmpeg Render Engine", status: "Implemented", blurb: "Normalize → concat → ducked mix → mux → HLS ladder → S3. Builders unit-tested.", doc: "docs/10-ffmpeg-render.md" },
  { name: "Realtime (WebSocket)", status: "Implemented", blurb: "Redis pub/sub → Socket.IO room fan-out with project-ownership checks.", doc: "docs/04-api-spec.md" },
];
