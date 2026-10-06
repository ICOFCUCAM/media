"use client";

import { useMemo, useState } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { RunPanel } from "./RunPanel";
import type { ProjectStatus } from "../lib/demo";
import { usePlan } from "../lib/usePlan";
import { fmtDuration } from "../lib/system";
import { ExampleShelf, Field, StudioFooter, StudioGrid, StudioPage, UnlockRow } from "./cf/StudioLayout";
import { NotifyToggle } from "./cf/NotifyToggle";

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

/** The Writers' Room (docs/design/create-series.html) — seasons + an editable
 *  episode list, not a single prompt. Runs through the shared useCreateRun. */
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
    if (window.innerWidth < 1024) document.getElementById("studio-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const plan = usePlan();
  const clamped = totalMin * 60 > plan.maxSec;

  return (
    <StudioPage
      title="Create a Series"
      subtitle="Shape the season and every episode — characters and story logic persist across all of them."
      badge={state?.live ? { tone: "live", label: "Live · saved to Projects" } : { tone: "warn", label: "Preview" }}
    >
      <StudioGrid
        controls={
          <>
            <ExampleShelf examples={EXAMPLES} onPick={setPremise} />
            <Field label="Premise" htmlFor="series-premise">
              <textarea id="series-premise" value={premise} onChange={(e) => setPremise(e.target.value)} rows={3} className="cf-input min-h-[96px] resize-y leading-[1.6]" />
            </Field>

            <Field
              label={`Season ${seasons} · episodes`}
              value={
                <span className="inline-flex items-center rounded-md border border-cf-line2">
                  <button type="button" onClick={() => setSeasons(Math.max(1, seasons - 1))} aria-label="Previous season" className="h-8 w-8 text-[15px] text-cf-muted hover:text-cf-fg">−</button>
                  <span className="w-6 text-center text-[13px] text-cf-fg" aria-live="polite">{seasons}</span>
                  <button type="button" onClick={() => setSeasons(seasons + 1)} aria-label="Next season" className="h-8 w-8 text-[15px] text-cf-muted hover:text-cf-fg">+</button>
                </span>
              }
            >
              <ol className="overflow-hidden rounded-md border border-cf-line">
                {episodes.map((e, i) => (
                  <li key={e.key} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-2.5 border-b border-cf-line bg-cf-bg px-3 py-2.5 last:border-b-0">
                    <span className="pt-2 font-mono text-[11px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <input
                        value={e.title}
                        onChange={(ev) => patch(e.key, { title: ev.target.value })}
                        aria-label={`Episode ${i + 1} title`}
                        className="w-full border-0 bg-transparent py-1 font-display text-[16px] font-semibold text-cf-fg outline-none focus:underline focus:decoration-cf-line focus:underline-offset-4"
                      />
                      <input
                        value={e.logline}
                        onChange={(ev) => patch(e.key, { logline: ev.target.value })}
                        placeholder="Logline — what happens this episode"
                        aria-label={`Episode ${i + 1} logline`}
                        className="w-full border-0 bg-transparent py-1 text-[13px] text-cf-muted outline-none placeholder:text-cf-dim focus:text-cf-fg"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={e.minutes}
                        onChange={(ev) => patch(e.key, { minutes: Number(ev.target.value) })}
                        aria-label={`Episode ${i + 1} runtime`}
                        className="min-h-[40px] rounded-md border border-cf-line2 bg-cf-panel px-1.5 text-[13px] text-cf-fg outline-none focus:border-cf-accent"
                      >
                        {[5, 10, 20, 30, 45].map((m) => (
                          <option key={m} value={m}>{m}m</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeEp(e.key)}
                        aria-label={`Remove episode ${i + 1}`}
                        className="flex h-10 w-10 items-center justify-center rounded-md text-cf-muted transition hover:bg-cf-soft hover:text-cf-fg"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <button type="button" onClick={addEp} className="cf-btn-line mt-2.5 w-full">
                + Add episode
              </button>
            </Field>

            <UnlockRow plan={plan.name} items={clamped ? [`full ${totalMin}-minute seasons (this plan renders ${fmtDuration(plan.maxSec)} of it)`] : []} />
          </>
        }
        footer={
          <StudioFooter
            rows={[
              ["Episodes", String(episodes.length)],
              ["Season", `${totalMin} min`],
            ]}
            note={<NotifyToggle state={state} />}
          >
            <button type="button" onClick={onCreate} disabled={running || !premise.trim() || episodes.length === 0} className="cf-btn-accent flex-1">
              {running ? "Creating season…" : "Create series"}
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
            readyTitle="Season ready" fill
            artSeed={premise}
            emptyHint={
              <div>
                <p className="cf-display text-[clamp(32px,4vw,52px)] leading-none">The season begins here.</p>
                <p className="mt-3 text-[14px] text-white/80">Characters keep their look · the story holds across episodes.</p>
              </div>
            }
          />
        }
      />
    </StudioPage>
  );
}

const EXAMPLES = [
  { title: "Megacity thriller", brief: "A political thriller set in a near-future megacity, following a journalist uncovering a conspiracy." },
  { title: "Royal dynasty", brief: "A royal dynasty fractures when the youngest heir refuses the throne and joins the rebels." },
  { title: "Island mystery", brief: "Strangers wash ashore on an island that rewrites itself every night — and only one of them remembers." },
  { title: "Space colony", brief: "The first colony ship wakes up a century early, orbiting a planet that was supposed to be empty." },
];

