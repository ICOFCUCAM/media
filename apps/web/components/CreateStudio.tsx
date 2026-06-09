"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { estimateMs, fmtDuration, IS_LIVE } from "../lib/system";
import { DemoRun, type DemoState, type ProjectStatus } from "../lib/demo";
import { LiveRun } from "../lib/live";
import { HlsPlayer } from "./HlsPlayer";
import type { ShortPlatform } from "../lib/products";

const STAGES: ProjectStatus[] = ["PLANNING", "GENERATING", "RENDERING", "READY"];
const STAGE_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Writing",
  GENERATING: "Filming",
  RENDERING: "Editing",
  READY: "Ready",
};

export interface CreateStudioProps {
  kind: "film" | "series" | "trailer" | "shorts";
  heading: string;
  blurb: string;
  durations: { label: string; value: number }[];
  defaultSeconds: number;
  defaultPrompt: string;
  /** Vertical platform presets — only the Shorts studio passes these. */
  platforms?: ShortPlatform[];
  cta?: string;
  /** Render without the outer container/header (when nested under a workspace). */
  embedded?: boolean;
}

/**
 * The creator's create-and-watch surface. One prompt becomes a finished cut.
 * The same component powers Film, Series, Trailer and Shorts — only the presets
 * and copy change. All engine internals stay out of the creator's view.
 */
export function CreateStudio(props: CreateStudioProps) {
  const [prompt, setPrompt] = useState(props.defaultPrompt);
  const [seconds, setSeconds] = useState(props.defaultSeconds);
  const [platform, setPlatform] = useState(props.platforms?.[0]?.id ?? "");
  const [state, setState] = useState<DemoState | null>(null);
  const [running, setRunning] = useState(false);
  const runRef = useRef<{ cancel: () => void } | null>(null);

  // Trailers/shorts run on the fast model; film/series can use the premium one.
  const modelId = props.kind === "film" || props.kind === "series" ? "wan-2.1" : "wan-2.1";
  const estMs = useMemo(() => estimateMs(modelId, seconds), [modelId, seconds]);
  const readyEstimate = fmtDuration(Math.max(20, Math.round(estMs / 1000 / 12)));

  async function onCreate() {
    if (running) return;
    runRef.current?.cancel();
    setRunning(true);
    setState(null);
    const onUpdate = (s: DemoState) => {
      setState(s);
      if (s.status === "READY") setRunning(false);
    };
    const cfg = { prompt, modelId, targetSeconds: seconds };
    if (IS_LIVE) {
      const live = new LiveRun(cfg, onUpdate);
      runRef.current = live;
      try {
        await live.start();
        return;
      } catch {
        live.cancel();
      }
    }
    const run = new DemoRun(cfg, onUpdate);
    runRef.current = run;
    run.start();
  }

  function onReset() {
    runRef.current?.cancel();
    setRunning(false);
    setState(null);
  }

  return (
    <div className={props.embedded ? "" : "mx-auto max-w-6xl px-6 py-8"}>
      {!props.embedded && (
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">{props.heading}</h1>
          <p className="mt-1 text-sm text-white/55">{props.blurb}</p>
        </header>
      )}

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

          {props.platforms && (
            <Field label="Platform">
              <div className="flex flex-wrap gap-2">
                {props.platforms.map((p) => (
                  <Chip key={p.id} active={platform === p.id} onClick={() => setPlatform(p.id)}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            </Field>
          )}

          <Field label={props.kind === "series" ? "Total runtime" : "Length"}>
            <div className="flex flex-wrap gap-2">
              {props.durations.map((d) => (
                <Chip key={d.value} active={seconds === d.value} onClick={() => setSeconds(d.value)}>
                  {d.label}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
            <Row k="Final runtime" v={fmtDuration(seconds)} />
            <Row k="Ready in" v={`~${readyEstimate}`} />
            {props.platforms && <Row k="Format" v={props.platforms.find((p) => p.id === platform)?.aspect ?? "16:9"} />}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCreate}
              disabled={running}
              className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {running ? "Creating…" : props.cta ?? "Create"}
            </button>
            <button onClick={onReset} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5">
              Reset
            </button>
          </div>
          <p className="text-center text-xs text-white/35">
            {IS_LIVE ? "Connected to your studio." : "Preview mode — shows the real creative flow."}
          </p>
        </aside>

        <section className="space-y-6">
          <Stages status={state?.status ?? null} />
          {state ? <Pipeline state={state} /> : <EmptyState kind={props.kind} />}
        </section>
      </div>
    </div>
  );
}

function Pipeline({ state }: { state: DemoState }) {
  const ready = state.shots.filter((s) => s.status === "ready" || s.status === "cached");
  const visible = state.shots.slice(0, 160);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Progress" value={`${Math.round(state.progress * 100)}%`} />
        <Stat label="Scenes" value={`${state.scenes}`} />
        <Stat
          label="Status"
          value={state.status === "READY" ? "Finished" : STAGE_LABEL[state.status]}
          accent={state.status === "READY" ? "good" : undefined}
        />
      </div>

      {(state.characters.length > 0 || state.locations.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {state.characters.map((c) => (
            <BibleCard key={c.name} kind="Cast" name={c.name} desc={c.appearance} />
          ))}
          {state.locations.map((l) => (
            <BibleCard key={l.name} kind="Location" name={l.name} desc={l.description} />
          ))}
        </div>
      )}

      {state.status === "RENDERING" && (
        <div>
          <Label>Final cut</Label>
          <Bar value={state.renderProgress} />
        </div>
      )}

      {state.status === "READY" && <Result state={state} />}

      <div>
        <Label>
          Storyboard · {ready.length}/{state.shots.length} shots
        </Label>
        <div className="mt-2 grid grid-cols-8 gap-1.5 sm:grid-cols-12">
          {visible.map((s, i) => (
            <div
              key={i}
              title={`scene ${s.sceneIndex + 1} · shot ${s.shotIndex + 1}`}
              className={`aspect-video rounded-sm transition-all duration-300 ${
                s.status === "pending"
                  ? "bg-white/5"
                  : s.status === "generating"
                    ? "animate-pulse bg-white/30"
                    : ""
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
    </>
  );
}

function Result({ state }: { state: DemoState }) {
  const strip = state.shots.filter((s) => s.status === "ready" || s.status === "cached").slice(0, 24);
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-emerald-200">Your cut is ready</h3>
          <p className="text-sm text-white/60">
            {fmtDuration(state.durationSec)} · {state.scenes} scenes
          </p>
        </div>
        <div className="flex gap-2">
          <Pill>▶ Play</Pill>
          <Pill>↓ Download</Pill>
          <Pill>↗ Publish</Pill>
        </div>
      </div>
      {state.filmUrl ? (
        <div className="mt-4">
          <HlsPlayer src={state.filmUrl} />
        </div>
      ) : (
        <div className="mt-4 flex gap-1 overflow-hidden rounded-lg">
          {strip.map((s, i) => (
            <div
              key={i}
              className="h-16 flex-1"
              style={{ background: `linear-gradient(135deg, hsl(${s.hue} 65% 45%), hsl(${(s.hue + 40) % 360} 60% 30%))` }}
            />
          ))}
        </div>
      )}
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
function Stages({ status }: { status: ProjectStatus | null }) {
  const idx = status ? STAGES.indexOf(status) : -1;
  return (
    <div className="flex items-center gap-2">
      {STAGES.map((s, i) => (
        <div
          key={s}
          className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs transition ${
            i < idx
              ? "bg-emerald-400/15 text-emerald-300"
              : i === idx
                ? "bg-white/15 text-white"
                : "bg-white/5 text-white/40"
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
function BibleCard({ kind, name, desc }: { kind: string; name: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-wider text-white/40">{kind}</div>
      <div className="mt-1 font-semibold">{name}</div>
      <div className="mt-1 text-sm text-white/55">{desc}</div>
    </div>
  );
}
function Pill({ children }: { children: ReactNode }) {
  return <span className="cursor-default rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70">{children}</span>;
}
function EmptyState({ kind }: { kind: string }) {
  return (
    <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-white/40">
      <div>
        <p className="text-sm">
          Describe your {kind} and press <span className="text-white/70">Create</span>.
        </p>
        <p className="mt-1 text-xs">Watch it get written, cast, filmed and cut — start to finish.</p>
      </div>
    </div>
  );
}
