"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  MODELS,
  modelAllowed,
  estimateMs,
  msToUsd,
  fmtMs,
  fmtDuration,
  IS_LIVE,
  type Tier,
} from "../../lib/system";
import { DemoRun, type DemoState, type ProjectStatus } from "../../lib/demo";
import { LiveRun } from "../../lib/live";
import { HlsPlayer } from "../../components/HlsPlayer";

const DURATIONS = [
  { label: "30s", value: 30 },
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
  { label: "30 min", value: 1800 },
];
const TIERS: Tier[] = ["FREE", "CREATOR", "STUDIO", "ENTERPRISE"];
const STAGES: ProjectStatus[] = ["PLANNING", "GENERATING", "RENDERING", "READY"];

export default function Studio() {
  const [prompt, setPrompt] = useState(
    "Create a cinematic short about an African kingdom fighting for independence.",
  );
  const [modelId, setModelId] = useState("wan-2.1");
  const [tier, setTier] = useState<Tier>("STUDIO");
  const [seconds, setSeconds] = useState(60);
  const [state, setState] = useState<DemoState | null>(null);
  const [running, setRunning] = useState(false);
  const [token, setToken] = useState("");
  const runRef = useRef<{ cancel: () => void } | null>(null);

  const allowed = modelAllowed(modelId, tier);
  const estMs = useMemo(() => estimateMs(modelId, seconds), [modelId, seconds]);

  async function onGenerate() {
    if (running || !allowed) return;
    runRef.current?.cancel();
    setRunning(true);
    setState(null);

    const onUpdate = (s: DemoState) => {
      setState(s);
      if (s.status === "READY") setRunning(false);
    };
    const cfg = { prompt, modelId, targetSeconds: seconds };

    // Live mode: drive from the real API + Socket.IO. Fall back to demo on failure.
    if (IS_LIVE) {
      const live = new LiveRun(cfg, onUpdate, token || undefined);
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
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        {/* ── Controls ─────────────────────────────────────────── */}
        <aside className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Studio</h1>
            <p className="mt-1 text-sm text-white/50">
              Drive the real pipeline. {IS_LIVE ? "Connected to a live API." : "Demo mode (no backend needed)."}
            </p>
          </div>

          <Field label="Prompt">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm outline-none focus:border-white/30"
            />
          </Field>

          <Field label="Tier (model gating)">
            <div className="flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <Chip key={t} active={tier === t} onClick={() => setTier(t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Model">
            <div className="flex gap-2">
              {MODELS.map((m) => {
                const ok = modelAllowed(m.id, tier);
                return (
                  <button
                    key={m.id}
                    onClick={() => setModelId(m.id)}
                    disabled={!ok}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      modelId === m.id ? "border-white/40 bg-white/10" : "border-white/10 bg-white/[0.03]"
                    } ${ok ? "hover:border-white/30" : "cursor-not-allowed opacity-40"}`}
                    title={ok ? "" : `Not available on ${tier}`}
                  >
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-white/40">{m.klass}</div>
                  </button>
                );
              })}
            </div>
            {!allowed && (
              <p className="mt-2 text-xs text-amber-300">
                {modelId} is gated to Studio/Enterprise — the API would reject this with MODEL_NOT_ALLOWED.
              </p>
            )}
          </Field>

          <Field label="Length">
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <Chip key={d.value} active={seconds === d.value} onClick={() => setSeconds(d.value)}>
                  {d.label}
                </Chip>
              ))}
            </div>
          </Field>

          {IS_LIVE && (
            <Field label="API token (optional)">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="JWT for the live gateway"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm outline-none focus:border-white/30"
              />
            </Field>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
            <Row k="Scenes × shots" v={`${Math.max(1, Math.round(seconds / 18))} × 4`} />
            <Row k="Pre-flight estimate" v={fmtMs(estMs)} />
            <Row k="Est. cost (self-hosted)" v={`~$${msToUsd(estMs).toFixed(2)}`} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onGenerate}
              disabled={running || !allowed}
              className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {running ? "Generating…" : "Generate film"}
            </button>
            <button onClick={onReset} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5">
              Reset
            </button>
          </div>
        </aside>

        {/* ── Pipeline view ────────────────────────────────────── */}
        <section className="space-y-6">
          <Stages status={state?.status ?? null} />
          {state ? <Pipeline state={state} /> : <EmptyState />}
        </section>
      </div>
    </main>
  );
}

function Pipeline({ state }: { state: DemoState }) {
  const visible = state.shots.slice(0, 160);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Progress" value={`${Math.round(state.progress * 100)}%`} />
        <Stat label="GPU spent" value={fmtMs(state.spentMs)} sub={`~$${msToUsd(state.spentMs).toFixed(2)}`} />
        <Stat
          label="GPU pool"
          value={state.status === "READY" ? "idle → shutdown" : "running"}
          accent={state.status === "READY" ? "muted" : "good"}
        />
      </div>

      {(state.characters.length > 0 || state.locations.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {state.characters.map((c) => (
            <BibleCard key={c.name} kind="Character Bible" name={c.name} desc={c.appearance} />
          ))}
          {state.locations.map((l) => (
            <BibleCard key={l.name} kind="World Bible" name={l.name} desc={l.description} />
          ))}
        </div>
      )}

      {state.status === "RENDERING" && (
        <div>
          <Label>FFmpeg render</Label>
          <Bar value={state.renderProgress} />
        </div>
      )}

      {state.status === "READY" && <FilmResult state={state} />}

      <div>
        <Label>
          Shots · {state.shots.filter((s) => s.status === "ready" || s.status === "cached").length}/{state.shots.length}
        </Label>
        <div className="mt-2 grid grid-cols-8 gap-1.5 sm:grid-cols-12">
          {visible.map((s, i) => (
            <div
              key={i}
              title={`scene ${s.sceneIndex + 1} · shot ${s.shotIndex + 1} · ${s.status}`}
              className={`aspect-video rounded-sm transition-all duration-300 ${
                s.status === "pending"
                  ? "bg-white/5"
                  : s.status === "generating"
                    ? "animate-pulse bg-white/30"
                    : ""
              } ${s.status === "cached" ? "ring-1 ring-emerald-400/60" : ""}`}
              style={
                s.status === "ready" || s.status === "cached"
                  ? { background: `linear-gradient(135deg, hsl(${s.hue} 65% 45%), hsl(${(s.hue + 40) % 360} 60% 30%))` }
                  : undefined
              }
            />
          ))}
        </div>
        {state.shots.length > visible.length && (
          <p className="mt-2 text-xs text-white/40">+{state.shots.length - visible.length} more shots</p>
        )}
      </div>

      <Console lines={state.log} />
    </>
  );
}

function FilmResult({ state }: { state: DemoState }) {
  const strip = state.shots.filter((s) => s.status === "ready" || s.status === "cached").slice(0, 24);
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-emerald-200">film.ready</h3>
          <p className="text-sm text-white/60">
            {fmtDuration(state.durationSec)} · {state.scenes} scenes · MP4 + HLS
          </p>
        </div>
        <div className="flex gap-2">
          <Btn>▶ Stream</Btn>
          <Btn>↓ Download</Btn>
        </div>
      </div>
      {state.filmUrl ? (
        <div className="mt-4">
          <HlsPlayer src={state.filmUrl} />
          <p className="mt-2 break-all text-xs text-white/40">{state.filmUrl}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-1 overflow-hidden rounded-lg">
            {strip.map((s, i) => (
              <div
                key={i}
                className="h-16 flex-1"
                style={{ background: `linear-gradient(135deg, hsl(${s.hue} 65% 45%), hsl(${(s.hue + 40) % 360} 60% 30%))` }}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-white/40">
            Demo render — set NEXT_PUBLIC_API_URL to stream the real MP4/HLS from S3 via the FFmpeg engine.
          </p>
        </>
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
function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "good" | "muted" }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-wider text-white/40">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold ${
          accent === "good" ? "text-emerald-300" : accent === "muted" ? "text-white/50" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-white/40">{sub}</div>}
    </div>
  );
}
function Stages({ status }: { status: ProjectStatus | null }) {
  const idx = status ? STAGES.indexOf(status) : -1;
  return (
    <div className="flex items-center gap-2">
      {STAGES.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <div
            className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs transition ${
              i < idx
                ? "bg-emerald-400/15 text-emerald-300"
                : i === idx
                  ? "bg-white/15 text-white"
                  : "bg-white/5 text-white/40"
            }`}
          >
            {s}
          </div>
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
function Console({ lines }: { lines: string[] }) {
  return (
    <div className="max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-white/60">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}
function Btn({ children }: { children: ReactNode }) {
  return (
    <span className="cursor-default rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70">{children}</span>
  );
}
function EmptyState() {
  return (
    <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-white/40">
      <div>
        <p className="text-sm">Enter a prompt and press <span className="text-white/70">Generate film</span>.</p>
        <p className="mt-1 text-xs">You'll see the Director plan, shots generate &amp; cache, and FFmpeg render.</p>
      </div>
    </div>
  );
}
