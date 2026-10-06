"use client";

import { useState, type ReactNode } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { RunPanel } from "./RunPanel";
import { SHORT_PLATFORMS } from "../lib/products";
import type { ProjectStatus } from "../lib/demo";
import { ActionBand, Cell, Control, PageHeader, Section, SpecList, Split } from "./cf/primitives";
import { Pipeline, type PipelineStep } from "./cf/Pipeline";

const STAGE_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Hook & script",
  GENERATING: "Generating clip",
  RENDERING: "Captioning & export",
  READY: "Ready to post",
};

/** The Short-Form Cutting Room (docs/design/create-shorts.html) — platform-first,
 *  with a hook line, caption and hashtags. Runs through the shared useCreateRun. */
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
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Short form / Editorial system"
        title={<>Make it<br /><em>move.</em></>}
        copy={
          <>
            <p>Build short-form films around a single idea, a decisive opening and a rhythm designed for the screen.</p>
            <p><strong>One story. One vertical composition. No wasted frame.</strong></p>
          </>
        }
        status={{ tone: state?.live ? "live" : "idle", label: state ? (state.live ? "Live production" : "Preview simulation") : "Short-form room open" }}
      />

      <Section label="01 — Destination" title="Where will it play?">
        <div className="grid grid-cols-2 gap-px border border-cf-line bg-cf-line sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Platform">
          {SHORT_PLATFORMS.map((p, i) => {
            const on = platformId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickPlatform(p.id)}
                className={`flex min-h-[120px] flex-col p-4 text-left transition ${on ? "bg-cf-inverse text-cf-on-inverse" : "bg-cf-bg hover:bg-cf-soft"}`}
              >
                <span className="font-mono text-[11px] opacity-60">{String(i + 1).padStart(2, "0")}</span>
                <span className="mt-auto font-display font-semibold text-[19px] leading-tight">{p.name}</span>
                <span className="mt-1 font-mono text-[11px] uppercase opacity-60">
                  {p.aspect} · up to {Math.max(...p.durations)}s
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="02 — Short architecture" title="Define the piece.">
        <Split>
          <Cell>
            <label htmlFor="short-hook" className="flex justify-between font-sans text-[11px] font-medium uppercase tracking-[0.06em]">
              <span>The opening hook</span>
              <span className="text-cf-muted">First 2 seconds</span>
            </label>
            <input id="short-hook" value={hook} onChange={(e) => setHook(e.target.value)} className="cf-input mt-2.5 font-display font-semibold text-[20px]" />
            <p className="cf-label mt-3 leading-relaxed">The opening frame and first line give the audience a reason to keep watching.</p>

            <label htmlFor="short-caption" className="mt-9 block font-sans text-[11px] font-medium uppercase tracking-[0.06em]">Caption</label>
            <textarea id="short-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} placeholder="On-screen / post caption" className="cf-input mt-2.5 resize-y" />

            <label htmlFor="short-tags" className="mt-7 block font-sans text-[11px] font-medium uppercase tracking-[0.06em]">Hashtags</label>
            <input id="short-tags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} className="cf-input mt-2.5" />

            <div className="mt-9">
              <Control name="Length" value={`${seconds}s`}>
                <div className="flex flex-wrap gap-1.5">
                  {platform.durations.map((d) => (
                    <Chip key={d} active={seconds === d} onClick={() => setSeconds(d)}>{d}s</Chip>
                  ))}
                </div>
              </Control>
            </div>
          </Cell>
          <Cell>
            <div className="cf-label">The frame</div>
            <div className="mt-8 flex justify-center border-b border-cf-line pb-8">
              <div
                className="relative flex w-[150px] items-end border border-cf-fg bg-cf-inverse p-3 text-cf-on-inverse"
                style={{ aspectRatio: platform.aspect.replace(":", " / ") }}
                aria-hidden
              >
                <span className="font-display font-semibold text-[13px] leading-snug">{hook}</span>
              </div>
            </div>
            <SpecList className="mt-8" rows={[["Platform", platform.name], ["Format", `${platform.aspect} · ${seconds}s`], ["Engine", "Wan 2.1"]]} />
            <div className="mt-10">
              <Pipeline steps={SHORT_PIPELINE} status={state?.status} />
            </div>
          </Cell>
        </Split>
      </Section>

      <section className="mt-14 border-t border-cf-fg" aria-label="Short preview">
        <div className="flex items-center justify-between border-b border-cf-line py-4">
          <span className="cf-label text-cf-fg">03 — The short</span>
          <span className="cf-label">{state ? STAGE_LABELS[state.status] : "Waiting for the hook"}</span>
        </div>
        <div className={state ? "pt-8" : ""}>
          <RunPanel
            state={state}
            stageLabels={STAGE_LABELS}
            readyTitle="Ready to post"
            artSeed={hook}
            emptyHint={
              <div>
                <p className="cf-display text-[clamp(38px,5vw,62px)] leading-none">Stop the scroll.</p>
                <p className="cf-label mt-3">Sized to the right aspect ratio and length for the feed</p>
              </div>
            }
          />
        </div>
      </section>

      <div className="mt-14">
        <ActionBand title={<>Make it for <em>{platform.name}.</em></>} copy={`${platform.aspect} · ${seconds}s · opens on “${hook}”.`}>
          <button type="button" onClick={reset} className="cf-btn-line">
            Reset
          </button>
          <button type="button" onClick={onCreate} disabled={running || !hook.trim()} className="cf-btn-accent">
            {running ? "Creating…" : `Create for ${platform.name}`}
          </button>
        </ActionBand>
      </div>
    </div>
  );
}

const SHORT_PIPELINE: PipelineStep[] = [
  { name: "Hook & script", at: "PLANNING" },
  { name: "Vertical clip", at: "GENERATING" },
  { name: "Captions & export", at: "RENDERING" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="cf-option">
      {children}
    </button>
  );
}
