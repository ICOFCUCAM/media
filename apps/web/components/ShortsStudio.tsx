"use client";

import { useState } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { usePlan } from "../lib/usePlan";
import { RunPanel } from "./RunPanel";
import { SHORT_PLATFORMS } from "../lib/products";
import type { ProjectStatus } from "../lib/demo";
import { Chips, ExampleShelf, Field, StudioFooter, StudioGrid, StudioPage, UnlockRow } from "./cf/StudioLayout";
import { NotifyToggle } from "./cf/NotifyToggle";

const STAGE_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Hook & script",
  GENERATING: "Generating clip",
  RENDERING: "Captioning & export",
  READY: "Ready to post",
};

const EXAMPLES = [
  { title: "Tiny chef", tags: "Food · Satisfying", brief: "A tiny chef plates a miniature gourmet dish" },
  { title: "City at night", tags: "Surreal · Urban", brief: "A neon city wakes up in reverse — rain falling upwards" },
  { title: "Dance stage", tags: "Music · Performance", brief: "One dancer, one spotlight, a beat drop that lights the whole stage" },
  { title: "Wild sunrise", tags: "Nature · Wildlife", brief: "Sunrise over the savannah as a lion walks straight at the camera" },
];

/** The Short-Form Cutting Room (docs/design/create-shorts.html) — platform-first,
 *  with a hook line, caption and hashtags. Runs through the shared useCreateRun. */
export function ShortsStudio() {
  const [platformId, setPlatformId] = useState(SHORT_PLATFORMS[0]!.id);
  const platform = SHORT_PLATFORMS.find((p) => p.id === platformId)!;
  const [seconds, setSeconds] = useState(platform.durations[0]!);
  const [hook, setHook] = useState(EXAMPLES[0]!.brief);
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("#oddlysatisfying #foodart #miniature");
  const { state, running, run, reset } = useCreateRun();
  const plan = usePlan();

  const lengths = platform.durations.filter((d) => d <= plan.maxSec);
  const effSeconds = lengths.includes(seconds) ? seconds : lengths[lengths.length - 1] ?? platform.durations[0]!;

  function pickPlatform(id: string) {
    setPlatformId(id);
    const p = SHORT_PLATFORMS.find((x) => x.id === id)!;
    if (!p.durations.includes(seconds)) setSeconds(p.durations[0]!);
  }

  function onCreate() {
    run({
      prompt: `Vertical ${platform.name} short (${platform.aspect}, ${effSeconds}s). Hook: ${hook}. ${caption}`,
      modelId: "wan-2.1",
      targetSeconds: effSeconds,
      aspectRatio: platform.aspect,
    });
    if (window.innerWidth < 1024) document.getElementById("studio-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <StudioPage
      title="Create Shorts"
      subtitle="One idea, a decisive opening and a vertical frame made for the feed."
      badge={state?.live ? { tone: "live", label: "Live · saved to Projects" } : { tone: "warn", label: "Preview" }}
    >
      <StudioGrid
        controls={
          <>
            <ExampleShelf examples={EXAMPLES} value={hook} onPick={setHook} />
            <Field label="Platform" value={`${platform.aspect} · up to ${Math.max(...platform.durations)}s`}>
              <Chips>
                {SHORT_PLATFORMS.map((p) => (
                  <button key={p.id} type="button" className="cf-option" aria-pressed={platformId === p.id} onClick={() => pickPlatform(p.id)}>
                    {p.name}
                  </button>
                ))}
              </Chips>
            </Field>
            <Field label="The opening hook" value="First 2 seconds" htmlFor="short-hook">
              <input id="short-hook" value={hook} onChange={(e) => setHook(e.target.value)} className="cf-input" />
            </Field>
            <Field label="Caption" htmlFor="short-caption">
              <textarea id="short-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} placeholder="On-screen / post caption" className="cf-input resize-y" />
            </Field>
            <Field label="Hashtags" htmlFor="short-tags">
              <input id="short-tags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} className="cf-input" />
            </Field>
            <Field label="Length" value={`${effSeconds}s`}>
              <Chips>
                {lengths.map((d) => (
                  <button key={d} type="button" className="cf-option" aria-pressed={effSeconds === d} onClick={() => setSeconds(d)}>
                    {d}s
                  </button>
                ))}
              </Chips>
            </Field>
            <UnlockRow plan={plan.name} items={lengths.length < platform.durations.length ? [`${Math.max(...platform.durations)}s shorts`] : []} />
          </>
        }
        footer={
          <StudioFooter
            rows={[
              ["Platform", platform.name],
              ["Format", `${platform.aspect} · ${effSeconds}s`],
            ]}
            note={<NotifyToggle state={state} />}
          >
            <button type="button" onClick={onCreate} disabled={running || !hook.trim()} className="cf-btn-accent flex-1">
              {running ? "Creating…" : `Create for ${platform.name}`}
            </button>
            <button type="button" onClick={reset} className="cf-btn-line">
              Reset
            </button>
          </StudioFooter>
        }
        preview={
          <RunPanel
            state={state}
            stageLabels={STAGE_LABELS}
            readyTitle="Ready to post" fill
            artSeed={hook}
            emptyHint={
              <div>
                <p className="cf-display text-[clamp(32px,4vw,52px)] leading-none">Stop the scroll.</p>
                <p className="mt-3 text-[14px] text-white/80">
                  {platform.name} · {platform.aspect} · {effSeconds}s
                </p>
              </div>
            }
          />
        }
      />
    </StudioPage>
  );
}
