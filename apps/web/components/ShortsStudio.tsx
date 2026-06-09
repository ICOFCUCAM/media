"use client";

import { useState, type ReactNode } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { RunPanel } from "./RunPanel";
import { SHORT_PLATFORMS } from "../lib/products";
import type { ProjectStatus } from "../lib/demo";

const STAGE_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Hook & script",
  GENERATING: "Generating clip",
  RENDERING: "Captioning & export",
  READY: "Ready to post",
};

/** Short-form studio — platform-first, with a hook line, caption and hashtags. */
export function ShortsStudio() {
  const [platformId, setPlatformId] = useState(SHORT_PLATFORMS[0]!.id);
  const platform = SHORT_PLATFORMS.find((p) => p.id === platformId)!;
  const [seconds, setSeconds] = useState(platform.durations[0]!);
  const [hook, setHook] = useState("A tiny chef plates a miniature gourmet dish");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("#oddlysatisfying #foodart #miniature");
  const { state, running, run, reset } = useCreateRun();

  function pickPlatform(id: string) {
    setPlatformId(id);
    const p = SHORT_PLATFORMS.find((x) => x.id === id)!;
    if (!p.durations.includes(seconds)) setSeconds(p.durations[0]!);
  }

  function onCreate() {
    run({
      prompt: `Vertical ${platform.name} short (${platform.aspect}, ${seconds}s). Hook: ${hook}. ${caption}`,
      modelId: "wan-2.1",
      targetSeconds: seconds,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Short-Form Studio</h1>
        <p className="mt-1 text-sm text-white/55">Vertical, scroll-stopping clips sized for each feed — hook, caption and hashtags included.</p>
      </header>

      {/* Platform picker — the defining choice for shorts. */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {SHORT_PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => pickPlatform(p.id)}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              platformId === p.id ? "border-white/40 bg-white/[0.07]" : "border-white/10 bg-white/[0.02] hover:border-white/25"
            }`}
          >
            <div className="text-sm font-medium">{p.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/40">{p.aspect}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <Field label="Length">
            <div className="flex flex-wrap gap-2">
              {platform.durations.map((d) => (
                <Chip key={d} active={seconds === d} onClick={() => setSeconds(d)}>{d}s</Chip>
              ))}
            </div>
          </Field>
          <Field label="Hook (first 2 seconds)">
            <input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
            />
          </Field>
          <Field label="Caption">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              placeholder="On-screen / post caption"
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
            />
          </Field>
          <Field label="Hashtags">
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
            />
          </Field>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
            <Row k="Platform" v={platform.name} />
            <Row k="Format" v={`${platform.aspect} · ${seconds}s`} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCreate}
              disabled={running}
              className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {running ? "Creating…" : `Create for ${platform.name}`}
            </button>
            <button onClick={reset} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5">Reset</button>
          </div>
        </aside>

        <RunPanel
          state={state}
          stageLabels={STAGE_LABELS}
          readyTitle="Ready to post"
          emptyHint={
            <div>
              <p className="text-sm">Pick a platform and a hook, then press <span className="text-white/70">Create</span>.</p>
              <p className="mt-1 text-xs">Sized to the right aspect ratio and length for the feed.</p>
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
