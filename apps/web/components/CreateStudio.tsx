"use client";

import { useMemo, useState, type ReactNode } from "react";
import { estimateMs, fmtDuration } from "../lib/system";
import type { ProjectStatus } from "../lib/demo";
import { useCreateRun } from "../lib/useCreateRun";
import { RunPanel } from "./RunPanel";
import type { ShortPlatform } from "../lib/products";

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
 * and copy change. Runs through the shared runner (real worker pipeline when
 * signed in, loudly-labelled preview otherwise) and renders the shared
 * production console.
 */
export function CreateStudio(props: CreateStudioProps) {
  const [prompt, setPrompt] = useState(props.defaultPrompt);
  const [seconds, setSeconds] = useState(props.defaultSeconds);
  const [platform, setPlatform] = useState(props.platforms?.[0]?.id ?? "");
  const { state, running, run, reset } = useCreateRun();

  const modelId = "wan-2.1";
  const estMs = useMemo(() => estimateMs(modelId, seconds), [modelId, seconds]);
  // One serialized GPU: wall-clock ≈ total GPU time + assembly overhead.
  const readyEstimate = fmtDuration(Math.round(estMs / 1000) + 60);

  function onCreate() {
    void run({ prompt, modelId, targetSeconds: seconds });
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
            <button onClick={reset} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5">
              Reset
            </button>
          </div>
          <p className="text-center text-xs text-white/35">
            {state?.live
              ? "Live — your studio is doing the real work."
              : "Sign in to run the real studio; otherwise this previews the flow."}
          </p>
        </aside>

        <section className="space-y-6">
          <RunPanel
            state={state}
            stageLabels={STAGE_LABEL}
            readyTitle="Your cut is ready"
            emptyHint={<EmptyState kind={props.kind} />}
          />
          {state && (state.characters.length > 0 || state.locations.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {state.characters.map((c) => (
                <BibleCard key={c.name} kind="Cast" name={c.name} desc={c.appearance} />
              ))}
              {state.locations.map((l) => (
                <BibleCard key={l.name} kind="Location" name={l.name} desc={l.description} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ── small UI bits ──────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wider text-white/40">{label}</span>
      <div className="mt-2">{children}</div>
    </div>
  );
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
function BibleCard({ kind, name, desc }: { kind: string; name: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-wider text-white/40">{kind}</div>
      <div className="mt-1 font-semibold">{name}</div>
      <div className="mt-1 text-sm text-white/55">{desc}</div>
    </div>
  );
}
function EmptyState({ kind }: { kind: string }) {
  return (
    <div>
      <p className="text-sm">
        Describe your {kind} and press <span className="text-white/70">Create</span>.
      </p>
      <p className="mt-1 text-xs">Watch it get written, cast, filmed and cut — start to finish.</p>
    </div>
  );
}
