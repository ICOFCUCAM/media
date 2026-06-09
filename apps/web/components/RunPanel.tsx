"use client";

import type { ReactNode } from "react";
import { fmtDuration } from "../lib/system";
import type { DemoState, ProjectStatus } from "../lib/demo";
import { HlsPlayer } from "./HlsPlayer";

const STAGES: ProjectStatus[] = ["PLANNING", "GENERATING", "RENDERING", "READY"];

/** The generation visualization shared by every create surface (stages,
 *  storyboard, result). Each studio supplies its own controls + stage labels. */
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
      <div className="flex h-full min-h-[20rem] items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-white/40">
        <div className="px-6">{emptyHint ?? <p className="text-sm">Set it up and press Create.</p>}</div>
      </div>
    );
  }

  const ready = state.shots.filter((s) => s.status === "ready" || s.status === "cached");
  const visible = state.shots.slice(0, 160);
  const idx = STAGES.indexOf(state.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {STAGES.map((s, i) => (
          <div
            key={s}
            className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs transition ${
              i < idx ? "bg-emerald-400/15 text-emerald-300" : i === idx ? "bg-white/15 text-white" : "bg-white/5 text-white/40"
            }`}
          >
            {stageLabels[s]}
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Progress" value={`${Math.round(state.progress * 100)}%`} />
        <Stat label="Scenes" value={`${state.scenes}`} />
        <Stat label="Status" value={stageLabels[state.status]} accent={state.status === "READY"} />
      </div>

      {state.status === "RENDERING" && (
        <div>
          <span className="text-xs uppercase tracking-wider text-white/40">Final cut</span>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-white transition-all" style={{ width: `${Math.round(state.renderProgress * 100)}%` }} />
          </div>
        </div>
      )}

      {state.status === "READY" && <Result state={state} title={readyTitle} />}

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
    </div>
  );
}

function Result({ state, title }: { state: DemoState; title: string }) {
  const strip = state.shots.filter((s) => s.status === "ready" || s.status === "cached").slice(0, 24);
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-emerald-200">{title}</h3>
          <p className="text-sm text-white/60">{fmtDuration(state.durationSec)} · {state.scenes} scenes</p>
        </div>
        <div className="flex gap-2">
          {["▶ Play", "↓ Download", "↗ Publish"].map((t) => (
            <span key={t} className="cursor-default rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70">{t}</span>
          ))}
        </div>
      </div>
      {state.filmUrl ? (
        <div className="mt-4"><HlsPlayer src={state.filmUrl} /></div>
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
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent ? "text-emerald-300" : ""}`}>{value}</div>
    </div>
  );
}
