"use client";

import Link from "next/link";

import { useEffect, useRef, type ReactNode } from "react";
import { fmtDuration } from "../lib/system";
import type { DemoState, LiveScene, LiveShot, ProjectStatus } from "../lib/demo";
import { HlsPlayer } from "./HlsPlayer";

const STAGES: ProjectStatus[] = ["PLANNING", "GENERATING", "RENDERING", "READY"];

/**
 * The production console shared by every create surface. On a LIVE run every
 * element is real backend state (worker claims, GPU timings, per-shot
 * thumbnails, queue depth, measured ETA) streamed over Supabase Realtime. A
 * preview run is labelled loudly so it can never be mistaken for production.
 */
export function RunPanel({
  state,
  stageLabels,
  emptyHint,
  readyTitle = "Your cut is ready",
}: {
  state: DemoState | null;
  stageLabels: Record<ProjectStatus, string>;
  emptyHint?: ReactNode;
  readyTitle?: string;
}) {
  if (!state) {
    return (
      <div className="flex h-full min-h-[20rem] items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-white/40">
        <div className="px-6">{emptyHint ?? <p className="text-sm">Set it up and press Create.</p>}</div>
      </div>
    );
  }

  const prod = state.production;
  const idx = STAGES.indexOf(state.status);

  return (
    <div className="space-y-4">
      <ModeBanner live={!!state.live} />

      {/* Stage rail */}
      <div className="flex items-center gap-2">
        {STAGES.map((s, i) => (
          <div
            key={s}
            className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs transition ${
              i < idx
                ? "bg-emerald-400/15 text-emerald-300"
                : i === idx
                  ? "bg-white/15 text-white shadow-[0_0_18px_rgba(255,255,255,0.08)]"
                  : "bg-white/5 text-white/40"
            }`}
          >
            {i === idx && state.status !== "READY" && <PulseDot className="mr-1.5 bg-white" />}
            {stageLabels[s]}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className={`grid gap-3 ${prod ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Stat label="Progress" value={`${Math.round(state.progress * 100)}%`} />
        <Stat label="Scenes" value={`${state.scenes}`} />
        <Stat label="Status" value={stageLabels[state.status]} accent={state.status === "READY"} />
        {prod && <Stat label="ETA" value={state.status === "READY" ? "done" : prod.etaMs ? `~${fmtEta(prod.etaMs)}` : "…"} />}
      </div>

      {/* Live infrastructure strip */}
      {prod && (
        <div className="flex flex-wrap items-center gap-2">
          <InfraChip ok={prod.claimed} label={prod.claimed ? "Render worker online" : "Waiting for worker"} />
          <InfraChip ok={prod.gpuActive} idle={!prod.gpuActive && state.status !== "READY"} label={prod.gpuActive ? `Engine active · ${prod.engine ?? "GPU"}` : state.status === "READY" ? "Engine released" : "Engine idle"} />
          <InfraChip ok label={`Queue · ${prod.queuedAhead} project${prod.queuedAhead === 1 ? "" : "s"} in pipeline`} />
          {prod.spentMs > 0 && <InfraChip ok label={`GPU spend · ${(prod.spentMs / 60000).toFixed(1)} min`} />}
        </div>
      )}

      {state.error && (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/[0.06] p-4 text-sm text-red-200">✕ {state.error}</div>
      )}

      {state.status === "RENDERING" && (
        <div>
          <span className="text-xs uppercase tracking-wider text-white/40">Final cut</span>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-white transition-all" style={{ width: `${Math.round((state.renderProgress || 0.4) * 100)}%` }} />
          </div>
        </div>
      )}

      {state.status === "READY" && <Result state={state} title={readyTitle} />}

      {/* Scene pipeline — real per-shot state with thumbnails */}
      {prod && prod.scenes.length > 0 && (
        <div>
          <span className="text-xs uppercase tracking-wider text-white/40">Scene pipeline</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {prod.scenes.map((sc) => (
              <SceneCard key={sc.id} scene={sc} />
            ))}
          </div>
        </div>
      )}

      {/* Legacy storyboard grid (preview engine only — live runs show the real pipeline) */}
      {!prod && <StoryboardGrid state={state} />}

      {/* Production timeline + activity feed */}
      {prod && prod.timeline.length > 0 && <Timeline events={prod.timeline} />}
      {state.live && state.log.length > 0 && <ActivityFeed lines={state.log} />}
    </div>
  );
}

function ModeBanner({ live }: { live: boolean }) {
  if (live) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] px-4 py-2.5 text-xs text-emerald-200 backdrop-blur">
        <PulseDot className="bg-emerald-400" />
        LIVE PRODUCTION — Director, GPU and render worker are doing the real work. Leave this page open or come back later; progress is saved.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2.5 text-xs text-amber-200 backdrop-blur">
      ⚠ PREVIEW SIMULATION — nothing is being generated. Sign in (Create Film → Sign in) and re-run to use the real studio.
    </div>
  );
}

function SceneCard({ scene }: { scene: LiveScene }) {
  const ready = scene.shots.filter((s) => s.status === "READY").length;
  const active = scene.shots.some((s) => s.status === "GENERATING");
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-white/70">
          {scene.index + 1}. {scene.heading ?? `Scene ${scene.index + 1}`}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
            scene.status === "READY"
              ? "bg-emerald-400/15 text-emerald-300"
              : active
                ? "bg-white/15 text-white"
                : "bg-white/5 text-white/40"
          }`}
        >
          {scene.status === "READY" ? "Completed" : active ? "Rendering on GPU" : `${ready}/${scene.shots.length} shots`}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {scene.shots.map((sh) => (
          <ShotTile key={sh.id} shot={sh} />
        ))}
      </div>
    </div>
  );
}

function ShotTile({ shot }: { shot: LiveShot }) {
  if (shot.thumbUrl) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-md">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL */}
        <img src={shot.thumbUrl} alt={`Shot ${shot.index + 1}`} className="h-full w-full object-cover" />
        {shot.gpuMs ? (
          <span className="absolute bottom-0.5 right-1 rounded bg-black/60 px-1 text-[9px] text-white/80">{Math.round(shot.gpuMs / 1000)}s</span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className={`aspect-video rounded-md ${
        shot.status === "READY"
          ? "bg-emerald-400/30"
          : shot.status === "GENERATING"
            ? "animate-pulse bg-white/30"
            : shot.status === "FAILED"
              ? "bg-red-400/30"
              : "bg-white/5"
      }`}
      title={`Shot ${shot.sceneIndex + 1}.${shot.index + 1} — ${shot.status.toLowerCase()}`}
    />
  );
}

function Timeline({ events }: { events: { at: number; label: string }[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
      <span className="text-xs uppercase tracking-wider text-white/40">Production timeline</span>
      <ol className="mt-2 space-y-1.5">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3 text-xs">
            <span className="shrink-0 font-mono text-white/35">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
            <span className={i === events.length - 1 ? "text-white/90" : "text-white/55"}>{e.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ActivityFeed({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length]);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
      <span className="text-xs uppercase tracking-wider text-white/40">Live activity</span>
      <div ref={ref} className="mt-2 max-h-36 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-white/55">
        {lines.map((l, i) => (
          <div key={i} className={i === lines.length - 1 ? "text-emerald-200/90" : undefined}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryboardGrid({ state }: { state: DemoState }) {
  const ready = state.shots.filter((s) => s.status === "ready" || s.status === "cached");
  const visible = state.shots.slice(0, 160);
  return (
    <div>
      <span className="text-xs uppercase tracking-wider text-white/40">
        Storyboard · {ready.length}/{state.shots.length} shots
      </span>
      <div className="mt-2 grid grid-cols-8 gap-1.5 sm:grid-cols-12">
        {visible.map((s, i) => (
          <div
            key={i}
            className={`aspect-video rounded-sm transition-all duration-300 ${
              s.status === "pending" ? "bg-white/5" : s.status === "generating" ? "animate-pulse bg-white/30" : ""
            }`}
            style={
              s.status === "ready" || s.status === "cached"
                ? { background: `linear-gradient(135deg, hsl(${s.hue} 65% 45%), hsl(${(s.hue + 40) % 360} 60% 30%))` }
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function Result({ state, title }: { state: DemoState; title: string }) {
  const strip = state.shots.filter((s) => s.status === "ready" || s.status === "cached").slice(0, 24);
  return (
    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.04] p-5 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-emerald-200">{title}</h3>
          <p className="text-sm text-white/60">
            {fmtDuration(state.durationSec)} · {state.scenes} scenes
          </p>
        </div>
        <div className="flex gap-2">
          {state.filmUrl ? (
            <>
              <a href={state.filmUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-400/10">
                ▶ Play
              </a>
              <a href={state.filmUrl} download className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5">
                ↓ Download
              </a>
              <Link
                href="/publish"
                className="rounded-lg bg-emerald-400 px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-emerald-300"
              >
                🚀 Launch
              </Link>
            </>
          ) : (
            ["▶ Play", "↓ Download", "↗ Publish"].map((t) => (
              <span key={t} className="cursor-default rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70">
                {t}
              </span>
            ))
          )}
        </div>
      </div>
      {state.filmUrl ? (
        <div className="mt-4">
          <HlsPlayer src={state.filmUrl} />
          {(state.filmLocales?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-white/40">Also in</span>
              {state.filmLocales!.map((l) => (
                <a
                  key={l.lang}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/70 transition hover:border-emerald-300/50 hover:text-emerald-200"
                >
                  {l.lang.toUpperCase()} ▶
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 flex gap-1 overflow-hidden rounded-lg">
          {strip.map((s, i) => (
            <div key={i} className="h-16 flex-1" style={{ background: `linear-gradient(135deg, hsl(${s.hue} 65% 45%), hsl(${(s.hue + 40) % 360} 60% 30%))` }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
      <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ? "text-emerald-300" : ""}`}>{value}</div>
    </div>
  );
}

function InfraChip({ ok, idle, label }: { ok?: boolean; idle?: boolean; label: string }) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] backdrop-blur ${
        ok && !idle
          ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200"
          : idle
            ? "border-white/10 bg-white/[0.03] text-white/45"
            : "border-amber-400/25 bg-amber-400/[0.06] text-amber-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok && !idle ? "animate-pulse bg-emerald-400" : idle ? "bg-white/30" : "bg-amber-400"}`} />
      {label}
    </span>
  );
}

function PulseDot({ className }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle ${className ?? "bg-white"}`} />;
}

function fmtEta(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  if (min >= 1) return `${min} min`;
  return `${Math.round(ms / 1000)}s`;
}
