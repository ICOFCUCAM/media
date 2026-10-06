"use client";

import { useMemo, useState, type ReactNode } from "react";
import { estimateMs, fmtDuration, MODELS, modelAllowed } from "../lib/system";
import type { ProjectStatus } from "../lib/demo";
import { useCreateRun } from "../lib/useCreateRun";
import { useAuth } from "./AuthProvider";
import { MAX_FILM_SEC, RESOLUTIONS, DEFAULT_RES, resolutionAllowed, type Resolution } from "../lib/plans";
import { RunPanel } from "./RunPanel";
import type { ShortPlatform } from "../lib/products";
import { Pipeline, type PipelineStep } from "./cf/Pipeline";
import { ActionBand, Cell, Control, PageHeader, SpecList, Split } from "./cf/primitives";

const STAGE_LABEL: Record<ProjectStatus, string> = {
  PLANNING: "Writing",
  GENERATING: "Filming",
  RENDERING: "Editing",
  READY: "Ready",
};

export interface CreateStudioProps {
  kind: "film" | "series" | "trailer" | "shorts" | "advert";
  heading: ReactNode;
  blurb: string;
  durations: { label: string; value: number }[];
  defaultSeconds: number;
  defaultPrompt: string;
  /** Vertical platform presets — only the Shorts studio passes these. */
  platforms?: ShortPlatform[];
  cta?: string;
  /** Production label for the specification (e.g. "Documentary"); defaults from kind. */
  production?: string;
  /** Replaces the default page header when the studio is not embedded. */
  header?: ReactNode;
  /** Render without the outer container/header (when nested under a workspace). */
  embedded?: boolean;
}

/** The six departments every run passes through, and the run status that owns each. */
const PIPELINE: PipelineStep[] = [
  { name: "Screenplay", at: "PLANNING" },
  { name: "Characters", at: "PLANNING" },
  { name: "Worlds & locations", at: "PLANNING" },
  { name: "Scene generation", at: "GENERATING" },
  { name: "Sound & score", at: "RENDERING" },
  { name: "Final cut", at: "RENDERING" },
];

const KIND_LABEL: Record<CreateStudioProps["kind"], string> = {
  film: "Film",
  series: "Series",
  trailer: "Trailer",
  shorts: "Shorts",
  advert: "Advert",
};

/**
 * The creator's create-and-watch surface (docs/design/create-film.html: the
 * production grid). One brief becomes a finished cut. The same component
 * powers Film, Series, Trailer, Shorts and Advert — only the presets and copy
 * change. Runs through the shared runner (real worker pipeline when signed
 * in, loudly-labelled preview otherwise) and renders the shared console.
 */
export function CreateStudio(props: CreateStudioProps) {
  const [prompt, setPrompt] = useState(props.defaultPrompt);
  const [seconds, setSeconds] = useState(props.defaultSeconds);
  const [platform, setPlatform] = useState(props.platforms?.[0]?.id ?? "");
  const [modelId, setModelId] = useState("wan-2.1");
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const { state, running, run, reset } = useCreateRun();
  const { profile } = useAuth();

  // Admins may pick any model; otherwise the user's tier decides. Profile loads
  // async, so default to the FREE allowance until it arrives.
  const tier = profile?.tier ?? "FREE";
  const isAdmin = profile?.role === "ADMIN";
  const maxSec = isAdmin ? Number.MAX_SAFE_INTEGER : MAX_FILM_SEC[tier];
  // Format: defaults to the tier's default once the profile loads. 4K is
  // never a default anywhere — always an explicit choice (it's the priciest
  // unit). Higher tiers may still pick anything down to 480p drafts.
  const effectiveRes: Resolution = resolution ?? (isAdmin ? "1080p" : DEFAULT_RES[tier]);
  const resAllowed = (r: Resolution) => isAdmin || resolutionAllowed(r, tier);

  // Never offer or run more than the plan allows (the worker clamps anyway).
  // When the ceiling sits below every preset (Free on Create Film), the
  // ceiling itself becomes the option.
  const durations =
    maxSec < Math.min(...props.durations.map((d) => d.value))
      ? [{ label: `${fmtDuration(maxSec)} · plan max`, value: maxSec }, ...props.durations]
      : props.durations;
  const allowedMax = Math.max(...durations.filter((d) => d.value <= maxSec).map((d) => d.value));
  const effSeconds = seconds <= maxSec ? seconds : allowedMax;

  const estMs = useMemo(() => estimateMs(modelId, effSeconds), [modelId, effSeconds]);
  // One serialized GPU: wall-clock ≈ total GPU time + assembly overhead.
  const readyEstimate = fmtDuration(Math.round(estMs / 1000) + 60);
  const model = MODELS.find((m) => m.id === modelId);
  const quality = model?.klass === "premium" ? "Cinematic" : "Standard";
  const production = props.production ?? KIND_LABEL[props.kind];
  const noun = production.toLowerCase();

  function onCreate() {
    void run({ prompt, modelId, targetSeconds: effSeconds, resolution: effectiveRes });
  }

  const body = (
    <>
      <Split>
        <Cell className="lg:min-h-[600px]">
          <div className="cf-label">Creative direction</div>
          <h2 className="cf-display mt-9 text-[clamp(32px,3.4vw,45px)] leading-none">Start with the story.</h2>
          <p className="mt-3 max-w-[600px] text-[13px] leading-[1.7] text-cf-muted">
            Describe the {noun} you want to make. Cineforge translates the direction into screenplay, cast,
            locations, scenes, score and the final cut.
          </p>

          <label htmlFor={`brief-${props.kind}`} className="mb-2.5 mt-11 block font-mono text-[9px] uppercase tracking-[0.1em]">
            What do you want to make?
          </label>
          <textarea
            id={`brief-${props.kind}`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            className="cf-input min-h-[170px] resize-y p-5 leading-[1.7]"
          />

          <div className="mt-8">
            {props.platforms && (
              <Control name="Placement" value={props.platforms.find((p) => p.id === platform)?.aspect}>
                <div className="flex flex-wrap gap-1.5">
                  {props.platforms.map((p) => (
                    <button key={p.id} type="button" className="cf-option" aria-pressed={platform === p.id} onClick={() => setPlatform(p.id)}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </Control>
            )}

            <Control name={props.kind === "series" ? "Total runtime" : "Length"} value={fmtDuration(effSeconds)}>
              <div className="flex flex-wrap gap-1.5">
                {durations.map((d) => {
                  const locked = d.value > maxSec;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      className="cf-option"
                      aria-pressed={effSeconds === d.value}
                      disabled={locked}
                      title={locked ? "Longer productions need a higher plan — see Plans & Credits" : undefined}
                      onClick={() => setSeconds(d.value)}
                    >
                      {d.label}
                      {locked && <span className="sr-only"> (needs a higher plan)</span>}
                    </button>
                  );
                })}
              </div>
              {maxSec < Math.max(...durations.map((d) => d.value)) && (
                <p className="cf-label mt-2.5 leading-relaxed">
                  Your {isAdmin ? "" : tier.toLowerCase() + " "}plan runs up to {fmtDuration(maxSec)} — longer lengths open on higher plans.
                </p>
              )}
            </Control>

            <Control name="Quality" value={quality}>
              <div className="flex flex-wrap gap-1.5">
                {MODELS.map((m) => {
                  const allowed = isAdmin || modelAllowed(m.id, tier);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="cf-option"
                      aria-pressed={modelId === m.id}
                      disabled={!allowed}
                      title={allowed ? undefined : "The cinematic engine is part of the Studio plan"}
                      onClick={() => setModelId(m.id)}
                    >
                      {m.klass === "premium" ? "Cinematic" : "Standard"} · {m.name}
                      {!allowed && <span className="ml-1.5 opacity-70">— Studio</span>}
                    </button>
                  );
                })}
              </div>
            </Control>

            <Control name="Master format" value={RESOLUTIONS.find((r) => r.id === effectiveRes)?.label}>
              <div className="flex flex-wrap gap-1.5">
                {RESOLUTIONS.map((r) => {
                  const locked = !resAllowed(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="cf-option"
                      aria-pressed={effectiveRes === r.id}
                      disabled={locked}
                      title={locked ? `${r.label} needs a higher plan — see Plans & Credits` : r.note}
                      onClick={() => setResolution(r.id)}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </Control>
          </div>
        </Cell>

        <Cell className="lg:min-h-[600px]">
          <div className="cf-label">Production specification</div>
          <h2 className="cf-display mb-6 mt-9 text-[30px] leading-none">The production plan.</h2>
          <SpecList
            rows={[
              ["Production", production],
              ["Runtime", fmtDuration(effSeconds)],
              ["Quality", `${quality} · ${model?.name ?? modelId}`],
              ["Format", effectiveRes],
              ...(props.platforms ? ([["Aspect", props.platforms.find((p) => p.id === platform)?.aspect ?? "16:9"]] as [string, string][]) : []),
              ["Ready in", `~${readyEstimate}`],
              ["Plan", isAdmin ? "Admin" : tier],
            ]}
          />
          <div className="mt-10">
            <Pipeline steps={PIPELINE} status={state?.status} />
          </div>
        </Cell>
      </Split>

      <section className="mt-14 border-t border-cf-fg" aria-label="Production preview">
        <div className="flex items-center justify-between border-b border-cf-line py-4">
          <span className="cf-label text-cf-fg">Production preview</span>
          <span className="cf-label">{state ? (state.live ? "Live production" : "Preview simulation") : "Waiting for direction"}</span>
        </div>
        <div className={state ? "pt-8" : ""}>
          <RunPanel state={state} stageLabels={STAGE_LABEL} readyTitle="Your cut is ready" emptyHint={<EmptyHint noun={noun} />} />
        </div>
        {state && (state.characters.length > 0 || state.locations.length > 0) && (
          <div className="mt-10">
            <div className="cf-label mb-3">Production bible</div>
            <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2">
              {state.characters.map((c) => (
                <BibleCard key={c.name} kind="Cast" name={c.name} desc={c.appearance} />
              ))}
              {state.locations.map((l) => (
                <BibleCard key={l.name} kind="Location" name={l.name} desc={l.description} />
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="mt-14">
        <ActionBand
          title={<>Ready to make the <em>{noun}?</em></>}
          copy={
            state?.live
              ? "Live — the studio is doing the real work. Progress is saved to Projects."
              : "Your direction becomes the production brief. Sign in to run the real studio; otherwise this previews the flow."
          }
        >
          <button type="button" onClick={reset} className="cf-btn border border-white/20 text-cf-on-inverse hover:border-white/50">
            Reset
          </button>
          <button type="button" onClick={onCreate} disabled={running || !prompt.trim()} className="cf-btn-accent">
            {running ? "In production…" : props.cta ?? "Create"}
          </button>
        </ActionBand>
      </div>
    </>
  );

  if (props.embedded) return body;
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      {props.header ?? (
        <PageHeader eyebrow={`${production} production / 01`} title={props.heading} copy={<p>{props.blurb}</p>} status={{ label: `${production} studio ready` }} />
      )}
      <div className="pt-12">{body}</div>
    </div>
  );
}

/* ── small UI bits ──────────────────────────────────────────── */
function BibleCard({ kind, name, desc }: { kind: string; name: string; desc: string }) {
  return (
    <div className="bg-cf-bg p-5">
      <div className="cf-label">{kind}</div>
      <div className="mt-3 font-serif text-[20px] leading-tight">{name}</div>
      <div className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-cf-muted">{desc}</div>
    </div>
  );
}
function EmptyHint({ noun }: { noun: string }) {
  return (
    <div>
      <p className="cf-display text-[clamp(38px,5vw,62px)] leading-none">Your {noun} begins here.</p>
      <p className="cf-label mt-3">Describe it above · then enter production</p>
    </div>
  );
}
