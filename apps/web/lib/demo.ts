/**
 * Demo pipeline simulator. Faithfully reproduces the backend's flow and event
 * sequence (film.processor → director.service → video/audio → render.processor)
 * so the deployed page is a real window into how the system runs, even without
 * a live API. The Director content matches apps/worker/src/director/director.service.ts.
 */
import { planScenes, planShotsPerScene, estimateMs, msToUsd } from "./system";
import { isStillMotion, type ProductionSpec } from "./production-types";

export type ProjectStatus = "PLANNING" | "GENERATING" | "RENDERING" | "READY";

export interface DemoShot {
  sceneIndex: number;
  shotIndex: number;
  status: "pending" | "generating" | "ready" | "cached";
  hue: number;
}

export interface DemoState {
  status: ProjectStatus;
  progress: number;
  estimateMs: number;
  estimateUsd: number;
  spentMs: number;
  scenes: number;
  shots: DemoShot[];
  characters: { name: string; appearance: string }[];
  locations: { name: string; description: string }[];
  renderProgress: number;
  durationSec: number;
  /** The backing project's id (live runs) — lets the UI write back (views). */
  projectId?: string;
  /** Set in Live mode on film.ready — a playable HLS (.m3u8) or MP4 URL. */
  filmUrl?: string;
  /** The film's real poster frame (films.poster_key), when the render made one. */
  posterUrl?: string;
  /** Dubbed variants: language code -> playable URL (docs/29). */
  filmLocales?: { lang: string; url: string }[];
  /** Set when the real pipeline failed or paused — shown as a banner. */
  error?: string;
  /** True when a REAL run is driving this state (worker + GPU), not the preview engine. */
  live?: boolean;
  /** Live production telemetry — only present on real runs. */
  production?: LiveProduction;
  log: string[];
}

/** One entry on the production timeline (real event, real timestamp). */
export interface TimelineEvent {
  at: number; // epoch ms
  label: string;
}

export interface LiveShot {
  id: string;
  sceneIndex: number;
  index: number;
  status: "PENDING" | "GENERATING" | "READY" | "FAILED";
  thumbUrl?: string;
  gpuMs?: number;
}

export interface LiveScene {
  id: string;
  index: number;
  heading: string | null;
  status: string;
  shots: LiveShot[];
}

export interface LiveProduction {
  projectId: string;
  startedAt: number;
  /** Auto-mode projects waiting/working ahead of this one when it was queued. */
  queuedAhead: number;
  /** True once the worker has claimed the project (Director running). */
  claimed: boolean;
  /** True while any shot is on the GPU. */
  gpuActive: boolean;
  /** Display name of the video engine driving this production. */
  engine?: string;
  /** Estimated remaining ms (serialized GPU, measured per-shot average). */
  etaMs?: number;
  spentMs: number;
  timeline: TimelineEvent[];
  scenes: LiveScene[];
}

export interface DemoConfig {
  resolution?: string;
  aspectRatio?: string;
  /** "three": review the story and each storyboard before any video (W8b). */
  passMode?: "single" | "three";
  /** What is being made (W11): format, medium, animation style, episodes. */
  production?: ProductionSpec;
  prompt: string;
  modelId: string;
  targetSeconds: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DemoRun {
  private cancelled = false;
  constructor(
    private readonly cfg: DemoConfig,
    private readonly onUpdate: (s: DemoState) => void,
  ) {}

  cancel() {
    this.cancelled = true;
  }

  async start() {
    const scenes = planScenes(this.cfg.targetSeconds);
    const per = planShotsPerScene();
    const estMs = estimateMs(this.cfg.modelId, this.cfg.targetSeconds, { stillMotion: this.cfg.production ? isStillMotion(this.cfg.production) : false });

    const shots: DemoShot[] = [];
    for (let s = 0; s < scenes; s++)
      for (let i = 0; i < per; i++)
        shots.push({ sceneIndex: s, shotIndex: i, status: "pending", hue: (s * 47 + i * 13) % 360 });

    const state: DemoState = {
      status: "PLANNING",
      progress: 0,
      estimateMs: estMs,
      estimateUsd: msToUsd(estMs),
      spentMs: 0,
      scenes,
      shots,
      characters: [],
      locations: [],
      renderProgress: 0,
      durationSec: this.cfg.targetSeconds,
      log: [],
    };
    const push = (line: string) => {
      state.log = [...state.log, line].slice(-40);
      this.onUpdate({ ...state, shots: [...state.shots] });
    };

    // ── Director planning (matches director.service.ts stub) ──────────
    push(`▶ generate-film  model=${this.cfg.modelId}  target=${this.cfg.targetSeconds}s`);
    push(`◆ GPU pool ${this.cfg.modelId}: ensureRunning() → STARTING…`);
    await sleep(700);
    if (this.cancelled) return;
    push(`◆ GPU pool ${this.cfg.modelId}: RUNNING (healthy)`);
    push(`◆ Director: planning ${scenes} scenes × ${per} shots`);
    state.characters = [{ name: "Adisa", appearance: "a regal warrior, dark skin, gold-threaded robes" }];
    state.locations = [{ name: "The Kingdom", description: "a vast sunlit African kingdom of red earth and stone" }];
    push(`◆ Character Bible: Adisa  ·  World Bible: The Kingdom`);
    await sleep(600);
    if (this.cancelled) return;

    // ── Generating: shots fan out across the GPU pool ─────────────────
    state.status = "GENERATING";
    push(`◆ Queue: fan-out ${shots.length} video-jobs (flow: render ← scene ← shots+music)`);
    const perShotMs = estMs / Math.max(1, shots.length);
    const stepDelay = Math.max(40, Math.min(180, 4000 / shots.length));
    for (let k = 0; k < shots.length; k++) {
      if (this.cancelled) return;
      shots[k].status = "generating";
      this.onUpdate({ ...state, shots: [...shots] });
      await sleep(stepDelay);
      // ~1 in 6 is a cache hit (C7) — zero GPU spend.
      const cached = k > 0 && k % 6 === 0;
      shots[k].status = cached ? "cached" : "ready";
      if (!cached) state.spentMs += perShotMs;
      state.progress = (k + 1) / shots.length;
      if (k % per === per - 1) push(`  scene ${shots[k].sceneIndex + 1}/${scenes} ready`);
      if (cached) push(`  ⧉ cache hit shot ${k} (0 GPU)`);
      this.onUpdate({ ...state, shots: [...shots] });
    }

    // ── Render (FFmpeg) ───────────────────────────────────────────────
    state.status = "RENDERING";
    push(`◆ FFmpeg: normalize → concat → ducked mix → mux → HLS`);
    for (let p = 0; p <= 100; p += 5) {
      if (this.cancelled) return;
      state.renderProgress = p / 100;
      this.onUpdate({ ...state });
      await sleep(70);
    }
    push(`◆ GPU pool ${this.cfg.modelId}: queue empty → idle timer (auto-shutdown after grace)`);

    state.status = "READY";
    state.progress = 1;
    push(`✓ film.ready  ·  spent ${(state.spentMs / 60000).toFixed(1)} GPU-min  ·  ~$${msToUsd(state.spentMs).toFixed(2)}`);
    this.onUpdate({ ...state });
  }
}
