"use client";

/**
 * Supabase run — drives a create surface from the REAL pipeline without an API
 * server: inserts the project row (status=PLANNING, mode=auto), which the
 * worker's project poller claims and takes through Director → GPU → FFmpeg.
 * Status/progress round-trip back over Supabase Realtime (Postgres Changes),
 * and on READY the finished film's mp4 is resolved to a signed, playable URL.
 *
 * Mirrors LiveRun's shape (same DemoState output) so RunPanel works unchanged.
 * Throws from start() when Supabase/auth isn't available — the caller falls
 * back to the in-browser preview engine.
 */
import { planScenes, planShotsPerScene, estimateMs, msToUsd } from "./system";
import { createProject, subscribeProject, type ProjectRow } from "./projects";
import { getSupabase } from "./supabase";
import { signedUrl } from "./storyboard";
import type { DemoConfig, DemoShot, DemoState, ProjectStatus } from "./demo";

const STATUS_MAP: Record<string, ProjectStatus> = {
  DRAFT: "PLANNING",
  PLANNING: "PLANNING",
  GENERATING: "GENERATING",
  RENDERING: "RENDERING",
  READY: "READY",
};

export class SupabaseRun {
  private channel: ReturnType<typeof subscribeProject> = null;
  private cancelled = false;

  constructor(
    private readonly cfg: DemoConfig,
    private readonly onUpdate: (s: DemoState) => void,
  ) {}

  cancel() {
    this.cancelled = true;
    this.channel?.unsubscribe();
  }

  async start() {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase not configured");
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const scenes = planScenes(this.cfg.targetSeconds);
    const per = planShotsPerScene();
    const shots: DemoShot[] = [];
    for (let s = 0; s < scenes; s++)
      for (let i = 0; i < per; i++)
        shots.push({ sceneIndex: s, shotIndex: i, status: "pending", hue: (s * 47 + i * 13) % 360 });

    const estMs = estimateMs(this.cfg.modelId, this.cfg.targetSeconds);
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
    const emit = () => this.onUpdate({ ...state, shots: [...state.shots] });
    const push = (l: string) => {
      state.log = [...state.log, l].slice(-40);
      emit();
    };

    push("▶ live: creating project");
    const project = await createProject({
      title: this.cfg.prompt.slice(0, 60),
      prompt: this.cfg.prompt,
      targetSeconds: this.cfg.targetSeconds,
      modelId: this.cfg.modelId,
      estimatedMs: estMs,
    });
    if (this.cancelled) return;
    push(`◆ project ${project.id} — worker takes it from here`);

    // Reflect shot progress from the project's progress (fraction of scenes
    // ready); per-shot Realtime isn't needed for the storyboard glow.
    const reflect = (row: ProjectRow) => {
      const mapped = STATUS_MAP[row.status];
      if (mapped) state.status = mapped;
      state.progress = row.progress ?? state.progress;
      if (row.spent_ms != null) state.spentMs = row.spent_ms;
      const readyCount = Math.round((row.progress ?? 0) * shots.length);
      state.shots = state.shots.map((s, i) => ({
        ...s,
        status: i < readyCount ? "ready" : state.status === "GENERATING" && i < readyCount + per ? "generating" : s.status === "ready" ? "ready" : "pending",
      }));
      if (row.status === "FAILED") {
        state.error = row.error_message ?? "generation failed";
        push(`✕ failed: ${state.error}`);
      } else if (row.status === "PAUSED") {
        state.error = row.error_message ?? "paused (budget ceiling)";
        push(`⏸ ${state.error}`);
      }
      emit();
    };

    this.channel = subscribeProject(project.id, (row) => {
      if (this.cancelled) return;
      reflect(row);
      if (row.status === "READY") void this.resolveFilm(project.id, state, push);
    });

    // Realtime only delivers future changes — poll once a minute as a safety
    // net in case an update slipped past before the channel was live.
    const tick = async () => {
      if (this.cancelled || state.status === "READY" || state.error) return;
      const { data } = await sb.from("projects").select().eq("id", project.id).single();
      if (data) {
        reflect(data);
        if (data.status === "READY") void this.resolveFilm(project.id, state, push);
        else setTimeout(tick, 60_000);
      } else setTimeout(tick, 60_000);
    };
    setTimeout(tick, 60_000);
  }

  private async resolveFilm(projectId: string, state: DemoState, push: (l: string) => void) {
    const sb = getSupabase();
    if (!sb) return;
    const { data: film } = await sb.from("films").select().eq("project_id", projectId).maybeSingle();
    state.status = "READY";
    state.progress = 1;
    state.shots = state.shots.map((s) => ({ ...s, status: "ready" }));
    if (film?.mp4_key) {
      const url = await signedUrl(film.mp4_key);
      if (url) {
        state.filmUrl = url;
        push("◆ film ready — streaming from storage");
      }
    }
    this.onUpdate({ ...state, shots: [...state.shots] });
  }
}
