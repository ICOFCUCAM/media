"use client";

import { useState, type ReactNode } from "react";
import { useCreateRun } from "../lib/useCreateRun";
import { RunPanel } from "./RunPanel";
import type { ProjectStatus } from "../lib/demo";

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

/** Trailer studio — beats, voiceover and a music sting, not a feature prompt. */
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
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Trailer Studio</h1>
        <p className="mt-1 text-sm text-white/55">Cut a high-impact trailer — paced for the algorithm, with a voiceover and a music sting.</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <Field label="What's it for?">
            <textarea
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm outline-none focus:border-white/30"
            />
          </Field>
          <Field label="Trailer type">
            <Chips options={TYPES} value={type} set={setType} />
          </Field>
          <Field label="Length">
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <Chip key={d} active={seconds === d} onClick={() => setSeconds(d)}>{d}s</Chip>
              ))}
            </div>
          </Field>
          <Field label="Music">
            <Chips options={MUSIC} value={music} set={setMusic} />
          </Field>
          <Field label="Voiceover">
            <Chips options={VO} value={vo} set={setVo} />
          </Field>

          <div className="flex gap-2">
            <button
              onClick={onCreate}
              disabled={running}
              className="flex-1 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {running ? "Cutting…" : "Cut trailer"}
            </button>
            <button onClick={reset} className="rounded-lg border border-white/15 px-4 py-2.5 text-sm hover:bg-white/5">Reset</button>
          </div>
        </aside>

        <RunPanel
          state={state}
          stageLabels={STAGE_LABELS}
          readyTitle="Trailer ready"
          emptyHint={
            <div>
              <p className="text-sm">Set the type, length and tone, then press <span className="text-white/70">Cut trailer</span>.</p>
              <p className="mt-1 text-xs">Beats, voiceover and a sting — sized to drop straight into a feed.</p>
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
function Chips({ options, value, set }: { options: string[]; value: string; set: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o} active={value === o} onClick={() => set(o)}>{o}</Chip>
      ))}
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
