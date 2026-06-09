"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { CreateStudio } from "./CreateStudio";
import { StoryboardStudio } from "./StoryboardStudio";
import { ScriptStudio, ImageStudio, AudioStudio, VideoStudio, HybridStudio } from "./EntrySurfaces";
import { STUDIO_MODES, type StudioMode } from "../lib/creation";
import { productById } from "../lib/products";
import { estimateMs, planShots, fmtDuration } from "../lib/system";
import {
  createProject,
  updateProject,
  insertFilm,
  listProjects,
  subscribeProject,
  type ProjectRow,
} from "../lib/projects";

const STAGES = ["PLANNING", "GENERATING", "RENDERING", "READY"] as const;
const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLANNING: "Writing",
  GENERATING: "Filming",
  RENDERING: "Editing",
  READY: "Ready",
  PAUSED: "Paused",
  FAILED: "Failed",
};

/**
 * When NEXT_PUBLIC_USE_REMOTE_WORKER=true, a real worker (apps/worker) is running
 * and owns the project lifecycle — so we skip the in-browser stand-in below and
 * let the genuine Director/GPU/FFmpeg writes drive the UI over Realtime. Left
 * unset, the stand-in simulates the lifecycle so the demo works with no backend.
 */
const USE_REMOTE_WORKER = process.env.NEXT_PUBLIC_USE_REMOTE_WORKER === "true";

/**
 * Worker stand-in: walks a project through its lifecycle by WRITING to Supabase.
 * The UI never reads these values directly — it reflects them only after they
 * round-trip back through Realtime, exercising the real data + realtime path.
 * A production worker (apps/worker) does exactly these writes with the
 * service-role key after running the Director, GPU jobs and FFmpeg.
 */
class FilmWorker {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private cancelled = false;
  constructor(private readonly projectId: string, private readonly targetSeconds: number) {}
  cancel() {
    this.cancelled = true;
    this.timers.forEach(clearTimeout);
  }
  private at(ms: number, fn: () => void) {
    this.timers.push(setTimeout(() => !this.cancelled && fn(), ms));
  }
  run() {
    const steps: { t: number; status: ProjectRow["status"]; progress: number }[] = [
      { t: 600, status: "PLANNING", progress: 0.08 },
      { t: 1600, status: "GENERATING", progress: 0.22 },
      { t: 2600, status: "GENERATING", progress: 0.46 },
      { t: 3600, status: "GENERATING", progress: 0.72 },
      { t: 4500, status: "RENDERING", progress: 0.86 },
      { t: 5300, status: "RENDERING", progress: 0.95 },
    ];
    for (const s of steps) this.at(s.t, () => updateProject(this.projectId, { status: s.status, progress: s.progress }));
    this.at(6200, async () => {
      await insertFilm({
        projectId: this.projectId,
        durationSec: this.targetSeconds,
        mp4Key: `projects/${this.projectId}/film/final.mp4`,
      });
      await updateProject(this.projectId, { status: "READY", progress: 1 });
    });
  }
}

export function FilmStudio() {
  return <FilmWorkspace />;
}

const MODE_BLURB: Record<StudioMode, string> = {
  prompt: "Auto — one prompt → a full film: screenplay, cast, locations, score and a final cut.",
  hybrid: "Auto-draft the screenplay & scenes, then refine each in the Storyboard.",
  script: "Bring a screenplay; we break it into a shot list and scenes.",
  storyboard: "Build and generate scene by scene — full creative control.",
  image: "Start from images; add motion and camera per shot.",
  audio: "Upload narration; we build the visuals around it.",
  video: "Upload a clip; generate variations, extensions or a sequel.",
};

/**
 * Mode-aware workspace: every creation entry point on one screen (Prompt ·
 * Script · Scene-by-Scene · Image · Audio · Video), read from ?mode=. The mode
 * rail is ALWAYS shown — each surface works in preview without Supabase and
 * persists once you're signed in.
 */
function FilmWorkspace() {
  const { enabled, user, signOut } = useAuth();
  const live = enabled && !!user;
  const [mode, setMode] = useState<StudioMode>("prompt");
  const [showAuth, setShowAuth] = useState(false);
  const p = productById("film")!;

  // Read the requested mode from the URL (avoids useSearchParams' Suspense
  // requirement on statically-rendered routes).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("mode");
    if (q && STUDIO_MODES.some((m) => m.id === q)) setMode(q as StudioMode);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            Create a Film
            {live ? (
              <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-[10px] font-normal text-emerald-300">Live · Supabase</span>
            ) : (
              <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] font-normal text-amber-300">Preview</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-white/55">{MODE_BLURB[mode]}</p>
        </div>
        <div className="text-right text-xs text-white/45">
          {live ? (
            <>
              <div>{user!.email}</div>
              <button onClick={signOut} className="mt-1 underline hover:text-white">Sign out</button>
            </>
          ) : enabled ? (
            <button onClick={() => setShowAuth((v) => !v)} className="underline hover:text-white">Sign in to save</button>
          ) : (
            <span title="Set NEXT_PUBLIC_SUPABASE_URL to persist your work">Preview — not saved</span>
          )}
        </div>
      </header>

      {showAuth && !live && (
        <div className="mb-6">
          <AuthCard />
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-sm">
        {STUDIO_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
              mode === m.id ? "bg-white text-black" : "text-white/60 hover:text-white"
            }`}
          >
            {m.label}
            {m.status === "beta" && (
              <span className={`rounded-full px-1.5 text-[9px] uppercase ${mode === m.id ? "bg-black/10 text-black/60" : "text-amber-300"}`}>beta</span>
            )}
          </button>
        ))}
      </div>

      {mode === "prompt" &&
        (live ? (
          <AutoStudioBody />
        ) : (
          <CreateStudio
            kind="film"
            embedded
            heading=""
            blurb=""
            durations={p.durations}
            defaultSeconds={p.defaultSeconds}
            defaultPrompt="An epic about an African kingdom fighting for its independence, told over three generations."
            cta="Create film"
          />
        ))}
      {mode === "hybrid" && <HybridStudio />}
      {mode === "script" && <ScriptStudio />}
      {mode === "storyboard" && <StoryboardStudio />}
      {mode === "image" && <ImageStudio />}
      {mode === "audio" && <AudioStudio />}
      {mode === "video" && <VideoStudio />}
    </div>
  );
}

function AutoStudioBody() {
  const p = productById("film")!;
  const [prompt, setPrompt] = useState(
    "An epic about an African kingdom fighting for its independence, told over three generations.",
  );
  const [seconds, setSeconds] = useState(p.defaultSeconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<ProjectRow | null>(null);
  const [recent, setRecent] = useState<ProjectRow[]>([]);
  const workerRef = useRef<FilmWorker | null>(null);
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);

  const estMs = useMemo(() => estimateMs("wan-2.1", seconds), [seconds]);
  const totalShots = useMemo(() => Math.min(160, planShots(seconds)), [seconds]);

  useEffect(() => {
    listProjects().then(setRecent);
    return () => {
      workerRef.current?.cancel();
      channelRef.current?.unsubscribe();
    };
  }, []);

  async function onCreate() {
    if (busy) return;
    setError(null);
    setBusy(true);
    workerRef.current?.cancel();
    channelRef.current?.unsubscribe();
    setLive(null);
    try {
      const project = await createProject({
        title: prompt.slice(0, 60),
        prompt,
        targetSeconds: seconds,
        modelId: "wan-2.1",
        estimatedMs: estMs,
      });
      setLive(project);
      // Drive the UI purely from Realtime updates on this row.
      channelRef.current = subscribeProject(project.id, (row) => {
        setLive(row);
        if (row.status === "READY" || row.status === "FAILED") {
          setBusy(false);
          listProjects().then(setRecent);
        }
      });
      // With a real backend, the worker (apps/worker) picks up this PLANNING row
      // and drives it for real; the UI updates purely from Realtime. Otherwise
      // run the in-browser stand-in so the demo still progresses.
      if (!USE_REMOTE_WORKER) {
        const worker = new FilmWorker(project.id, seconds);
        workerRef.current = worker;
        worker.run();
      }
      listProjects().then(setRecent);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
      setBusy(false);
    }
  }

  function onReset() {
    workerRef.current?.cancel();
    channelRef.current?.unsubscribe();
    setLive(null);
    setBusy(false);
    setError(null);
  }

  const status = live?.status ?? null;
  const progress = live?.progress ?? 0;
  const readyShots = Math.floor(progress * totalShots);

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <Field label="What do you want to make?">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm outline-none focus:border-white/30"
            />
          </Field>
          <Field label="Length">
            <div className="flex flex-wrap gap-2">
              {p.durations.map((d) => (
                <Chip key={d.value} active={seconds === d.value} onClick={() => setSeconds(d.value)}>
                  {d.label}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
            <Row k="Final runtime" v={fmtDuration(seconds)} />
            <Row k="Shots planned" v={`${planShots(seconds)}`} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCreate}
              disabled={busy}
              className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Creating…" : "Create film"}
            </button>
            <button onClick={onReset} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5">
              Reset
            </button>
          </div>
          {error && <p className="text-xs text-amber-300">{error}</p>}

          {recent.length > 0 && (
            <div>
              <Label>Recent projects</Label>
              <div className="mt-2 space-y-1.5">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
                    <span className="truncate text-white/70">{r.title}</span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-white/40">
                      {STAGE_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="space-y-6">
          <Stages status={status} />
          {live ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Progress" value={`${Math.round(progress * 100)}%`} />
                <Stat label="Status" value={status ? STAGE_LABEL[status] : "—"} accent={status === "READY" ? "good" : undefined} />
                <Stat label="Project" value={live.id.slice(0, 8)} />
              </div>

              {status === "RENDERING" && (
                <div>
                  <Label>Final cut</Label>
                  <Bar value={progress} />
                </div>
              )}

              {status === "READY" && (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.04] p-5">
                  <h3 className="font-semibold text-emerald-200">Your cut is ready</h3>
                  <p className="text-sm text-white/60">
                    {fmtDuration(seconds)} · saved to your studio (project {live.id.slice(0, 8)})
                  </p>
                  <p className="mt-2 text-xs text-white/40">
                    A <code>films</code> row was written and broadcast over Realtime. Connect the worker + storage to
                    stream the real MP4/HLS.
                  </p>
                </div>
              )}

              <div>
                <Label>Storyboard · {readyShots}/{totalShots} shots</Label>
                <div className="mt-2 grid grid-cols-8 gap-1.5 sm:grid-cols-12">
                  {Array.from({ length: totalShots }).map((_, i) => (
                    <div
                      key={i}
                      className={`aspect-video rounded-sm transition-all duration-300 ${i >= readyShots ? "bg-white/5" : ""}`}
                      style={
                        i < readyShots
                          ? { background: `linear-gradient(135deg, hsl(${(i * 37) % 360} 65% 45%), hsl(${(i * 37 + 40) % 360} 60% 30%))` }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-white/40">
              <div>
                <p className="text-sm">Describe your film and press <span className="text-white/70">Create film</span>.</p>
                <p className="mt-1 text-xs">It's saved to your studio; progress streams back live.</p>
              </div>
            </div>
          )}
        </section>
    </div>
  );
}

/* ── small UI bits ──────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs uppercase tracking-wider text-white/40">{children}</span>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-white/60 hover:border-white/25"
      }`}
    >
      {children}
    </button>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-white/50">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: "good" }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent === "good" ? "text-emerald-300" : ""}`}>{value}</div>
    </div>
  );
}
function Stages({ status }: { status: string | null }) {
  const idx = status ? STAGES.indexOf(status as (typeof STAGES)[number]) : -1;
  return (
    <div className="flex items-center gap-2">
      {STAGES.map((s, i) => (
        <div
          key={s}
          className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs transition ${
            i < idx ? "bg-emerald-400/15 text-emerald-300" : i === idx ? "bg-white/15 text-white" : "bg-white/5 text-white/40"
          }`}
        >
          {STAGE_LABEL[s]}
        </div>
      ))}
    </div>
  );
}
function Bar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
      <div className="h-full bg-white transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}
