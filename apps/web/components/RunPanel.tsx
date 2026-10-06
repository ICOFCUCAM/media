"use client";

import Link from "next/link";

import { useEffect, useRef, type ReactNode } from "react";
import { fmtDuration } from "../lib/system";
import type { DemoState, LiveScene, LiveShot, ProjectStatus } from "../lib/demo";
import { HlsPlayer } from "./HlsPlayer";
import { Status } from "./cf/primitives";
import { CinemaArt } from "./cf/CinemaArt";

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
  fileLink = true,
  artSeed,
}: {
  state: DemoState | null;
  stageLabels: Record<ProjectStatus, string>;
  emptyHint?: ReactNode;
  readyTitle?: string;
  /** Link a live run to its production file (off on the file page itself). */
  fileLink?: boolean;
  /** The brief — the waiting preview draws a still that follows it. */
  artSeed?: string;
}) {
  if (!state) {
    return (
      <CinemaArt seed={artSeed || "cineforge"} className="cf-dark min-h-[22rem] rounded-lg sm:aspect-[21/9]" letterbox motion hud={{ tag: "Preview frame" }}>
        <div className="flex h-full items-center justify-center bg-gradient-to-t from-black/75 via-black/35 to-black/20 px-6 text-center text-white">
          <div>{emptyHint ?? <p className="cf-display text-[44px]">Set it up and press Create.</p>}</div>
        </div>
      </CinemaArt>
    );
  }

  const prod = state.production;
  const idx = STAGES.indexOf(state.status);
  // Live runs carry the real project id once the row exists.
  const fileId = fileLink && state.live ? (state.projectId ?? prod?.projectId) : undefined;

  return (
    <div className="space-y-8" aria-live="polite">
      <ModeBanner live={!!state.live} fileId={fileId} />

      {/* Stage rail */}
      <ol className="grid grid-cols-2 border-l border-t border-cf-line sm:grid-cols-4" aria-label="Production stage">
        {STAGES.map((s, i) => (
          <li
            key={s}
            aria-current={i === idx ? "step" : undefined}
            className={`flex items-center justify-between gap-2 border-b border-r border-cf-line px-4 py-4 font-sans text-[11px] font-medium uppercase tracking-[0.06em] ${
              i === idx ? "bg-cf-inverse text-cf-on-inverse" : i < idx ? "text-cf-fg" : "text-cf-dim"
            }`}
          >
            <span>
              <span className="mr-2 opacity-50">{String(i + 1).padStart(2, "0")}</span>
              {stageLabels[s]}
            </span>
            {i < idx && <span className="text-cf-ok">Done</span>}
            {i === idx && state.status !== "READY" && <PulseDot className="bg-cf-accent" />}
          </li>
        ))}
      </ol>

      {/* Measures */}
      <dl className={`grid grid-cols-2 border-l border-t border-cf-line ${prod ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Stat label="Progress" value={`${Math.round(state.progress * 100)}%`} />
        <Stat label="Scenes" value={`${state.scenes}`} />
        <Stat label="Status" value={stageLabels[state.status]} accent={state.status === "READY"} />
        {prod && <Stat label="ETA" value={state.status === "READY" ? "Done" : prod.etaMs ? `~${fmtEta(prod.etaMs)}` : "Measuring"} />}
      </dl>

      {/* Live infrastructure strip */}
      {prod && (
        <div className="flex flex-wrap gap-x-7 gap-y-3 border-b border-t border-cf-line py-4">
          <InfraChip ok={prod.claimed} label={prod.claimed ? "Render worker online" : "Waiting for worker"} />
          <InfraChip ok={prod.gpuActive} idle={!prod.gpuActive && state.status !== "READY"} label={prod.gpuActive ? `Engine active · ${prod.engine ?? "GPU"}` : state.status === "READY" ? "Engine released" : "Engine idle"} />
          <InfraChip ok label={`Queue · ${prod.queuedAhead} project${prod.queuedAhead === 1 ? "" : "s"} in pipeline`} />
          {prod.spentMs > 0 && <InfraChip ok label={`GPU spend · ${(prod.spentMs / 60000).toFixed(1)} min`} />}
        </div>
      )}

      {state.error && (
        <div role="alert" className="border border-cf-danger/50 px-5 py-4 text-sm text-cf-danger">
          <span className="cf-label mr-3 text-cf-danger">Stopped</span>
          {state.error}
        </div>
      )}

      {state.status === "RENDERING" && (
        <div>
          <div className="flex justify-between">
            <span className="cf-label">Final cut · assembling</span>
            {state.renderProgress > 0 && <span className="cf-label text-cf-fg">{Math.round(state.renderProgress * 100)}%</span>}
          </div>
          <div className="relative mt-3 h-[2px] overflow-hidden bg-cf-line">
            {state.renderProgress > 0 ? (
              <div className="h-full bg-cf-accent transition-all" style={{ width: `${Math.round(state.renderProgress * 100)}%` }} />
            ) : (
              // The worker has not reported render progress yet — say so rather than invent a number.
              <div className="cf-flow absolute inset-y-0 w-1/4 bg-cf-fg" />
            )}
          </div>
        </div>
      )}

      {state.status === "READY" && <Result state={state} title={readyTitle} />}

      {/* Scene pipeline — real per-shot state with thumbnails */}
      {prod && prod.scenes.length > 0 && (
        <div>
          <div className="cf-label mb-3">Scene pipeline</div>
          <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2">
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

function ModeBanner({ live, fileId }: { live: boolean; fileId?: string }) {
  if (live) {
    return (
      <div className="flex flex-wrap items-start gap-3 border-l-2 border-cf-accent bg-cf-soft px-5 py-4 text-[12px] leading-relaxed">
        <PulseDot className="mt-1.5 shrink-0 bg-cf-accent" />
        <span className="min-w-0 flex-1">
          <span className="cf-label mr-2 text-cf-fg">Live production</span>
          Director, GPU and render worker are doing the real work. Leave this page open or come back later — progress is saved to Projects.
        </span>
        {fileId && (
          <Link href={`/projects/${fileId}`} className="cf-link shrink-0">
            Production file →
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="border-l-2 border-cf-warn bg-cf-soft px-5 py-4 text-[12px] leading-relaxed">
      <span className="cf-label mr-2 text-cf-warn">Preview simulation</span>
      Nothing is being generated. Sign in and re-run to use the real studio.
    </div>
  );
}

function SceneCard({ scene }: { scene: LiveScene }) {
  const ready = scene.shots.filter((s) => s.status === "READY").length;
  const active = scene.shots.some((s) => s.status === "GENERATING");
  return (
    <div className="bg-cf-bg p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-display font-semibold text-[16px]">
          <span className="mr-2 font-mono text-[11px] text-cf-muted">{String(scene.index + 1).padStart(2, "0")}</span>
          {scene.heading ?? `Scene ${scene.index + 1}`}
        </span>
        <span
          className={`flex shrink-0 items-center gap-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.06em] ${
            scene.status === "READY" ? "text-cf-ok" : active ? "text-cf-fg" : "text-cf-muted"
          }`}
        >
          {active && <PulseDot className="bg-cf-accent" />}
          {scene.status === "READY" ? "Completed" : active ? "On GPU" : `${ready}/${scene.shots.length} shots`}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1">
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
      <div className="cf-materialize relative aspect-video overflow-hidden bg-black">
        {/* Plain <img>: a signed, short-lived storage URL next/image cannot optimise. */}
        <img src={shot.thumbUrl} alt={`Shot ${shot.index + 1}`} className="h-full w-full object-cover" />
        {shot.gpuMs ? (
          <span className="absolute bottom-0.5 right-1 bg-black/70 px-1 font-mono text-[10px] text-white/80">{Math.round(shot.gpuMs / 1000)}s</span>
        ) : null}
      </div>
    );
  }
  const generating = shot.status === "GENERATING";
  return (
    <div
      className={`relative aspect-video overflow-hidden ${
        shot.status === "READY"
          ? "bg-cf-ok/40"
          : generating
            ? "bg-cf-inverse"
            : shot.status === "FAILED"
              ? "bg-cf-danger/40"
              : "bg-cf-soft"
      }`}
      title={`Shot ${shot.sceneIndex + 1}.${shot.index + 1} — ${shot.status.toLowerCase()}`}
    >
      {generating && <div className="cf-scan absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-cf-accent/50 to-transparent" />}
    </div>
  );
}

function Timeline({ events }: { events: { at: number; label: string }[] }) {
  return (
    <div className="border-t border-cf-fg pt-4">
      <span className="cf-label">Production timeline</span>
      <ol className="mt-3">
        {events.map((e, i) => (
          <li key={i} className="grid grid-cols-[80px_1fr] gap-3 border-b border-cf-line py-2.5 text-[12px]">
            <span className="font-mono text-[12px] text-cf-muted">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
            <span className={i === events.length - 1 ? "text-cf-fg" : "text-cf-muted"}>{e.label}</span>
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
    <div className="cf-dark p-5">
      <span className="cf-label">Live activity</span>
      <div ref={ref} className="mt-3 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-cf-muted">
        {lines.map((l, i) => (
          <div key={i} className={i === lines.length - 1 ? "text-cf-accent" : undefined}>
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
      <span className="cf-label">
        Preview storyboard · {ready.length}/{state.shots.length} shots
      </span>
      <div className="mt-3 grid grid-cols-8 gap-1 sm:grid-cols-12">
        {visible.map((s, i) => (
          <div
            key={i}
            className={`relative aspect-video overflow-hidden transition-all duration-300 ${
              s.status === "pending" ? "bg-cf-soft" : s.status === "generating" ? "bg-cf-inverse" : ""
            }`}
            style={
              s.status === "ready" || s.status === "cached"
                ? { background: `linear-gradient(135deg, hsl(${s.hue} 22% 38%), hsl(${(s.hue + 40) % 360} 18% 18%))` }
                : undefined
            }
          >
            {s.status === "generating" && <div className="cf-scan absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-cf-accent/50 to-transparent" />}
          </div>
        ))}
      </div>
    </div>
  );
}

async function bumpViews(projectId: string) {
  // Count plays so the Audience analytics have a real signal.
  const { getSupabase } = await import("../lib/supabase");
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from("films").select("views").eq("project_id", projectId).maybeSingle();
  if (data) await sb.from("films").update({ views: (data.views ?? 0) + 1 }).eq("project_id", projectId);
}

function Result({ state, title }: { state: DemoState; title: string }) {
  const strip = state.shots.filter((s) => s.status === "ready" || s.status === "cached").slice(0, 24);
  return (
    <div className="border-t border-cf-fg">
      <div className="flex flex-wrap items-end justify-between gap-4 py-5">
        <div>
          <Status tone="ok">Final cut</Status>
          <h3 className="cf-display mt-3 text-[34px] leading-none">{title}</h3>
          <p className="cf-label mt-2">
            {fmtDuration(state.durationSec)} · {state.scenes} scenes
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.filmUrl ? (
            <>
              <a
                href={state.filmUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => state.projectId && void bumpViews(state.projectId)}
                className="cf-btn-line"
              >
                Play ↗
              </a>
              <a href={state.filmUrl} download className="cf-btn-line">
                Download
              </a>
              <Link href="/publish" className="cf-btn-accent">
                Publish →
              </Link>
            </>
          ) : (
            <span className="cf-label">Preview cut — nothing to play or publish</span>
          )}
        </div>
      </div>
      {state.filmUrl ? (
        <div>
          <HlsPlayer src={state.filmUrl} />
          {(state.filmLocales?.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="cf-label mr-2">Also in</span>
              {state.filmLocales!.map((l) => (
                <a key={l.lang} href={l.url} target="_blank" rel="noreferrer" className="cf-option">
                  {l.lang.toUpperCase()} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-px overflow-hidden">
          {strip.map((s, i) => (
            <div key={i} className="h-16 flex-1" style={{ background: `linear-gradient(135deg, hsl(${s.hue} 22% 38%), hsl(${(s.hue + 40) % 360} 18% 18%))` }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-b border-r border-cf-line px-4 py-5">
      <dt className="cf-label">{label}</dt>
      <dd className={`mt-2 font-display font-semibold text-[28px] leading-none tracking-[-0.03em] ${accent ? "text-cf-ok" : ""}`}>{value}</dd>
    </div>
  );
}

function InfraChip({ ok, idle, label }: { ok?: boolean; idle?: boolean; label: string }) {
  return <Status tone={ok && !idle ? "ok" : idle ? "idle" : "warn"}>{label}</Status>;
}

function PulseDot({ className }: { className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle ${className ?? "bg-cf-fg"}`} />;
}

function fmtEta(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  if (min >= 1) return `${min} min`;
  return `${Math.round(ms / 1000)}s`;
}
