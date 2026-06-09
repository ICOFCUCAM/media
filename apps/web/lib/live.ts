/**
 * Live run — drives the Studio from the REAL backend (apps/api) when
 * NEXT_PUBLIC_API_URL is set: creates a project, fetches the pre-flight
 * estimate, connects to the Socket.IO gateway, subscribes to the project room,
 * and translates the real realtime events (project.progress / scene.ready /
 * shot.ready / render.progress / film.ready / project.paused) into the same
 * DemoState the Studio renders. On film.ready it resolves a playable stream URL
 * for the hls.js player.
 *
 * Produces the identical UI shape as the demo engine, so the Studio components
 * work unchanged. Falls back to demo if the API is unreachable.
 */
import { io, type Socket } from "socket.io-client";
import { API_URL, WS_URL, CDN_URL, planScenes, planShotsPerScene, estimateMs, msToUsd } from "./system";
import { createProject, generateFilm, getEstimate, getFilm } from "./api";
import type { DemoConfig, DemoShot, DemoState, ProjectStatus } from "./demo";

const STATUSES: ProjectStatus[] = ["PLANNING", "GENERATING", "RENDERING", "READY"];

export class LiveRun {
  private socket?: Socket;
  private cancelled = false;

  constructor(
    private readonly cfg: DemoConfig,
    private readonly onUpdate: (s: DemoState) => void,
    private readonly token?: string,
  ) {}

  cancel() {
    this.cancelled = true;
    this.socket?.disconnect();
  }

  async start() {
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

    // Create the project (throws -> caller falls back to demo).
    push("▶ live: POST /projects");
    const created = await createProject(
      { title: this.cfg.prompt.slice(0, 60), prompt: this.cfg.prompt, targetSeconds: this.cfg.targetSeconds, modelId: this.cfg.modelId },
      this.token,
    );
    const projectId: string = created?.project?.id ?? created?.id;
    if (!projectId) throw new Error("no projectId from API");
    push(`◆ project ${projectId}`);

    try {
      const est = await getEstimate(projectId, this.token);
      state.estimateMs = est.estimatedMs;
      state.estimateUsd = msToUsd(est.estimatedMs);
      emit();
    } catch {
      /* keep local estimate */
    }
    if (this.cancelled) return;

    // Connect realtime and subscribe to the project room.
    const socket = io(WS_URL || API_URL, {
      path: "/v1/ws",
      transports: ["websocket"],
      auth: this.token ? { token: this.token } : undefined,
    });
    this.socket = socket;

    const markNextShotReady = () => {
      const idx = state.shots.findIndex((s) => s.status === "pending" || s.status === "generating");
      if (idx >= 0) state.shots[idx].status = "ready";
    };

    socket.on("connect", () => {
      socket.emit("subscribe", { projectId });
      push("◆ ws connected · subscribed");
    });
    socket.on("connect_error", (e: Error) => push(`✕ ws ${e.message}`));
    socket.on("error", (d: { message?: string }) => push(`✕ ${d?.message ?? "error"}`));

    socket.on("project.progress", (d: { progress: number; status: string }) => {
      state.progress = d.progress;
      if (STATUSES.includes(d.status as ProjectStatus)) state.status = d.status as ProjectStatus;
      emit();
    });
    socket.on("scene.ready", (d: { index: number }) => push(`  scene ${d.index + 1}/${scenes} ready`));
    socket.on("shot.ready", () => {
      state.status = "GENERATING";
      markNextShotReady();
      emit();
    });
    socket.on("render.progress", (d: { progress: number }) => {
      state.status = "RENDERING";
      state.renderProgress = d.progress;
      emit();
    });
    socket.on("project.paused", (d: { spentMs: number }) => push(`⏸ paused (budget) · spent ${(d.spentMs / 60000).toFixed(1)} GPU-min`));

    socket.on("film.ready", async (d: { filmId: string; mp4Key?: string; hlsKey?: string }) => {
      state.status = "READY";
      state.progress = 1;
      for (const s of state.shots) if (s.status !== "ready") s.status = "ready";
      let url = "";
      try {
        const f = await getFilm(d.filmId, this.token);
        url = f.streamUrl ?? f.downloadUrl ?? "";
      } catch {
        /* fall through to CDN */
      }
      if (!url && CDN_URL) url = `${CDN_URL}/${d.hlsKey ?? d.mp4Key ?? ""}`;
      state.filmUrl = url || undefined;
      push("✓ film.ready");
      emit();
    });

    // Kick off generation.
    await generateFilm(projectId, this.token);
    push("◆ generate-film queued");
  }
}
