"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { RunPanel } from "./RunPanel";
import type { ProjectStatus } from "../lib/demo";

const STAGE_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Writing the bible",
  GENERATING: "Shooting episodes",
  RENDERING: "Cutting season",
  READY: "Season ready",
};

interface Episode {
  key: string;
  title: string;
  logline: string;
  minutes: number;
}

let _k = 0;
const newEp = (n: number): Episode => ({ key: `e${++_k}`, title: `Episode ${n}`, logline: "", minutes: 10 });

/** Series planner — seasons + an editable episode list, not a single prompt. */
export function SeriesStudio() {
  const [premise, setPremise] = useState(
    "A political thriller set in a near-future megacity, following a journalist uncovering a conspiracy.",
  );
  const [seasons, setSeasons] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>(() => [newEp(1), newEp(2), newEp(3)]);
  const { state, running, run, reset } = useCreateRun();

  const totalMin = useMemo(() => episodes.reduce((s, e) => s + e.minutes, 0), [episodes]);

  function patch(key: string, p: Partial<Episode>) {
    setEpisodes((prev) => prev.map((e) => (e.key === key ? { ...e, ...p } : e)));
  }
  function addEp() {
    setEpisodes((prev) => [...prev, newEp(prev.length + 1)]);
  }
  function removeEp(key: string) {
    setEpisodes((prev) => prev.filter((e) => e.key !== key));
  }

  function onCreate() {
    const outline = episodes.map((e, i) => `Ep${i + 1}: ${e.title} — ${e.logline}`).join("\n");
    run({ prompt: `${premise}\n\nSeason outline:\n${outline}`, modelId: "wan-2.1", targetSeconds: totalMin * 60 });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Create a TV Series</h1>
        <p className="mt-1 text-sm text-white/55">Plan seasons and episodes, then generate the whole season with a persistent cast.</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        {/* ── Planner ─────────────────────────────────────────── */}
        <div className="space-y-5">
          <Field label="Premise">
            <textarea
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm outline-none focus:border-white/30"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <div>
              <Label>Seasons</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Stepper value={seasons} set={(v) => setSeasons(Math.max(1, v))} />
              </div>
            </div>
            <div className="flex-1">
              <Label>Season runtime</Label>
              <div className="mt-1.5 text-sm text-white/70">{episodes.length} episodes · {totalMin} min</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Episodes — Season {seasons}</Label>
              <button onClick={addEp} className="rounded-md border border-white/15 px-2.5 py-1 text-xs hover:bg-white/5">+ Episode</button>
            </div>
            <div className="mt-2 space-y-2">
              {episodes.map((e, i) => (
                <div key={e.key} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium">E{i + 1}</span>
                    <input
                      value={e.title}
                      onChange={(ev) => patch(e.key, { title: ev.target.value })}
                      className="flex-1 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm font-medium outline-none focus:border-white/30"
                    />
                    <select
                      value={e.minutes}
                      onChange={(ev) => patch(e.key, { minutes: Number(ev.target.value) })}
                      className="rounded-md border border-white/10 bg-[#0a0a0f] px-2 py-1.5 text-xs outline-none"
                    >
                      {[5, 10, 20, 30, 45].map((m) => (
                        <option key={m} value={m}>{m}m</option>
                      ))}
                    </select>
                    <button onClick={() => removeEp(e.key)} className="px-1.5 text-white/40 hover:text-white">✕</button>
                  </div>
                  <input
                    value={e.logline}
                    onChange={(ev) => patch(e.key, { logline: ev.target.value })}
                    placeholder="Logline — what happens this episode"
                    className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm outline-none focus:border-white/30"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCreate}
              disabled={running}
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {running ? "Creating season…" : "Create series"}
            </button>
            <button onClick={reset} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5">Reset</button>
          </div>
        </div>

        {/* ── Run view ────────────────────────────────────────── */}
        <RunPanel
          state={state}
          stageLabels={STAGE_LABELS}
          readyTitle="Season ready"
          emptyHint={
            <div>
              <p className="text-sm">Plan your episodes and press <span className="text-white/70">Create series</span>.</p>
              <p className="mt-1 text-xs">Characters keep their look and the story stays consistent across episodes.</p>
            </div>
          }
        />
      </div>
    </div>
  );
}

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
function Stepper({ value, set }: { value: number; set: (v: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03]">
      <button onClick={() => set(value - 1)} className="px-3 py-1.5 text-white/60 hover:text-white">−</button>
      <span className="w-8 text-center text-sm">{value}</span>
      <button onClick={() => set(value + 1)} className="px-3 py-1.5 text-white/60 hover:text-white">+</button>
    </div>
  );
}
