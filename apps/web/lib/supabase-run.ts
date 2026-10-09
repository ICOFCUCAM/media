"use client";

/**
 * Supabase run — drives a create surface from the REAL pipeline without an API
 * server: inserts the project row (status=PLANNING, mode=auto), which the
 * worker's project poller claims and takes through Director → GPU → FFmpeg.
 *
 * Everything shown is real backend state, streamed over Supabase Realtime
 * (Postgres Changes) on the projects/scenes/shots tables the worker writes:
 *  - production timeline (timestamped events as they actually happen)
 *  - per-scene / per-shot pipeline with GPU timings and real thumbnails
 *  - queue position, measured per-shot average → live ETA
 *  - worker/GPU activity, budget spend
 * On READY the finished film's mp4 resolves to a signed, playable URL.
 *
 * Throws from start() when Supabase/auth isn't available — the caller falls
 * back to the in-browser preview engine (which the UI labels loudly).
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { planScenes, planShotsPerScene, estimateMs, msToUsd, MODELS } from "./system";
import { createProject, subscribeProject, type ProjectRow } from "./projects";
import { getSupabase } from "./supabase";
import { signedUrl } from "./storyboard";
import type { DemoConfig, DemoShot, DemoState, LiveProduction, LiveScene, LiveShot, ProjectStatus } from "./demo";
import { isStillMotion } from "./production-types";

const STATUS_MAP: Record<string, ProjectStatus> = {
  DRAFT: "PLANNING",
  PLANNING: "PLANNING",
  GENERATING: "GENERATING",
  RENDERING: "RENDERING",
  READY: "READY",
  REVIEW: "PLANNING", // a three-pass production waiting for the owner (W8b) — the Passes panel says what
};

const ts = () => new Date().toLocaleTimeString([], { hour12: false });

export class SupabaseRun {
  private channels: RealtimeChannel[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private cancelled = false;
  private filmResolved = false;
  private scenesLoaded = false;

  constructor(
    private readonly cfg: DemoConfig,
    private readonly onUpdate: (s: DemoState) => void,
    /** Attach to an EXISTING project (command center) instead of creating one. */
    private readonly existing?: { id: string; createdAt: string; status: string },
  ) {}

  cancel() {
    this.cancelled = true;
    this.channels.forEach((c) => void c.unsubscribe());
    this.timers.forEach(clearTimeout);
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(() => !this.cancelled && fn(), ms));
  }

  async start() {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase not configured");
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const sceneCount = planScenes(this.cfg.targetSeconds);
    const per = planShotsPerScene();
    const totalShots = sceneCount * per;
    const estMs = estimateMs(this.cfg.modelId, this.cfg.targetSeconds, { stillMotion: this.cfg.production ? isStillMotion(this.cfg.production) : false });
    const perShotMs = MODELS.find((m) => m.id === this.cfg.modelId)?.msPer720Shot ?? 80_000;

    // The legacy storyboard grid (used by the preview engine) stays in sync so
    // older UI pieces keep working; the scene pipeline below is the real view.
    const gridShots: DemoShot[] = [];
    for (let s = 0; s < sceneCount; s++)
      for (let i = 0; i < per; i++)
        gridShots.push({ sceneIndex: s, shotIndex: i, status: "pending", hue: (s * 47 + i * 13) % 360 });

    const production: LiveProduction = {
      projectId: "",
      startedAt: Date.now(),
      queuedAhead: 0,
      claimed: false,
      gpuActive: false,
      engine: MODELS.find((m) => m.id === this.cfg.modelId)?.name ?? this.cfg.modelId,
      etaMs: totalShots * perShotMs,
      spentMs: 0,
      timeline: [],
      scenes: [],
    };

    const state: DemoState = {
      status: "PLANNING",
      progress: 0,
      estimateMs: estMs,
      estimateUsd: msToUsd(estMs),
      spentMs: 0,
      scenes: sceneCount,
      shots: gridShots,
      characters: [],
      locations: [],
      renderProgress: 0,
      durationSec: this.cfg.targetSeconds,
      live: true,
      production,
      log: [],
    };

    const emit = () =>
      this.onUpdate({
        ...state,
        shots: [...state.shots],
        production: { ...production, timeline: [...production.timeline], scenes: production.scenes.map((sc) => ({ ...sc, shots: [...sc.shots] })) },
      });
    const push = (l: string) => {
      state.log = [...state.log, `${ts()} · ${l}`].slice(-60);
      emit();
    };
    const mark = (label: string) => {
      production.timeline = [...production.timeline, { at: Date.now(), label }];
      push(label);
    };

    // Real queue depth: auto-mode projects waiting or in production right now.
    try {
      const { count } = await sb
        .from("projects")
        .select("id", { count: "exact", head: true })
        .in("status", ["PLANNING", "GENERATING", "RENDERING"])
        .eq("mode", "auto");
      production.queuedAhead = Math.max(0, count ?? 0);
    } catch {
      /* queue depth is cosmetic */
    }

    // Friendly credit check (the worker enforces the authoritative gate).
    if (!this.existing) {
      const { data: me } = await sb.from("users").select("credits_ms").eq("id", auth.user.id).single();
      if (me) {
        if (me.credits_ms <= 0) {
          state.error = "Out of credits — ask for a top-up to keep creating.";
          state.log = [`${ts()} · ✕ out of credits`];
          this.onUpdate({ ...state });
          return;
        }
        push(`Credits available: ${(me.credits_ms / 60000).toFixed(0)} GPU-min`);
      }
    }

    let projectId: string;
    if (this.existing) {
      // Command-center mode: attach to a project that already exists. The
      // timeline back-fills from real DB timestamps in loadScenes.
      projectId = this.existing.id;
      production.timeline = [{ at: Date.parse(this.existing.createdAt), label: "Project created" }];
      if (this.existing.status !== "PLANNING" && this.existing.status !== "DRAFT") {
        production.claimed = true; // history — don't re-announce the claim
        void this.loadScenes(projectId, state, production, mark, emit);
      }
    } else {
      mark("Project submitted to the production queue");
      const project = await createProject({
        title: this.cfg.title?.trim() || this.cfg.prompt.slice(0, 60),
        prompt: this.cfg.prompt,
        targetSeconds: this.cfg.targetSeconds,
        modelId: this.cfg.modelId,
        estimatedMs: estMs,
        resolution: this.cfg.resolution,
        aspectRatio: this.cfg.aspectRatio,
        passMode: this.cfg.passMode,
        production: this.cfg.production,
        castIds: this.cfg.castIds,
      });
      if (this.cancelled) return;
      projectId = project.id;
      mark(`Project ${project.id.slice(0, 8)} created — waiting for a worker`);
    }
    production.projectId = projectId;

    // ── Live project row (status / progress / spend / errors) ─────────────
    const reflect = (row: ProjectRow) => {
      const mapped = STATUS_MAP[row.status];
      const prev = state.status;
      if (mapped) state.status = mapped;
      if (row.spent_ms != null) {
        state.spentMs = row.spent_ms;
        production.spentMs = row.spent_ms;
      }
      if (!production.claimed && (row.status === "GENERATING" || row.status === "PLANNING")) {
        // The poller flips PLANNING→GENERATING on claim; the film processor
        // briefly sets PLANNING again while the Director writes.
        if (row.status === "GENERATING" || row.progress > 0) {
          production.claimed = true;
          mark("Worker claimed the project — Director is writing the screenplay");
          void this.loadScenes(projectId, state, production, mark, emit);
        }
      }
      if (row.status === "RENDERING" && prev !== "RENDERING") mark("Final assembly started (FFmpeg)");
      if (row.status === "FAILED") {
        state.error = row.error_message ?? "generation failed";
        mark(`Production failed: ${state.error}`);
      } else if (row.status === "PAUSED") {
        state.error = row.error_message ?? "paused (budget ceiling)";
        mark(`Production paused: ${state.error}`);
      }
      state.progress = Math.max(state.progress, row.progress ?? 0);
      emit();
      if (row.status === "READY") void this.resolveFilm(projectId, state, production, mark);
    };

    // Attach mode starts from the row's current (possibly terminal) state.
    if (this.existing) {
      const { data } = await sb.from("projects").select().eq("id", projectId).single();
      if (data) reflect(data);
    }

    const ch = subscribeProject(projectId, (row) => !this.cancelled && reflect(row));
    if (ch) this.channels.push(ch);

    // Realtime only delivers future changes; one slow safety poll catches
    // anything that slipped past before the channel connected.
    const tick = async () => {
      if (this.cancelled || state.status === "READY" || state.error) return;
      const { data } = await sb.from("projects").select().eq("id", projectId).single();
      if (data) reflect(data);
      if (!this.scenesLoaded && production.claimed) void this.loadScenes(projectId, state, production, mark, emit);
      this.later(20_000, tick);
    };
    this.later(20_000, tick);
  }

  /** Fetch the Director's scenes/shots once they exist, then track them live. */
  private async loadScenes(
    projectId: string,
    state: DemoState,
    production: LiveProduction,
    mark: (l: string) => void,
    emit: () => void,
  ) {
    if (this.scenesLoaded || this.cancelled) return;
    const sb = getSupabase();
    if (!sb) return;

    const { data: scenes } = await sb
      .from("scenes")
      .select("id, index, heading, status, created_at, updated_at")
      .eq("project_id", projectId)
      .order("index");
    if (!scenes || scenes.length === 0) {
      this.later(5_000, () => this.loadScenes(projectId, state, production, mark, emit));
      return;
    }
    const sceneIds = scenes.map((s) => s.id);
    const { data: shots } = await sb
      .from("shots")
      .select("id, scene_id, index, status, thumbnail_key, seed_image_key, gpu_ms, updated_at")
      .in("scene_id", sceneIds)
      .order("index");
    if (!shots || shots.length === 0) {
      this.later(5_000, () => this.loadScenes(projectId, state, production, mark, emit));
      return;
    }
    this.scenesLoaded = true;

    const byScene = new Map<string, LiveScene>();
    production.scenes = scenes.map((sc) => {
      const view: LiveScene = { id: sc.id, index: sc.index, heading: sc.heading, status: sc.status, shots: [] };
      byScene.set(sc.id, view);
      return view;
    });
    const backfill: { at: number; label: string }[] = [];
    for (const sh of shots) {
      const scene = byScene.get(sh.scene_id);
      if (!scene) continue;
      const view: LiveShot = {
        id: sh.id,
        sceneIndex: scene.index,
        index: sh.index,
        status: (sh.status as LiveShot["status"]) ?? "PENDING",
        gpuMs: sh.gpu_ms ?? undefined,
      };
      scene.shots.push(view);
      // Back-fill history: shots that finished before we attached/loaded get
      // their REAL completion timestamps and thumbnails. A painted-but-not-yet-
      // rendered shot shows its OpenAI scene still until the video lands.
      const tileKey = view.status === "READY" && sh.thumbnail_key ? sh.thumbnail_key : (sh.thumbnail_key ?? sh.seed_image_key);
      if (tileKey)
        void signedUrl(tileKey).then((url) => {
          if (url && !this.cancelled) {
            view.thumbUrl = url;
            emit();
          }
        });
      if (view.status === "READY") {
        backfill.push({
          at: Date.parse(sh.updated_at),
          label: `Shot ${scene.index + 1}.${view.index + 1} rendered${sh.gpu_ms ? ` in ${Math.round(sh.gpu_ms / 1000)}s GPU` : ""}`,
        });
      }
    }
    for (const sc of scenes)
      if (sc.status === "READY") backfill.push({ at: Date.parse(sc.updated_at), label: `Scene ${sc.index + 1} finalized` });

    state.scenes = scenes.length;
    const screenplayLabel = `Screenplay ready — ${scenes.length} scene${scenes.length > 1 ? "s" : ""}, ${shots.length} shots planned`;
    if (this.existing) {
      // Historical: stamp the screenplay at its real creation time.
      backfill.push({ at: Date.parse(scenes[0].created_at), label: screenplayLabel });
      production.timeline = [...production.timeline, ...backfill].sort((a, b) => a.at - b.at);
      emit();
    } else {
      if (backfill.length > 0) production.timeline = [...production.timeline, ...backfill].sort((a, b) => a.at - b.at);
      mark(screenplayLabel);
    }
    this.recompute(state, production, emit);

    // Per-shot updates: GPU start/finish, thumbnails, timings.
    const shotCh = sb
      .channel(`shots:${projectId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shots", filter: `scene_id=in.(${sceneIds.join(",")})` },
        (payload) => {
          if (this.cancelled) return;
          const row = payload.new as {
            id: string;
            status: string;
            thumbnail_key: string | null;
            seed_image_key: string | null;
            gpu_ms: number | null;
          };
          for (const scene of production.scenes) {
            const shot = scene.shots.find((s) => s.id === row.id);
            if (!shot) continue;
            const was = shot.status;
            shot.status = (row.status as LiveShot["status"]) ?? shot.status;
            shot.gpuMs = row.gpu_ms ?? shot.gpuMs;
            // OpenAI scene still lands before the video — show it immediately.
            if (row.seed_image_key && !shot.thumbUrl && shot.status !== "READY") {
              mark(`Shot ${scene.index + 1}.${shot.index + 1} — scene still painted (OpenAI)`);
              void signedUrl(row.seed_image_key).then((url) => {
                if (url && !this.cancelled && !shot.thumbUrl) {
                  shot.thumbUrl = url;
                  emit();
                }
              });
            }
            if (shot.status === "GENERATING" && was !== "GENERATING")
              mark(`Shot ${scene.index + 1}.${shot.index + 1} — generating (${MODELS.find((m) => m.id === this.cfg.modelId)?.name ?? this.cfg.modelId})`);
            if (shot.status === "READY" && was !== "READY") {
              mark(`Shot ${scene.index + 1}.${shot.index + 1} rendered${row.gpu_ms ? ` in ${Math.round(row.gpu_ms / 1000)}s GPU` : ""}`);
              if (row.thumbnail_key)
                void signedUrl(row.thumbnail_key).then((url) => {
                  if (url && !this.cancelled) {
                    shot.thumbUrl = url; // video frame replaces the still
                    emit();
                  }
                });
            }
            this.recompute(state, production, emit);
            return;
          }
        },
      )
      .subscribe();
    this.channels.push(shotCh);

    // Per-scene updates (finalize).
    const sceneCh = sb
      .channel(`scenes:${projectId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scenes", filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (this.cancelled) return;
          const row = payload.new as { id: string; status: string };
          const scene = production.scenes.find((s) => s.id === row.id);
          if (scene && scene.status !== row.status) {
            scene.status = row.status;
            if (row.status === "READY") mark(`Scene ${scene.index + 1} finalized`);
            this.recompute(state, production, emit);
          }
        },
      )
      .subscribe();
    this.channels.push(sceneCh);
  }

  /** Recompute progress / ETA / GPU activity from the real shot states. */
  private recompute(state: DemoState, production: LiveProduction, emit: () => void) {
    const all = production.scenes.flatMap((s) => s.shots);
    if (all.length === 0) return emit();
    const ready = all.filter((s) => s.status === "READY");
    const generating = all.some((s) => s.status === "GENERATING");
    production.gpuActive = generating;

    // Measured per-shot average (falls back to the model's planning figure).
    const timed = ready.filter((s) => (s.gpuMs ?? 0) > 0);
    const avg =
      timed.length > 0
        ? timed.reduce((a, s) => a + (s.gpuMs ?? 0), 0) / timed.length
        : (MODELS.find((m) => m.id === this.cfg.modelId)?.msPer720Shot ?? 80_000);
    const remaining = all.length - ready.length;
    production.etaMs = state.status === "READY" ? 0 : Math.round(remaining * avg + (state.status === "RENDERING" ? 0 : 30_000));

    // Real progress from real shots (the project row only updates per scene).
    state.progress = Math.max(state.progress, all.length ? (ready.length / all.length) * 0.9 : 0);

    // Mirror into the legacy grid.
    state.shots = state.shots.map((gs) => {
      const real = production.scenes.find((sc) => sc.index === gs.sceneIndex)?.shots.find((sh) => sh.index === gs.shotIndex);
      if (!real) return gs;
      return { ...gs, status: real.status === "READY" ? "ready" : real.status === "GENERATING" ? "generating" : "pending" };
    });
    emit();
  }

  private async resolveFilm(
    projectId: string,
    state: DemoState,
    production: LiveProduction,
    mark: (l: string) => void,
  ) {
    if (this.filmResolved) return;
    this.filmResolved = true;
    const sb = getSupabase();
    if (!sb) return;
    const { data: film } = await sb.from("films").select().eq("project_id", projectId).maybeSingle();
    state.status = "READY";
    state.projectId = projectId;
    state.progress = 1;
    production.etaMs = 0;
    production.gpuActive = false;
    state.shots = state.shots.map((s) => ({ ...s, status: "ready" }));
    if (film?.poster_key) state.posterUrl = (await signedUrl(film.poster_key)) ?? undefined;
    if (film?.mp4_key) {
      const url = await signedUrl(film.mp4_key);
      // 4K master (docs/33): exposed as a downloadable pill when upscaled.
      if (film.mp4_4k_key) {
        const u4k = await signedUrl(film.mp4_4k_key);
        if (u4k) state.filmLocales = [{ lang: "4K", url: u4k }, ...(state.filmLocales ?? [])];
      }
      // Dubbed variants (docs/29): one playable link per language.
      const locales = (film.locales ?? {}) as Record<string, { mp4?: string }>;
      const entries = await Promise.all(
        Object.entries(locales)
          .filter(([, v]) => v?.mp4)
          .map(async ([lang, v]) => ({ lang, url: (await signedUrl(v.mp4!)) ?? "" })),
      );
      state.filmLocales = [...(state.filmLocales ?? []), ...entries.filter((e) => e.url)];
      if (url) {
        state.filmUrl = url;
        if (this.existing && film.published_at) {
          // Historical: stamp packaging at its real time.
          production.timeline = [...production.timeline, { at: Date.parse(film.published_at), label: "Film packaged — streaming from storage" }].sort(
            (a, b) => a.at - b.at,
          );
          this.onUpdate({ ...state, production: { ...production } });
        } else {
          mark("Film packaged — streaming from storage");
        }
        return;
      }
    }
    mark("Film ready");
  }
}
