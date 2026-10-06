"use client";

import { useState, type ReactNode } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { RunPanel } from "./RunPanel";
import type { ProjectStatus } from "../lib/demo";
import { ActionBand, Cell, Control, PageHeader, Section, SpecList, Split } from "./cf/primitives";
import { Pipeline, type PipelineStep } from "./cf/Pipeline";

const STAGE_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Picking beats",
  GENERATING: "Cutting shots",
  RENDERING: "Scoring & mixing",
  READY: "Trailer ready",
};

const TYPES = ["Teaser", "Theatrical", "Festival", "Announcement"];
const DURATIONS = [15, 30, 60, 90];
const MUSIC = ["Epic", "Tense", "Uplifting", "Dark", "Playful"];
const VO = ["None", "Gravelly", "Warm", "Whispered"];

/** The Cutting Room (docs/design/create-trailer.html) — beats, voiceover and a
 *  music sting, not a feature prompt. Runs through the shared useCreateRun. */
export function TrailerStudio() {
  const [subject, setSubject] = useState("A sci-fi heist on a derelict space station.");
  const [type, setType] = useState(TYPES[0]);
  const [seconds, setSeconds] = useState(30);
  const [music, setMusic] = useState(MUSIC[1]);
  const [vo, setVo] = useState(VO[1]);
  const { state, running, run, reset } = useCreateRun();

  function onCreate() {
    run({
      prompt: `${type} trailer (${seconds}s) for: ${subject}. Music: ${music}. Voiceover: ${vo}.`,
      modelId: "wan-2.1",
      targetSeconds: seconds,
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Cutting room / Editorial"
        title={<>Cut the<br /><em>trailer.</em></>}
        copy={
          <>
            <p>Turn a story into anticipation. Choose the objective, set the rhythm and the sound, and let the cut build toward its final image.</p>
            <p><strong>Paced for the feed, with a voiceover and a music sting.</strong></p>
          </>
        }
        status={{ tone: state?.live ? "live" : "idle", label: state ? (state.live ? "Live production" : "Preview simulation") : "Cutting room open" }}
      />

      <Section label="01 — Editorial brief" title="Define the cut.">
        <Split>
          <Cell>
            <div className="flex items-center justify-between">
              <label htmlFor="trailer-subject" className="font-sans text-[11px] font-medium uppercase tracking-[0.06em]">Source / story</label>
              <span className="cf-label">Required</span>
            </div>
            <textarea id="trailer-subject" value={subject} onChange={(e) => setSubject(e.target.value)} rows={4} className="cf-input mt-2.5 resize-y p-5 leading-[1.7]" />
            <p className="cf-label mt-3 leading-relaxed">Describe the story, film or project the trailer should sell. The Director builds the editorial arc from it.</p>
            <div className="mt-10">
              <Control name="Editorial objective" value={type}>
                <Chips options={TYPES} value={type} set={setType} />
              </Control>
              <Control name="Length" value={`${seconds}s`}>
                <div className="flex flex-wrap gap-1.5">
                  {DURATIONS.map((d) => (
                    <Chip key={d} active={seconds === d} onClick={() => setSeconds(d)}>{d}s</Chip>
                  ))}
                </div>
              </Control>
            </div>
          </Cell>
          <Cell>
            <div className="cf-label">Sound</div>
            <div className="mt-8">
              <Control name="Music" value={music}>
                <Chips options={MUSIC} value={music} set={setMusic} />
              </Control>
              <Control name="Voiceover" value={vo}>
                <Chips options={VO} value={vo} set={setVo} />
              </Control>
            </div>
            <SpecList className="mt-10" rows={[["Cut", `${type} · ${seconds}s`], ["Music", music], ["Voiceover", vo], ["Engine", "Wan 2.1"]]} />
            <div className="mt-10">
              <Pipeline steps={TRAILER_PIPELINE} status={state?.status} />
            </div>
          </Cell>
        </Split>
      </Section>

      <section className="mt-14 border-t border-cf-fg" aria-label="Trailer preview">
        <div className="flex items-center justify-between border-b border-cf-line py-4">
          <span className="cf-label text-cf-fg">02 — The cut</span>
          <span className="cf-label">{state ? STAGE_LABELS[state.status] : "Waiting for the brief"}</span>
        </div>
        <div className={state ? "pt-8" : ""}>
          <RunPanel
            state={state}
            stageLabels={STAGE_LABELS}
            readyTitle="Trailer ready"
            artSeed={subject}
            emptyHint={
              <div>
                <p className="cf-display text-[clamp(38px,5vw,62px)] leading-none">The cut begins here.</p>
                <p className="cf-label mt-3">Beats, voiceover and a sting — sized for the feed</p>
              </div>
            }
          />
        </div>
      </section>

      <div className="mt-14">
        <ActionBand title={<>Make the <em>cut.</em></>} copy={`${type} trailer · ${seconds}s · ${music} score · ${vo === "None" ? "no voiceover" : `${vo.toLowerCase()} voiceover`}.`}>
          <button type="button" onClick={reset} className="cf-btn-line">
            Reset
          </button>
          <button type="button" onClick={onCreate} disabled={running || !subject.trim()} className="cf-btn-accent">
            {running ? "Cutting…" : "Cut trailer"}
          </button>
        </ActionBand>
      </div>
    </div>
  );
}

const TRAILER_PIPELINE: PipelineStep[] = [
  { name: "Editorial beats", at: "PLANNING" },
  { name: "Shots", at: "GENERATING" },
  { name: "Score & voiceover", at: "RENDERING" },
  { name: "Final cut", at: "RENDERING" },
];

function Chips({ options, value, set }: { options: string[]; value: string; set: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip key={o} active={value === o} onClick={() => set(o)}>{o}</Chip>
      ))}
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="cf-option">
      {children}
    </button>
  );
}
