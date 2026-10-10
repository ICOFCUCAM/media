"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import { RunPanel } from "./RunPanel";
import { NotifyToggle } from "./cf/NotifyToggle";
import { StudioGate } from "./cf/StudioGate";
import { Chips, ExampleShelf, Field, StudioFooter, StudioGrid, StudioPage, StudioTabs, UnlockRow } from "./cf/StudioLayout";
import type { ProjectStatus } from "../lib/demo";
import { useCreateRun } from "../lib/useCreateRun";
import { usePlan } from "../lib/usePlan";
import { estimateMs, fmtDuration, fmtMs } from "../lib/system";
import { listUsableVoices } from "../lib/library";
import {
  ANIMATION_STYLES,
  KIND_PROFILES,
  SEASON_MAX_NUMBER,
  STYLE_PROFILES,
  isStillMotion,
  type AnimationStyle,
  type ProductionKind,
  type ProductionSpec,
} from "../lib/production-types";
import {
  cardIssues,
  createCard,
  createShow,
  currentSeason,
  listCards,
  listShows,
  nextEpisodeNumber,
  requestPortrait,
  saveBible,
  seasonsOf,
  setShowCast,
  type BibleInput,
  type CardInput,
  type CardRow,
  type Show,
} from "../lib/animation";
import { signedUrl } from "../lib/storyboard";

/**
 * CineForge Animation Studio (W12; Part 5 §185). The CREATE menu's animated
 * work in one workspace: a cartoon, a short, a story told by a narrator, a
 * motion comic, the next episode of a show, or a reusable character. It is
 * not a separate product — every tab makes a production with the same
 * engines (§186), told how to work together: what is being made, in which
 * style, with which Character Cards, under which Show Bible.
 */

export type Make = "cartoon" | "short" | "story" | "motion_comic" | "episode" | "character";

export const MAKES: { id: Make; label: string }[] = [
  { id: "cartoon", label: "Cartoon" },
  { id: "short", label: "Short film" },
  { id: "story", label: "Story" },
  { id: "motion_comic", label: "Motion comic" },
  { id: "episode", label: "Episode" },
  { id: "character", label: "Character" },
];

/** What each tab makes (Cartoon = an animated film). */
const KIND_OF: Record<Exclude<Make, "character">, ProductionKind> = {
  cartoon: "film",
  short: "short_film",
  story: "story",
  motion_comic: "motion_comic",
  episode: "episode",
};

const DEFAULT_STYLE: Record<Exclude<Make, "character">, AnimationStyle> = {
  cartoon: "2d_tv",
  short: "3d_stylized",
  story: "storybook",
  motion_comic: "motion_comic",
  episode: "2d_tv",
};

/** Styles a tab offers (the motion-comic look belongs to Motion Comic). */
const stylesFor = (m: Exclude<Make, "character">): AnimationStyle[] =>
  m === "motion_comic" ? ["motion_comic"] : ANIMATION_STYLES.filter((s) => s !== "motion_comic");

const LENGTHS: Record<Exclude<Make, "character">, number[]> = {
  cartoon: [300, 600, 1200, 2700, 5400],
  short: [30, 60, 180, 600, 1200],
  story: [60, 180, 300, 600],
  motion_comic: [60, 120, 300, 600],
  episode: [300, 600, 1200, 1800],
};

const STAGES: Record<ProjectStatus, string> = {
  PLANNING: "Story, characters, world",
  GENERATING: "Drawing and animating",
  RENDERING: "Voices, music, edit",
  READY: "Ready",
};

const EXAMPLES = [
  { title: "The talking moon", tags: "Story · Children", brief: "A young boy discovers that the moon talks to him every night." },
  { title: "Kito's map", tags: "Cartoon · Adventure", brief: "Kito, a curious 12-year-old, finds a map that redraws itself whenever he lies." },
  { title: "Rooftop heist", tags: "Motion comic · Action", brief: "Two rival cat burglars must team up across the rooftops of a rain-soaked city." },
  { title: "Robot gardener", tags: "Short · Heartfelt", brief: "A rusty robot tends the last garden on a space station, waiting for someone to visit." },
];

function useMake(): [Make, (m: Make) => void] {
  const [make, setMakeState] = useState<Make>("cartoon");
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("make");
    if (m && MAKES.some((x) => x.id === m)) setMakeState(m as Make);
  }, []);
  const setMake = useCallback((m: Make) => {
    setMakeState(m);
    const u = new URL(window.location.href);
    u.searchParams.set("make", m);
    window.history.replaceState(null, "", u.toString());
  }, []);
  return [make, setMake];
}

export function AnimationStudio() {
  const [make, setMake] = useMake();
  const { user } = useAuth();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [castIds, setCastIds] = useState<string[]>([]);

  const reloadCards = useCallback(async () => {
    if (!user) return setCards([]);
    try {
      setCards(await listCards());
    } catch {
      setCards([]);
    }
  }, [user]);
  useEffect(() => void reloadCards(), [reloadCards]);

  const useCharacter = (id: string) => {
    setCastIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    if (make === "character") setMake("cartoon");
  };

  return (
    <StudioPage
      title="Animation Studio"
      subtitle="Cartoons, shorts, stories, motion comics and shows — with characters that stay themselves from one production to the next."
      tabs={<StudioTabs label="What are you making?" items={MAKES} value={make} onChange={setMake} />}
    >
      {make === "character" ? (
        <StudioGate signIn="Sign in to keep your characters" what="Character Cards">
          <CharacterRoom cards={cards} onCreated={reloadCards} onUse={useCharacter} castIds={castIds} />
        </StudioGate>
      ) : make === "episode" ? (
        <StudioGate signIn="Sign in to make a show" what="Shows">
          <EpisodeRoom cards={cards} />
        </StudioGate>
      ) : (
        <ProductionRoom key={make} make={make} cards={cards} castIds={castIds} setCastIds={setCastIds} />
      )}
    </StudioPage>
  );
}

/* ── Cartoon / Short / Story / Motion comic ─────────────────── */

function ProductionRoom({
  make,
  cards,
  castIds,
  setCastIds,
}: {
  make: Exclude<Make, "character" | "episode">;
  cards: CardRow[];
  castIds: string[];
  setCastIds: (ids: string[]) => void;
}) {
  const kind = KIND_OF[make];
  const profile = KIND_PROFILES[kind];
  // What the creator picked (a Cartoon is an animated film; the tab's name is what they make).
  const noun = MAKES.find((m) => m.id === make)!.label;
  const [brief, setBrief] = useState(EXAMPLES[0]!.brief);
  const [style, setStyle] = useState<AnimationStyle>(DEFAULT_STYLE[make]);
  const [seconds, setSeconds] = useState(profile.defaultSec);
  const { state, running, run, reset } = useCreateRun();
  const plan = usePlan();
  const lengths = LENGTHS[make].filter((s) => s >= profile.minSec && s <= profile.maxSec);
  const effSeconds = Math.min(seconds, plan.maxSec);
  const production: ProductionSpec = { kind, medium: "animation", animationStyle: style };
  const drawn = isStillMotion(production);
  const est = estimateMs("wan-2.1", effSeconds, { stillMotion: drawn });

  function onCreate() {
    void run({ prompt: brief, modelId: "wan-2.1", targetSeconds: effSeconds, production, castIds });
    if (window.innerWidth < 1024) document.getElementById("studio-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <StudioGrid
      controls={
        <>
          <ExampleShelf examples={EXAMPLES} value={brief} onPick={setBrief} />
          <Field label={make === "story" ? "The story — a sentence is enough" : "Brief"} htmlFor="anim-brief">
            <textarea id="anim-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} className="cf-input min-h-[96px] resize-y leading-[1.6]" />
          </Field>

          <Field label="Style" value={STYLE_PROFILES[style].label}>
            <Chips>
              {stylesFor(make).map((id) => (
                <button key={id} type="button" className="cf-option" aria-pressed={style === id} onClick={() => setStyle(id)}>
                  {STYLE_PROFILES[id].label}
                </button>
              ))}
            </Chips>
            <p className="mt-2 text-[12px] leading-snug text-cf-muted">
              {STYLE_PROFILES[style].look}.{" "}
              {drawn ? "Drawn pages or panels brought to life by the camera — no video model, a fraction of the cost." : STYLE_PROFILES[style].motion + "."}
            </p>
          </Field>

          <Field label="Length" value={fmtDuration(effSeconds)}>
            <Chips>
              {lengths.map((s) => (
                <button key={s} type="button" className="cf-option" aria-pressed={seconds === s} onClick={() => setSeconds(s)} disabled={s > plan.maxSec}>
                  {fmtDuration(s)}
                </button>
              ))}
            </Chips>
          </Field>

          <CastPicker cards={cards} castIds={castIds} onChange={setCastIds} />
          <UnlockRow plan={plan.name} items={seconds > plan.maxSec ? [`${fmtDuration(seconds)} productions (this plan makes ${fmtDuration(plan.maxSec)})`] : []} />
        </>
      }
      footer={
        <StudioFooter
          rows={[
            ["Makes", `${noun} · ${STYLE_PROFILES[style].label}${profile.narrated ? " · narrated" : ""}`],
            ["Cast", castIds.length ? `${castIds.length} character${castIds.length === 1 ? "" : "s"}` : "the Director casts"],
            ["Estimate", drawn ? `${fmtMs(est)} · no GPU video` : fmtMs(est)],
          ]}
          note={<NotifyToggle state={state} />}
        >
          <button type="button" onClick={onCreate} disabled={running || !brief.trim()} className="cf-btn-accent flex-1">
            {running ? "In production…" : `Create ${noun.toLowerCase()}`}
          </button>
          <button type="button" onClick={reset} className="cf-btn-line">Reset</button>
        </StudioFooter>
      }
      preview={
        <RunPanel
          state={state}
          stageLabels={STAGES}
          readyTitle={`Your ${noun.toLowerCase()} is ready`}
          fill
          artSeed={brief}
          emptyHint={
            <div>
              <p className="cf-display text-[clamp(32px,4vw,52px)] leading-none">Idea → story → characters → world → animation.</p>
              <p className="mt-3 text-[14px] text-white/80">Voices, music, sound and the edit follow — every character keeps their look.</p>
            </div>
          }
        />
      }
    />
  );
}

/** "Use character" (§183): Character Cards cast into the production. */
function CastPicker({ cards, castIds, onChange }: { cards: CardRow[]; castIds: string[]; onChange: (ids: string[]) => void }) {
  if (!cards.length) {
    return (
      <Field label="Characters">
        <p className="text-[13px] text-cf-muted">
          No Character Cards yet. <a href="?make=character" className="underline">Create one</a> to reuse the same character across films, shorts and seasons.
        </p>
      </Field>
    );
  }
  const toggle = (id: string) => onChange(castIds.includes(id) ? castIds.filter((x) => x !== id) : [...castIds, id]);
  return (
    <Field label="Characters" value={castIds.length ? `${castIds.length} cast` : "optional"}>
      <Chips>
        {cards.map((c) => (
          <button key={c.id} type="button" className="cf-option" aria-pressed={castIds.includes(c.id)} onClick={() => toggle(c.id)}>
            {c.name}
          </button>
        ))}
      </Chips>
      <p className="mt-2 text-[12px] text-cf-muted">Cast characters appear exactly as their card says — face, proportions, colours, voice.</p>
    </Field>
  );
}

/* ── Character Cards ─────────────────────────────────────────── */

const EMPTY_CARD: CardInput = {
  name: "", appearance: "", age: null, gender: "", heightCm: null, hair: "", eyes: "", clothing: "", personality: "",
  animationStyle: null, design: { proportions: "", palette: "", movement: "" }, voiceId: null, voiceDescription: "",
};

function CharacterRoom({ cards, onCreated, onUse, castIds }: { cards: CardRow[]; onCreated: () => Promise<void>; onUse: (id: string) => void; castIds: string[] }) {
  const [card, setCard] = useState<CardInput>(EMPTY_CARD);
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => void listUsableVoices().then(setVoices).catch(() => setVoices([])), []);
  const issues = cardIssues(card);
  const set = (p: Partial<CardInput>) => setCard((c) => ({ ...c, ...p }));
  const setDesign = (p: Partial<NonNullable<CardInput["design"]>>) => setCard((c) => ({ ...c, design: { proportions: "", palette: "", movement: "", ...c.design, ...p } }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await createCard(card);
      setCard(EMPTY_CARD);
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(360px,36%)_minmax(0,1fr)]">
      <section className="space-y-4" aria-labelledby="card-new">
        <h2 id="card-new" className="cf-label">New Character Card</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="c-name"><input id="c-name" className="cf-input" value={card.name} onChange={(e) => set({ name: e.target.value })} placeholder="Kito" /></Field>
          <Field label="Age" htmlFor="c-age"><input id="c-age" className="cf-input" inputMode="numeric" value={card.age ?? ""} onChange={(e) => set({ age: num(e.target.value) })} placeholder="12" /></Field>
          <Field label="Height (cm)" htmlFor="c-h"><input id="c-h" className="cf-input" inputMode="numeric" value={card.heightCm ?? ""} onChange={(e) => set({ heightCm: num(e.target.value) })} placeholder="145" /></Field>
          <Field label="Gender" htmlFor="c-g"><input id="c-g" className="cf-input" value={card.gender ?? ""} onChange={(e) => set({ gender: e.target.value })} placeholder="boy" /></Field>
          <Field label="Hair" htmlFor="c-hair"><input id="c-hair" className="cf-input" value={card.hair ?? ""} onChange={(e) => set({ hair: e.target.value })} placeholder="Black" /></Field>
          <Field label="Eyes" htmlFor="c-eyes"><input id="c-eyes" className="cf-input" value={card.eyes ?? ""} onChange={(e) => set({ eyes: e.target.value })} placeholder="Brown" /></Field>
        </div>
        <Field label="Looks" htmlFor="c-look"><textarea id="c-look" className="cf-input min-h-[72px]" value={card.appearance} onChange={(e) => set({ appearance: e.target.value })} placeholder="Round face, gap-toothed grin, freckles" /></Field>
        <Field label="Clothing" htmlFor="c-cloth"><input id="c-cloth" className="cf-input" value={card.clothing ?? ""} onChange={(e) => set({ clothing: e.target.value })} placeholder="Blue jacket" /></Field>
        <Field label="Personality" htmlFor="c-pers"><input id="c-pers" className="cf-input" value={card.personality ?? ""} onChange={(e) => set({ personality: e.target.value })} placeholder="Curious" /></Field>
        <Field label="Style" value={card.animationStyle ? STYLE_PROFILES[card.animationStyle].label : "any"}>
          <Chips>
            <button type="button" className="cf-option" aria-pressed={!card.animationStyle} onClick={() => set({ animationStyle: null })}>Any</button>
            {ANIMATION_STYLES.map((s) => (
              <button key={s} type="button" className="cf-option" aria-pressed={card.animationStyle === s} onClick={() => set({ animationStyle: s })}>{STYLE_PROFILES[s].label}</button>
            ))}
          </Chips>
        </Field>
        <fieldset className="space-y-3 rounded-lg border border-cf-line p-3">
          <legend className="cf-label px-1">Animated design — keeps them the same character</legend>
          <Field label="Proportions" htmlFor="c-prop"><input id="c-prop" className="cf-input" value={card.design?.proportions ?? ""} onChange={(e) => setDesign({ proportions: e.target.value })} placeholder="Big head, short legs, round silhouette" /></Field>
          <Field label="Colours" htmlFor="c-pal"><input id="c-pal" className="cf-input" value={card.design?.palette ?? ""} onChange={(e) => setDesign({ palette: e.target.value })} placeholder="Skin warm brown, jacket #1e5aa8, sneakers red" /></Field>
          <Field label="Movement" htmlFor="c-mov"><input id="c-mov" className="cf-input" value={card.design?.movement ?? ""} onChange={(e) => setDesign({ movement: e.target.value })} placeholder="Bouncy, quick turns, hands always moving" /></Field>
        </fieldset>
        <Field label="Voice" value={card.voiceId ? voices.find((v) => v.id === card.voiceId)?.name : "described"}>
          <select className="cf-input" value={card.voiceId ?? ""} onChange={(e) => set({ voiceId: e.target.value || null })} aria-label="Voice from your Voice Studio">
            <option value="">No cloned voice — describe it</option>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input className="cf-input mt-2" value={card.voiceDescription ?? ""} onChange={(e) => set({ voiceDescription: e.target.value })} placeholder="Bright, quick, a little hoarse" aria-label="Voice description" />
        </Field>
        {error && <p className="text-[13px] text-cf-danger" role="alert">{error}</p>}
        {issues.length > 0 && card.name && <p className="text-[12px] text-cf-muted">{issues.join(" ")}</p>}
        <button type="button" className="cf-btn-accent w-full" onClick={save} disabled={busy || issues.length > 0}>
          {busy ? "Saving…" : "Save Character Card"}
        </button>
      </section>

      <section aria-labelledby="card-list">
        <h2 id="card-list" className="cf-label mb-3">Your characters</h2>
        {cards.length === 0 ? (
          <p className="text-[14px] text-cf-muted">Cards you save appear here — reuse them in films, shorts, stories and every season of a show.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => <CharacterCard key={c.id} card={c} voiceName={voices.find((v) => v.id === voiceIdOf(c))?.name} cast={castIds.includes(c.id)} onUse={() => onUse(c.id)} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

const voiceIdOf = (c: CardRow): string | null => {
  const p = c.voice_profile as { voiceId?: unknown } | null;
  return typeof p?.voiceId === "string" ? p.voiceId : null;
};

/** The Character Card (§183.1): who they are, their voice and style, and "Use character". */
export function CharacterCard({ card, voiceName, cast, onUse }: { card: CardRow; voiceName?: string; cast: boolean; onUse: () => void }) {
  const design = card.design as { proportions?: string; palette?: string; movement?: string } | null;
  // The card's portrait (W21): drawn by the image engine from the card itself.
  const [status, setStatus] = useState(card.portrait_status);
  const [portrait, setPortrait] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (card.portrait_key) void signedUrl(card.portrait_key).then((u) => live && setPortrait(u ?? null));
    return () => { live = false; };
  }, [card.portrait_key]);
  async function draw() {
    setPortraitError(null);
    try {
      await requestPortrait(card.id);
      setStatus("requested");
    } catch (e) {
      setPortraitError(e instanceof Error ? e.message : "Refused");
    }
  }
  const drawing = status === "requested" || status === "generating";
  const rows: [string, string | null][] = [
    ["Voice", voiceName ?? ((card.voice_profile as { description?: string } | null)?.description ?? null)],
    ["Style", card.animation_style ? STYLE_PROFILES[card.animation_style as AnimationStyle]?.label ?? card.animation_style : null],
    ["Age", card.age != null ? String(card.age) : null],
    ["Height", card.height_cm != null ? `${card.height_cm} cm` : null],
    ["Clothing", card.clothing],
    ["Personality", card.personality],
    ["Colours", design?.palette ?? null],
  ];
  return (
    <li className="flex flex-col rounded-lg border border-cf-line bg-cf-panel p-4">
      {portrait ? (
        /* Plain <img>: a signed, short-lived storage URL. */
        <img src={portrait} alt={`Portrait of ${card.name}`} className="mb-3 aspect-square w-full rounded object-cover" />
      ) : (
        <div className="mb-3 flex aspect-square w-full items-center justify-center rounded border border-dashed border-cf-line text-[12px] text-cf-muted">
          {drawing ? "Drawing the portrait…" : "No portrait yet"}
        </div>
      )}
      <p className="font-display text-[20px] font-semibold uppercase tracking-[0.02em]">{card.name}</p>
      <p className="mt-1 line-clamp-2 text-[13px] text-cf-muted">{card.appearance}</p>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-cf-muted">{k}</dt>
            <dd className="truncate text-cf-fg">{v}</dd>
          </div>
        ))}
      </dl>
      {(status === "failed" && card.portrait_error) || portraitError ? (
        <p role="alert" className="mt-2 text-[12px] text-cf-danger">{portraitError ?? card.portrait_error}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={cast ? "cf-btn-line" : "cf-btn-accent"} onClick={onUse} aria-pressed={cast}>
          {cast ? "Cast ✓" : "Use character"}
        </button>
        <button type="button" className="cf-btn-line" onClick={() => void draw()} disabled={drawing}>
          {drawing ? "Drawing…" : portrait ? "Redraw portrait" : "Draw portrait"}
        </button>
      </div>
    </li>
  );
}

/* ── Shows and episodes ─────────────────────────────────────── */

const EMPTY_BIBLE: BibleInput = { genre: "", audience: "", worldRules: "", locations: "", musicIdentity: "", narrativeRules: "", episodeFormat: "", continuityRules: "" };
const BIBLE_FIELDS: { key: keyof BibleInput; label: string; hint: string }[] = [
  { key: "genre", label: "Genre", hint: "Comedy adventure" },
  { key: "audience", label: "Target audience", hint: "Children 6–10" },
  { key: "worldRules", label: "World rules", hint: "The moon can talk, but only to children" },
  { key: "locations", label: "Locations", hint: "Kito's village, the hill, the lighthouse" },
  { key: "musicIdentity", label: "Music identity", hint: "Ukulele theme, warm strings" },
  { key: "narrativeRules", label: "Narrative rules", hint: "Every episode teaches one kindness" },
  { key: "episodeFormat", label: "Episode format", hint: "Cold open, two acts, a tag" },
  { key: "continuityRules", label: "Continuity rules", hint: "Kito never takes off the blue jacket" },
];

const bibleOf = (s: Show): BibleInput => ({
  genre: s.bible?.genre ?? "", audience: s.bible?.audience ?? "", worldRules: s.bible?.world_rules ?? "", locations: s.bible?.locations ?? "",
  musicIdentity: s.bible?.music_identity ?? "", narrativeRules: s.bible?.narrative_rules ?? "", episodeFormat: s.bible?.episode_format ?? "",
  continuityRules: s.bible?.continuity_rules ?? "",
});

function EpisodeRoom({ cards }: { cards: CardRow[] }) {
  const [shows, setShows] = useState<Show[] | null>(null);
  const [showId, setShowId] = useState<string | "new">("new");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await listShows();
      setShows(list);
      setShowId((cur) => (cur !== "new" && list.some((s) => s.seriesId === cur) ? cur : list[0]?.seriesId ?? "new"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setShows([]);
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  const show = shows?.find((s) => s.seriesId === showId) ?? null;
  if (shows === null) return <p className="cf-label py-10">Opening your shows…</p>;

  return (
    <div className="space-y-4">
      <Chips>
        {shows.map((s) => (
          <button key={s.seriesId} type="button" className="cf-option" aria-pressed={s.seriesId === showId} onClick={() => setShowId(s.seriesId)}>
            {s.title}
          </button>
        ))}
        <button type="button" className="cf-option" aria-pressed={showId === "new"} onClick={() => setShowId("new")}>+ New show</button>
      </Chips>
      {error && <p className="text-[13px] text-cf-danger" role="alert">{error}</p>}
      {show ? (
        <ShowRoom key={show.seriesId} show={show} cards={cards} onChanged={reload} />
      ) : (
        <NewShow cards={cards} onCreated={async (id) => { await reload(); setShowId(id); }} />
      )}
    </div>
  );
}

function BibleFields({ value, onChange }: { value: BibleInput; onChange: (b: BibleInput) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BIBLE_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`bible-${f.key}`}>
          <input id={`bible-${f.key}`} className="cf-input" value={value[f.key] ?? ""} placeholder={f.hint} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} />
        </Field>
      ))}
    </div>
  );
}

function NewShow({ cards, onCreated }: { cards: CardRow[]; onCreated: (seriesId: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [style, setStyle] = useState<AnimationStyle>("2d_tv");
  const [bible, setBible] = useState<BibleInput>(EMPTY_BIBLE);
  const [castIds, setCastIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await onCreated(await createShow({ title, synopsis, animationStyle: style, bible, castIds }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-4xl space-y-4" aria-labelledby="show-new">
      <h2 id="show-new" className="cf-label">Show Bible — the show every episode follows</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="show-title"><input id="show-title" className="cf-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kito and the Moon" /></Field>
        <Field label="Premise" htmlFor="show-syn"><input id="show-syn" className="cf-input" value={synopsis} onChange={(e) => setSynopsis(e.target.value)} placeholder="A boy, a talking moon, a village full of secrets" /></Field>
      </div>
      <Field label="Visual style" value={STYLE_PROFILES[style].label}>
        <Chips>
          {ANIMATION_STYLES.map((s) => (
            <button key={s} type="button" className="cf-option" aria-pressed={style === s} onClick={() => setStyle(s)}>{STYLE_PROFILES[s].label}</button>
          ))}
        </Chips>
      </Field>
      <BibleFields value={bible} onChange={setBible} />
      <CastPicker cards={cards} castIds={castIds} onChange={setCastIds} />
      {error && <p className="text-[13px] text-cf-danger" role="alert">{error}</p>}
      <button type="button" className="cf-btn-accent" onClick={create} disabled={busy || !title.trim()}>
        {busy ? "Creating…" : "Create show"}
      </button>
    </section>
  );
}

function ShowRoom({ show, cards, onChanged }: { show: Show; cards: CardRow[]; onChanged: () => Promise<void> }) {
  const [bible, setBible] = useState<BibleInput>(() => bibleOf(show));
  const [castIds, setCastIds] = useState<string[]>(show.castIds);
  const [brief, setBrief] = useState("");
  const [seconds, setSeconds] = useState(600);
  const [saved, setSaved] = useState<string | null>(null);
  const { state, running, run, reset } = useCreateRun();
  const plan = usePlan();
  const number = nextEpisodeNumber(show);
  // Further seasons (W26): the next episode continues the current season, or opens the next one.
  const latestSeason = currentSeason(show);
  const [newSeason, setNewSeason] = useState(false);
  const season = Math.min(SEASON_MAX_NUMBER, newSeason && show.episodes.length ? latestSeason + 1 : latestSeason);
  const style = (show.animationStyle ?? null) as AnimationStyle | null;
  const production: ProductionSpec = {
    kind: "episode", medium: style ? "animation" : "live_action", animationStyle: style, seriesId: show.seriesId, episodeNumber: number,
    seasonNumber: season,
  };
  const label = season > 1 || show.episodes.some((e) => e.season > 1) ? `Season ${season} · Episode ${number}` : `Episode ${number}`;
  const effSeconds = Math.min(seconds, plan.maxSec);
  const est = estimateMs("wan-2.1", effSeconds, { stillMotion: isStillMotion(production) });
  const dirty = useMemo(() => JSON.stringify(bible) !== JSON.stringify(bibleOf(show)) || castIds.join() !== show.castIds.join(), [bible, castIds, show]);

  async function saveShow() {
    setSaved(null);
    try {
      await saveBible(show.seriesId, bible);
      await setShowCast(show.projectId, castIds);
      await onChanged();
      setSaved("Saved — the next episode follows it.");
    } catch (e) {
      setSaved(e instanceof Error ? e.message : String(e));
    }
  }

  function makeEpisode() {
    void run({ prompt: brief, title: `${show.title} — ${label}`, modelId: "wan-2.1", targetSeconds: effSeconds, production });
  }

  return (
    <StudioGrid
      controls={
        <>
          {show.episodes.length > 0 && latestSeason < SEASON_MAX_NUMBER && (
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={newSeason} onChange={(e) => setNewSeason(e.target.checked)} />
              Start season {latestSeason + 1} with this episode
            </label>
          )}
          <Field label={label} htmlFor="ep-brief">
            <textarea id="ep-brief" className="cf-input min-h-[96px] resize-y" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What happens in this episode" />
          </Field>
          <p className="text-[12px] text-cf-muted">
            {show.episodes.length
              ? `Knows what happened in ${seasonsOf(show).map((g) => `${seasonsOf(show).length > 1 ? `season ${g.season}: ` : ""}episodes ${g.episodes.map((e) => e.number).join(", ")}`).join("; ")} — who met whom, who learned what, who is gone.${newSeason ? ` Opens season ${season}: a new chapter, with everything before it still canon.` : ""}`
              : "The first episode: it sets up the show for every one after it."}
          </p>
          <Field label="Length" value={fmtDuration(effSeconds)}>
            <Chips>
              {LENGTHS.episode.map((s) => (
                <button key={s} type="button" className="cf-option" aria-pressed={seconds === s} onClick={() => setSeconds(s)} disabled={s > plan.maxSec}>{fmtDuration(s)}</button>
              ))}
            </Chips>
          </Field>
          <details className="rounded-lg border border-cf-line p-3">
            <summary className="cursor-pointer text-[14px] font-medium">Show Bible{style ? ` · ${STYLE_PROFILES[style].label}` : ""}</summary>
            <div className="mt-3 space-y-3">
              <BibleFields value={bible} onChange={setBible} />
              <CastPicker cards={cards} castIds={castIds} onChange={setCastIds} />
              <button type="button" className="cf-btn-line" onClick={saveShow} disabled={!dirty}>Save the show</button>
              {saved && <p className="text-[12px] text-cf-muted" role="status">{saved}</p>}
            </div>
          </details>
          {show.episodes.length > 0 && (
            <Field label="Episodes">
              <ol className="space-y-1 text-[13px]">
                {show.episodes.map((e) => (
                  <li key={e.projectId}><a className="underline" href={`/projects/${e.projectId}`}>{e.number}. {e.title}</a> <span className="text-cf-muted">· {e.status.toLowerCase()}</span></li>
                ))}
              </ol>
            </Field>
          )}
        </>
      }
      footer={
        <StudioFooter
          rows={[["Show", show.title], ["Episode", String(number)], ["Estimate", fmtMs(est)]]}
          note={<NotifyToggle state={state} />}
        >
          <button type="button" className="cf-btn-accent flex-1" onClick={makeEpisode} disabled={running || !brief.trim() || dirty}>
            {running ? "In production…" : dirty ? "Save the show first" : `Make episode ${number}`}
          </button>
          <button type="button" className="cf-btn-line" onClick={reset}>Reset</button>
        </StudioFooter>
      }
      preview={
        <RunPanel
          state={state}
          stageLabels={STAGES}
          readyTitle={`Episode ${number} is ready`}
          fill
          artSeed={`${show.title} ${number}`}
          emptyHint={
            <div>
              <p className="cf-display text-[clamp(32px,4vw,52px)] leading-none">{show.title}</p>
              <p className="mt-3 text-[14px] text-white/80">Episode {number} follows the bible and remembers everything before it.</p>
            </div>
          }
        />
      }
    />
  );
}
