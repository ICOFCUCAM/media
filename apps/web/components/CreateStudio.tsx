"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { estimateMs, fmtDuration, MODELS, modelAllowed, planScenes, planShots } from "../lib/system";
import type { ProjectStatus } from "../lib/demo";
import { useCreateRun } from "../lib/useCreateRun";
import { useAuth } from "./AuthProvider";
import { MAX_FILM_SEC, RESOLUTIONS, DEFAULT_RES, resolutionAllowed, type Resolution } from "../lib/plans";
import { RunPanel } from "./RunPanel";
import type { ShortPlatform } from "../lib/products";
import { Chips, ExampleShelf, Field, StudioFooter, StudioGrid, StudioPage, UnlockRow, type Example } from "./cf/StudioLayout";
import { NotifyToggle } from "./cf/NotifyToggle";
import { ClockIcon, ConfigCard, EngineIcon, FormatIcon } from "./cf/ConfigCard";
import { offeredFormats, useCapabilities, videoAvailable } from "../lib/truth";

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
  /** One-tap starting briefs; defaults by kind. */
  examples?: Example[];
  /** Render without the outer container/header (when nested under a workspace). */
  embedded?: boolean;
}

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

  // Hand-off from another studio (Ads Studio → /create/advert?brief=&seconds=&aspect=):
  // start from that brief, length and format instead of the defaults.
  const handoffRead = useRef(false);
  useEffect(() => {
    if (handoffRead.current) return; // once, on arrival — never over the user's edits
    handoffRead.current = true;
    const q = new URLSearchParams(window.location.search);
    const b = q.get("brief");
    if (b) setPrompt(b.slice(0, 4000));
    const sec = Number(q.get("seconds"));
    if (sec && props.durations.some((d) => d.value === sec)) setSeconds(sec);
    const a = q.get("aspect");
    const p = a ? props.platforms?.find((x) => x.aspect === a) : undefined;
    if (p) setPlatform(p.id);
  }, [props.durations, props.platforms]);
  const { profile } = useAuth();

  // Admins may pick any model; otherwise the user's tier decides. Profile loads
  // async, so default to the FREE allowance until it arrives.
  const tier = profile?.tier ?? "FREE";
  const isAdmin = profile?.role === "ADMIN";
  const maxSec = isAdmin ? Number.MAX_SAFE_INTEGER : MAX_FILM_SEC[tier];
  // Format: defaults to the tier's default once the profile loads. 4K is
  // never a default anywhere — always an explicit choice (it's the priciest
  // unit). Higher tiers may still pick anything down to 480p drafts.
  // DOS-78: offer only what the GPU actually produces now (live registry);
  // until the registry is published the options are marked unverified.
  const caps = useCapabilities();
  const realFormats = offeredFormats(caps);
  const gpuReal = videoAvailable(caps);
  const resReal = (r: Resolution) => realFormats === null || realFormats.length === 0 || realFormats.includes(r);
  const resAllowed = (r: Resolution) => (isAdmin || resolutionAllowed(r, tier)) && resReal(r);
  const planRes: Resolution = resolution ?? (isAdmin ? "1080p" : DEFAULT_RES[tier]);
  const realPlanFormats = RESOLUTIONS.filter((r) => resAllowed(r.id));
  const effectiveRes: Resolution = resAllowed(planRes) ? planRes : (realPlanFormats[realPlanFormats.length - 1]?.id ?? planRes);

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
    void run({ prompt, modelId, targetSeconds: effSeconds, resolution: effectiveRes, aspectRatio: aspect });
    // Phones: the preview sits under the options — bring it into view.
    if (window.innerWidth < 1024) document.getElementById("studio-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Plan-aware options: offer only what this plan can run, then one line
  // naming what a higher plan adds (instead of a wall of locked buttons).
  const runnable = durations.filter((d) => d.value <= maxSec);
  const formats = RESOLUTIONS.filter((r) => resAllowed(r.id));
  const models = MODELS.filter((m) => isAdmin || modelAllowed(m.id, tier));
  const unlocks = [
    ...(runnable.length < durations.length ? [`up to ${durations[durations.length - 1]!.label} runtimes`] : []),
    // Only what a higher PLAN adds — formats the GPU can't produce are not an upsell.
    ...(RESOLUTIONS.some((r) => !(isAdmin || resolutionAllowed(r.id, tier)))
      ? [RESOLUTIONS.filter((r) => !(isAdmin || resolutionAllowed(r.id, tier))).map((r) => r.label).join(" / ")]
      : []),
    ...(models.length < MODELS.length ? ["the cinematic engine"] : []),
  ];
  const examples = props.examples ?? EXAMPLES[props.kind] ?? [];
  const aspect = props.platforms?.find((p) => p.id === platform)?.aspect ?? "16:9";
  const resRange = formats.length > 1 ? `${RES_SHORT[formats[0]!.id]}–${RES_SHORT[formats[formats.length - 1]!.id]}` : RES_SHORT[formats[0]?.id ?? effectiveRes];

  const controls = (
    <>
      {examples.length > 0 && <ExampleShelf examples={examples} value={prompt} onPick={setPrompt} />}

      <Field label={`Describe your ${noun}`} htmlFor={`brief-${props.kind}`}>
        <textarea
          id={`brief-${props.kind}`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="cf-input min-h-[92px] resize-y leading-[1.6]"
        />
      </Field>

      {props.platforms && (
        <Field label="Placement" value={props.platforms.find((p) => p.id === platform)?.aspect}>
          <Chips>
            {props.platforms.map((p) => (
              <button key={p.id} type="button" className="cf-option" aria-pressed={platform === p.id} onClick={() => setPlatform(p.id)}>
                {p.name}
              </button>
            ))}
          </Chips>
        </Field>
      )}

      <Field label="Configure">
        <div className="cf-config-host">
          <div className="cf-config-grid">
            <ConfigCard
              tone="length"
              icon={<ClockIcon />}
              label={props.kind === "series" ? "Total runtime" : "Length"}
              main={fmtLong(effSeconds)}
              secondary={
                runnable.length < durations.length
                  ? effSeconds === allowedMax
                    ? "Maximum for your plan"
                    : `Up to ${fmtLong(allowedMax)} on your plan`
                  : "Final runtime"
              }
              meta={`${planScenes(effSeconds)} scenes · ${planShots(effSeconds)} shots`}
              options={runnable.map((d) => ({ value: String(d.value), label: d.label }))}
              value={String(effSeconds)}
              onChange={(v) => setSeconds(Number(v))}
              hint={runnable.length === 1 ? "Longer lengths open on higher plans" : undefined}
            />
            <ConfigCard
              tone="engine"
              icon={<EngineIcon />}
              label="Quality & engine"
              main={quality}
              secondary={engineLine(model?.name ?? modelId)}
              meta={`${quality === "Cinematic" ? "Cinematic motion" : "Fast production"} · ${resRange}`}
              options={models.map((m) => ({ value: m.id, label: `${m.klass === "premium" ? "Cinematic" : "Standard"} — ${m.name}` }))}
              value={modelId}
              onChange={setModelId}
              hint={models.length === 1 ? "The cinematic engine is part of the Studio plan" : undefined}
            />
            <ConfigCard
              tone="format"
              icon={<FormatIcon />}
              label="Format"
              main={RES_SHORT[effectiveRes]}
              secondary={RES_QUALITY[effectiveRes]}
              meta={`MP4 · ${aspect}`}
              options={formats.map((r) => ({ value: r.id, label: `${r.label} — ${r.note}` }))}
              value={effectiveRes}
              onChange={(v) => setResolution(v as Resolution)}
              hint={
                realFormats === null
                  ? "Formats not yet verified on the GPU"
                  : RESOLUTIONS.some((r) => !resReal(r.id) && (isAdmin || resolutionAllowed(r.id, tier)))
                    ? "Higher formats aren't available on the current GPU"
                    : formats.length === 1
                      ? "Higher formats open on higher plans"
                      : undefined
              }
            />
          </div>
        </div>
      </Field>

      <UnlockRow plan={isAdmin ? "Admin" : tier.charAt(0) + tier.slice(1).toLowerCase()} items={unlocks} />
    </>
  );

  const footer = (
    <StudioFooter
      rows={[
        ["Final runtime", fmtDuration(effSeconds)],
        ["Ready in", `~${readyEstimate}`],
      ]}
      note={
        gpuReal === false ? (
          <span className="text-[12px] leading-relaxed text-cf-warn">
            Video generation isn&apos;t available right now — a production started now will stop with the reason, not deliver a stand-in.
          </span>
        ) : (
          <NotifyToggle state={state} />
        )
      }
    >
      <button type="button" onClick={onCreate} disabled={running || !prompt.trim()} className="cf-btn-accent flex-1">
        {running ? "In production…" : props.cta ?? "Create"}
      </button>
      <button type="button" onClick={reset} className="cf-btn-line">
        Reset
      </button>
    </StudioFooter>
  );

  const preview = (
    <section aria-label="Production preview" className={state ? "" : "lg:h-full"}>
      <RunPanel state={state} stageLabels={STAGE_LABEL} readyTitle="Your cut is ready" artSeed={prompt} fill emptyHint={<EmptyHint noun={noun} />} />
      {state && (state.characters.length > 0 || state.locations.length > 0) && (
        <div className="mt-6">
          <div className="cf-label mb-3">Production bible</div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-cf-line bg-cf-line sm:grid-cols-2">
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
  );

  const body = <StudioGrid controls={controls} footer={footer} preview={preview} />;

  if (props.embedded) return body;
  return (
    <StudioPage
      title={props.heading}
      subtitle={props.blurb}
      badge={state?.live ? { tone: "live", label: "Live · saved to Projects" } : { tone: "warn", label: "Preview" }}
    >
      {body}
    </StudioPage>
  );
}

/* ── small UI bits ──────────────────────────────────────────── */
function BibleCard({ kind, name, desc }: { kind: string; name: string; desc: string }) {
  return (
    <div className="bg-cf-bg p-5">
      <div className="cf-label">{kind}</div>
      <div className="mt-3 font-display font-semibold text-[20px] leading-tight">{name}</div>
      <div className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-cf-muted">{desc}</div>
    </div>
  );
}
function EmptyHint({ noun }: { noun: string }) {
  return (
    <div>
      <p className="cf-display text-[clamp(32px,4vw,52px)] leading-none">Your {noun} begins here.</p>
      <p className="mt-3 text-[14px] text-white/80">Describe it, then press Create.</p>
    </div>
  );
}

/** Starting briefs per studio — one tap fills the brief. */
const EXAMPLES: Partial<Record<CreateStudioProps["kind"], Example[]>> = {
  film: [
    { title: "Kingdom epic", tags: "Epic · Historical · Drama", brief: "An epic about an African kingdom fighting for its independence, told over three generations." },
    { title: "Neon noir", tags: "Thriller · Sci-Fi · Urban", brief: "A neon-noir detective story in a rain-soaked megacity, where a missing hologram singer holds the key to a conspiracy." },
    { title: "Ocean voyage", tags: "Adventure · Drama", brief: "Two sisters sail a wooden boat across the ocean to find the island their grandmother described in her letters." },
    { title: "Savannah drought", tags: "Documentary · Nature", brief: "A documentary-style story of a savannah village and its herd surviving the longest drought in living memory." },
    { title: "Space station", tags: "Sci-Fi · Thriller", brief: "A sci-fi thriller aboard a failing space station, where the last engineer must choose who boards the only escape pod." },
  ],
  advert: [
    { title: "Product launch", tags: "Tech · Launch spot", brief: "A 15-second launch spot for wireless earbuds: night city, bass drop, slow-motion reveal, end on the logo and 'Hear everything.'" },
    { title: "Food delivery", tags: "Lifestyle · Warm", brief: "A warm 15-second advert for a food delivery app: family dinner arrives in the rain, smiles, end card 'Dinner, sorted.'" },
    { title: "Fitness app", tags: "Sport · Energetic", brief: "An energetic 15-second ad for a fitness app: sunrise runs, quick cuts, coach voiceover, end on 'Start today.'" },
    { title: "Coffee brand", tags: "Lifestyle · Cosy", brief: "A cosy 15-second coffee advert: morning light, steam, a sleepy studio waking up, end card 'Your first good idea.'" },
  ],
};

/* ── card copy helpers ──────────────────────────────────────── */
/** "30 seconds", "2 minutes", "1 min 30 s". */
function fmtLong(sec: number): string {
  if (sec < 60) return `${sec} seconds`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s) return `${m} min ${s} s`;
  return m === 1 ? "1 minute" : `${m} minutes`;
}

/** "Wan 2.1 · own GPU" → "Wan 2.1 · GPU rendering"; cloud engines say so. */
function engineLine(name: string): string {
  const [engine, host] = name.split(" · ");
  return `${engine} · ${host?.includes("GPU") ? "GPU rendering" : "cloud rendering"}`;
}

const RES_SHORT: Record<Resolution, string> = { "480p": "480p", "720p": "720p", "1080p": "1080p", "4k": "4K" };
const RES_QUALITY: Record<Resolution, string> = {
  "480p": "Draft quality",
  "720p": "HD quality",
  "1080p": "Full HD master",
  "4k": "4K upscaled master",
};
