"use client";

import { useMemo, useState } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { RunPanel } from "./RunPanel";
import type { ProjectStatus } from "../lib/demo";
import { ActionBand, Cell, PageHeader, Section, SpecList, Split } from "./cf/primitives";
import { Pipeline, type PipelineStep } from "./cf/Pipeline";

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
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Writers' room / Series architecture"
        title={<>Build the<br /><em>series.</em></>}
        copy={
          <>
            <p>Establish the world, define the season and shape every episode before production begins.</p>
            <p><strong>Characters persist. Story logic persists. The production moves as one continuous system.</strong></p>
          </>
        }
        status={{ tone: state?.live ? "live" : "idle", label: state ? (state.live ? "Live production" : "Preview simulation") : "Writers' room open" }}
      />

      <Section label="01 — Series architecture" title="Define the production.">
        <Split>
          <Cell>
            <div className="flex items-center justify-between">
              <label htmlFor="series-premise" className="font-mono text-[9px] uppercase tracking-[0.1em]">Premise</label>
              <span className="cf-label">Required</span>
            </div>
            <textarea id="series-premise" value={premise} onChange={(e) => setPremise(e.target.value)} rows={4} className="cf-input mt-2.5 resize-y p-5 leading-[1.7]" />
            <p className="cf-label mt-3 leading-relaxed">The premise founds the season architecture, episode outlines, cast, locations and the production run.</p>

            <div className="mt-12 flex items-end justify-between gap-4 border-b border-cf-fg pb-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em]">
                Season {String(seasons).padStart(2, "0")} / Episodes
              </span>
              <span className="cf-label">{String(episodes.length).padStart(2, "0")} episodes</span>
            </div>
            <ol>
              {episodes.map((e, i) => (
                <li key={e.key} className="grid grid-cols-[36px_1fr_auto] gap-x-4 border-b border-cf-line py-5">
                  <span className="pt-1 font-mono text-[9px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <input
                      value={e.title}
                      onChange={(ev) => patch(e.key, { title: ev.target.value })}
                      aria-label={`Episode ${i + 1} title`}
                      className="w-full border-0 bg-transparent font-serif text-[22px] tracking-[-0.02em] text-cf-fg outline-none focus:underline focus:decoration-cf-line focus:underline-offset-8"
                    />
                    <input
                      value={e.logline}
                      onChange={(ev) => patch(e.key, { logline: ev.target.value })}
                      placeholder="Logline — what happens this episode"
                      aria-label={`Episode ${i + 1} logline`}
                      className="mt-1.5 w-full border-0 bg-transparent text-[13px] text-cf-muted outline-none placeholder:text-cf-dim focus:text-cf-fg"
                    />
                  </div>
                  <div className="flex items-start gap-2">
                    <select
                      value={e.minutes}
                      onChange={(ev) => patch(e.key, { minutes: Number(ev.target.value) })}
                      aria-label={`Episode ${i + 1} runtime`}
                      className="border border-cf-line bg-cf-panel px-2 py-2 font-mono text-[10px] uppercase text-cf-fg outline-none focus:border-cf-fg"
                    >
                      {[5, 10, 20, 30, 45].map((m) => (
                        <option key={m} value={m}>{m} min</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeEp(e.key)}
                      aria-label={`Remove episode ${i + 1}`}
                      className="flex h-[34px] w-[34px] items-center justify-center border border-cf-line text-cf-muted transition hover:border-cf-fg hover:text-cf-fg"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" onClick={addEp} className="cf-btn-line mt-6">
              + Add episode
            </button>
          </Cell>

          <Cell>
            <div className="cf-label">Season architecture</div>
            <div className="mt-8 flex items-center justify-between border-b border-t border-cf-line py-4">
              <span className="text-[11px] text-cf-muted">Season</span>
              <div className="inline-flex items-center border border-cf-line">
                <button type="button" onClick={() => setSeasons(Math.max(1, seasons - 1))} aria-label="Previous season" className="px-3 py-1.5 text-cf-muted hover:text-cf-fg">−</button>
                <span className="w-8 text-center font-mono text-[11px]" aria-live="polite">{seasons}</span>
                <button type="button" onClick={() => setSeasons(seasons + 1)} aria-label="Next season" className="px-3 py-1.5 text-cf-muted hover:text-cf-fg">+</button>
              </div>
            </div>
            <div className="border-b border-cf-line py-6">
              <div className="cf-label">Season runtime</div>
              <div className="cf-display mt-2 text-[56px] leading-none">{totalMin}</div>
              <div className="cf-label mt-1">minutes · {episodes.length} episodes</div>
            </div>
            <SpecList
              className="mt-8"
              rows={[
                ["Persistent cast", "✓"],
                ["Persistent worlds", "✓"],
                ["Story continuity", "✓"],
                ["Engine", "Wan 2.1"],
              ]}
            />
            <div className="cf-label mb-3 mt-10">Production pipeline</div>
            <Pipeline steps={SERIES_PIPELINE} status={state?.status} />
          </Cell>
        </Split>
      </Section>

      <section className="mt-14 border-t border-cf-fg" aria-label="Season preview">
        <div className="flex items-center justify-between border-b border-cf-line py-4">
          <span className="cf-label text-cf-fg">02 — Season production</span>
          <span className="cf-label">{state ? STAGE_LABELS[state.status] : "Waiting for the outline"}</span>
        </div>
        <div className={state ? "pt-8" : ""}>
          <RunPanel
            state={state}
            stageLabels={STAGE_LABELS}
            readyTitle="Season ready"
            emptyHint={
              <div>
                <p className="cf-display text-[clamp(38px,5vw,62px)] leading-none">The season begins here.</p>
                <p className="cf-label mt-3">Characters keep their look · the story holds across episodes</p>
              </div>
            }
          />
        </div>
      </section>

      <div className="mt-14">
        <ActionBand
          title={<>Send the outline to <em>production.</em></>}
          copy={`${episodes.length} episodes · ${totalMin} minutes. The premise and every logline travel with the run.`}
        >
          <button type="button" onClick={reset} className="cf-btn border border-white/20 text-cf-on-inverse hover:border-white/50">
            Reset
          </button>
          <button type="button" onClick={onCreate} disabled={running || !premise.trim() || episodes.length === 0} className="cf-btn-accent">
            {running ? "Creating season…" : "Create series"}
          </button>
        </ActionBand>
      </div>
    </div>
  );
}

const SERIES_PIPELINE: PipelineStep[] = [
  { name: "Series bible", at: "PLANNING", idle: "Story" },
  { name: "Episode architecture", at: "PLANNING", idle: "Structure" },
  { name: "Characters & worlds", at: "PLANNING", idle: "Continuity" },
  { name: "Episode generation", at: "GENERATING", idle: "Wan 2.1" },
  { name: "Season assembly", at: "RENDERING", idle: "Render" },
];
