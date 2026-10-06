"use client";

import { useState } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { usePlan } from "../lib/usePlan";
import { RunPanel } from "./RunPanel";
import type { ProjectStatus } from "../lib/demo";
import { Chips, ExampleShelf, Field, StudioFooter, StudioGrid, StudioPage, UnlockRow } from "./cf/StudioLayout";
import { NotifyToggle } from "./cf/NotifyToggle";

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

const EXAMPLES = [
  { title: "Space heist", brief: "A sci-fi heist on a derelict space station." },
  { title: "Kingdom war", brief: "An African kingdom rises against an empire — three generations, one war for independence." },
  { title: "Noir city", brief: "A detective hunts a vanished singer through a neon city that never sleeps." },
  { title: "Ocean myth", brief: "A fisherman's daughter follows a glowing whale beyond the edge of the map." },
];

/** The Cutting Room (docs/design/create-trailer.html) — beats, voiceover and a
 *  music sting, not a feature prompt. Runs through the shared useCreateRun. */
export function TrailerStudio() {
  const [subject, setSubject] = useState(EXAMPLES[0]!.brief);
  const [type, setType] = useState(TYPES[0]!);
  const [seconds, setSeconds] = useState(30);
  const [music, setMusic] = useState(MUSIC[1]!);
  const [vo, setVo] = useState(VO[1]!);
  const { state, running, run, reset } = useCreateRun();
  const plan = usePlan();

  // Only offer lengths this plan can run; the worker clamps regardless.
  const lengths = DURATIONS.filter((d) => d <= plan.maxSec);
  const effSeconds = lengths.includes(seconds) ? seconds : lengths[lengths.length - 1] ?? DURATIONS[0]!;

  function onCreate() {
    run({
      prompt: `${type} trailer (${effSeconds}s) for: ${subject}. Music: ${music}. Voiceover: ${vo}.`,
      modelId: "wan-2.1",
      targetSeconds: effSeconds,
    });
    if (window.innerWidth < 1024) document.getElementById("studio-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <StudioPage
      title="Create a Trailer"
      subtitle="Turn a story into anticipation — set the objective, the rhythm and the sound."
      badge={state?.live ? { tone: "live", label: "Live · saved to Projects" } : { tone: "warn", label: "Preview" }}
    >
      <StudioGrid
        controls={
          <>
            <ExampleShelf examples={EXAMPLES} onPick={setSubject} />
            <Field label="What should the trailer sell?" htmlFor="trailer-subject">
              <textarea id="trailer-subject" value={subject} onChange={(e) => setSubject(e.target.value)} rows={3} className="cf-input min-h-[96px] resize-y leading-[1.6]" />
            </Field>
            <Field label="Objective" value={type}>
              <Options options={TYPES} value={type} set={setType} />
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
            <Field label="Music" value={music}>
              <Options options={MUSIC} value={music} set={setMusic} />
            </Field>
            <Field label="Voiceover" value={vo}>
              <Options options={VO} value={vo} set={setVo} />
            </Field>
            <UnlockRow plan={plan.name} items={lengths.length < DURATIONS.length ? [`${DURATIONS[DURATIONS.length - 1]}s cuts`] : []} />
          </>
        }
        footer={
          <StudioFooter
            rows={[
              ["Cut", `${type} · ${effSeconds}s`],
              ["Sound", `${music} · ${vo === "None" ? "no VO" : vo}`],
            ]}
            note={<NotifyToggle state={state} />}
          >
            <button type="button" onClick={onCreate} disabled={running || !subject.trim()} className="cf-btn-accent flex-1">
              {running ? "Cutting…" : "Cut trailer"}
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
            readyTitle="Trailer ready" fill
            artSeed={subject}
            emptyHint={
              <div>
                <p className="cf-display text-[clamp(32px,4vw,52px)] leading-none">The cut begins here.</p>
                <p className="mt-3 text-[14px] text-white/80">Beats, voiceover and a sting — sized for the feed.</p>
              </div>
            }
          />
        }
      />
    </StudioPage>
  );
}

function Options({ options, value, set }: { options: string[]; value: string; set: (v: string) => void }) {
  return (
    <Chips>
      {options.map((o) => (
        <button key={o} type="button" onClick={() => set(o)} aria-pressed={value === o} className="cf-option">
          {o}
        </button>
      ))}
    </Chips>
  );
}
