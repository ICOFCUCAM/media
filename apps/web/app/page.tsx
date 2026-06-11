import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { AuroraField, GridFloor, EngineCore, Starfield } from "../components/futuristic/Ambient";
import { GenerativeFrame } from "../components/futuristic/GenerativeFrame";
import { SectionHeading } from "../components/futuristic/SectionHeading";
import { Reveal } from "../components/futuristic/Reveal";
import {
  PRODUCTS,
  WORKFLOW,
  SOCIAL_CHANNELS,
  MARKETPLACE_ITEMS,
  IDEA_TO_AUDIENCE,
  PRICING,
} from "../lib/products";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="overflow-hidden">
        <Hero />
        <Metrics />
        <Reveal><FeatureFilmStudio /></Reveal>
        <Reveal><StudioShowcase /></Reveal>
        <Reveal><IdeaToAudience /></Reveal>
        <Reveal><Workflow /></Reveal>
        <Reveal><VoiceAndAvatar /></Reveal>
        <LanguageStrip />
        <Reveal><PublishEverywhere /></Reveal>
        <Reveal><MadeWith /></Reveal>
        <Reveal><Marketplace /></Reveal>
        <Reveal><Pricing /></Reveal>
        <Reveal><FinalCta /></Reveal>
        <Footer />
      </main>
    </>
  );
}

/* ── 1 · Hero — a film visibly becoming a film ─────────────────────── */
function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <AuroraField />
      <Starfield count={48} />
      <GridFloor />

      <div className="mx-auto max-w-6xl px-6 pt-20 pb-8 text-center">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-widest text-white/70 backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="cf-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          The 2030 AI Film Engine
        </p>
        <h1 className="mx-auto max-w-4xl text-5xl font-semibold leading-[1.03] tracking-tight sm:text-7xl">
          <span className="bg-gradient-to-b from-white to-white/55 bg-clip-text text-transparent">A sentence in.</span>
          <br />
          <span className="cf-sheen bg-[linear-gradient(110deg,#a5b4fc,40%,#f0abfc,60%,#67e8f9)] bg-clip-text text-transparent">
            A cinematic film out.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-white/60 sm:text-lg">
          Watch your words resolve into shots, scored and narrated, dubbed into 20 languages,
          in your own cloned voice and on your own face, then published everywhere with one tap.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/create/film"
            className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-black shadow-[0_0_40px_-8px_rgba(255,255,255,0.5)] transition hover:shadow-[0_0_60px_-8px_rgba(165,180,252,0.8)]"
          >
            Create a Film
          </Link>
          <Link href="/create" className="rounded-xl border border-white/20 bg-white/[0.02] px-7 py-3.5 text-sm font-medium text-white backdrop-blur transition hover:border-white/40 hover:bg-white/5">
            Explore the studio
          </Link>
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pb-20">
        <div className="grid items-center gap-4 lg:grid-cols-[0.9fr_1.5fr]">
          <div className="order-2 space-y-3 lg:order-1">
            <PromptPanel />
            <StoryboardPanel />
          </div>
          <div className="relative order-1 lg:order-2">
            <EngineCore size={620} />
            <div className="cf-float">
              <GenerativeFrame />
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-center text-[11px] uppercase tracking-widest text-white/40">
          <span>Prompt</span>
          <span className="text-white/20">&rarr;</span>
          <span>Storyboard</span>
          <span className="text-white/20">&rarr;</span>
          <span>Generation</span>
          <span className="text-white/20">&rarr;</span>
          <span>Final cut</span>
        </div>
      </div>
    </section>
  );
}

function PromptPanel() {
  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-widest text-white/40">Prompt</div>
      <div className="mt-3 flex-1 rounded-lg bg-black/40 p-3 font-mono text-sm leading-relaxed text-white/80">
        An epic about an African kingdom fighting for its independence, told over three generations.
        <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-white/70 align-middle cf-shimmer" />
      </div>
      <div className="mt-3 self-start rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black">Create film</div>
    </div>
  );
}

function StoryboardPanel() {
  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-widest text-white/40">Storyboard</div>
      <div className="mt-3 grid flex-1 grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="aspect-video rounded-sm"
            style={{
              background: `linear-gradient(135deg, hsl(${(i * 41) % 360} 65% 45%), hsl(${(i * 41 + 40) % 360} 60% 30%))`,
              animation: `cf-shimmer 2.4s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
      <div className="mt-3 text-[11px] text-white/40">9 scenes · cast & locations locked</div>
    </div>
  );
}

/* ── 2 · Metrics ───────────────────────────────────────────────────── */
function Metrics() {
  const items = [
    { v: "20", k: "languages dubbed" },
    { v: `${SOCIAL_CHANNELS.length}`, k: "publish channels" },
    { v: "~6 min", k: "to a cinematic cut" },
    { v: "4K", k: "frontier-model output" },
  ];
  return (
    <section className="relative border-y border-white/10 bg-white/[0.02]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-10 sm:grid-cols-4">
        {items.map((m) => (
          <div key={m.k} className="group text-center">
            <div className="bg-gradient-to-b from-white to-white/50 bg-clip-text text-3xl font-semibold text-transparent transition group-hover:from-indigo-200 group-hover:to-fuchsia-300 sm:text-4xl">
              {m.v}
            </div>
            <div className="mt-1.5 text-xs uppercase tracking-widest text-white/40">{m.k}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 3 · Flagship: Feature Film Studio ─────────────────────────────── */
function FeatureFilmStudio() {
  const secondary = PRODUCTS.filter((p) => p.id !== "film");
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="cf-grain relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-8 shadow-[0_0_120px_-40px_rgba(124,45,143,0.8)] sm:p-12">
        <div className="cf-aurora pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(124,45,143,0.5),transparent)] blur-2xl" />
        <div className="cf-aurora pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.3),transparent)] blur-2xl" style={{ animationDelay: "-10s" }} />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fuchsia-300/80">
              <span className="h-1 w-6 rounded-full bg-fuchsia-400/60" /> Feature Film Studio
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              The first AI production system that makes feature-length films.
            </h2>
            <p className="mt-4 max-w-lg text-white/60">
              Persistent characters, scene-by-scene continuity and world memory — a whole production crew that
              writes, casts, films and scores, from one idea to a streamable final cut.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/create/film" className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black shadow-[0_0_30px_-8px_rgba(255,255,255,0.6)] transition hover:shadow-[0_0_50px_-8px_rgba(240,171,252,0.8)]">
                Create a Film →
              </Link>
              <div className="flex flex-wrap gap-2 text-sm text-white/55">
                {secondary.map((p) => (
                  <Link key={p.id} href={p.href} className="rounded-full border border-white/10 px-3 py-1.5 hover:border-white/30 hover:text-white">
                    {p.title.replace("Create a ", "").replace("Create ", "")}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="cf-float-slow">
            <GenerativeFrame />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 4 · Studio showcase (faux screenshot) ─────────────────────────── */
function StudioShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-8">
        <SectionHeading eyebrow="The workspace" title="A real production workspace" subtitle="Plan scenes, drop in seed images, generate shot by shot, and watch it render — live." />
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c12] shadow-2xl">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-rose-500/70" />
          <span className="h-3 w-3 rounded-full bg-amber-500/70" />
          <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
          <span className="ml-3 rounded bg-white/5 px-2 py-0.5 text-xs text-white/40">cineforge.app/create/film — Storyboard</span>
        </div>
        <div className="grid grid-cols-[150px_1fr]">
          {/* sidebar */}
          <div className="hidden border-r border-white/10 p-3 text-xs sm:block">
            <div className="px-1 pb-1 text-[9px] uppercase tracking-widest text-white/30">Studio</div>
            {["Create Anything", "Create Film", "Create Series", "Create Shorts"].map((l, i) => (
              <div key={l} className={`rounded px-2 py-1.5 ${i === 1 ? "bg-white/10 text-white" : "text-white/50"}`}>{l}</div>
            ))}
            <div className="px-1 pb-1 pt-3 text-[9px] uppercase tracking-widest text-white/30">Production</div>
            {["Projects", "Characters", "Worlds"].map((l) => (
              <div key={l} className="rounded px-2 py-1.5 text-white/50">{l}</div>
            ))}
          </div>
          {/* workspace */}
          <div className="p-5">
            <div className="mb-4 inline-flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-xs">
              {["Prompt", "Script", "Scene-by-Scene", "Image"].map((t, i) => (
                <span key={t} className={`rounded-md px-2.5 py-1 ${i === 2 ? "bg-white text-black" : "text-white/55"}`}>{t}</span>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => {
                const generating = i === 4;
                return (
                  <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                    <div className="relative mb-2 aspect-video overflow-hidden rounded">
                      <div className="cf-pan h-full w-full" style={{ background: `linear-gradient(135deg, hsl(${(i * 53) % 360} 60% 42%), hsl(${(i * 53 + 60) % 360} 55% 28%))` }} />
                      {generating && <div className="cf-scan absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-cyan-300/50 to-transparent" />}
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-white/70">Scene {i + 1}</span>
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${
                          i < 4 ? "border-emerald-400/40 text-emerald-300" : generating ? "border-cyan-400/40 text-cyan-300" : "border-white/20 text-white/45"
                        }`}
                      >
                        {i < 4 ? "Ready" : generating ? "◐ Filming" : "Draft"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 5 · From Idea to Audience ─────────────────────────────────────── */
function IdeaToAudience() {
  return (
    <section className="border-y border-white/10 bg-white/[0.015] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-2xl font-semibold sm:text-3xl">From idea to audience</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-white/55">One continuous pipeline — no exports, no hand-offs, no other tools.</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {IDEA_TO_AUDIENCE.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span className="group relative rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-sm transition hover:border-indigo-400/50 hover:bg-indigo-400/[0.06]">
                <span className="mr-1.5 font-mono text-[10px] text-indigo-300/60">{String(i + 1).padStart(2, "0")}</span>
                {step}
              </span>
              {i < IDEA_TO_AUDIENCE.length - 1 && (
                <span className="relative h-px w-5 overflow-hidden bg-white/15">
                  <span className="cf-flow absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-indigo-300" style={{ animationDelay: `${i * 0.3}s` }} />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 6 · Workflow ──────────────────────────────────────────────────── */
function Workflow() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-white/40">Create · Edit · Publish · Monetize</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {WORKFLOW.map((w) => (
          <div
            key={w.step}
            className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/25 hover:bg-white/[0.04]"
          >
            <div className="pointer-events-none absolute -right-12 -top-12 h-24 w-24 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.25),transparent)] opacity-0 blur-xl transition group-hover:opacity-100" />
            <div className="text-xs text-white/30">{w.step}</div>
            <div className="mt-1 text-base font-semibold">{w.title}</div>
            <p className="mt-1 text-sm text-white/55">{w.blurb}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 7 · Publish everywhere ────────────────────────────────────────── */
/* ── Voice & Avatar studio ─────────────────────────────────────────── */
function VoiceAndAvatar() {
  const cards = [
    { title: "Clone your voice", body: "30 seconds of speech becomes a voice that reads anything — speeches, news, narration — with no length limit.", chip: "Voice Lab", icon: "🎙" },
    { title: "Speak 20 languages", body: "Your voice in French, Swahili, Norwegian, Igbo, Lingala, Zulu, Pidgin and more — languages other platforms ignore.", chip: "Dubbing", icon: "🌍" },
    { title: "Put yourself on camera", body: "Upload a photo and it delivers your speech on video, lip-synced — a personal news anchor in any language.", chip: "Avatars", icon: "🎭" },
    { title: "Offer your voice", body: "List your cloned voice on the marketplace under your own terms — every use pays you 80%.", chip: "Marketplace", icon: "💎" },
  ];
  return (
    <section className="relative isolate mx-auto max-w-6xl overflow-hidden px-6 py-20">
      <div className="cf-aurora pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[30rem] w-[50rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.12),transparent)] blur-3xl" />
      <h2 className="text-center text-3xl font-semibold sm:text-4xl">
        <span className="cf-sheen bg-[linear-gradient(110deg,#fff,40%,#a5b4fc,60%,#fff)] bg-clip-text text-transparent">Your voice. Your face. Every language.</span>
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-white/55">
        The Voice Lab turns a sample of your voice into an instrument — and your photo into a presenter.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <div
            key={c.title}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:-translate-y-1 hover:border-indigo-400/40 hover:bg-white/[0.04]"
            style={{ animation: `cf-float ${6 + (i % 3)}s ease-in-out ${i * 0.4}s infinite` }}
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.3),transparent)] opacity-0 blur-xl transition group-hover:opacity-100" />
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/10 text-xl">{c.icon}</div>
            <span className="rounded-full bg-indigo-400/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-indigo-300">{c.chip}</span>
            <h3 className="mt-3 font-semibold">{c.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{c.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 text-center">
        <Link href="/library/voices" className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium transition hover:bg-white/5">
          Open the Voice Lab →
        </Link>
      </div>
    </section>
  );
}

function LanguageStrip() {
  const langs = ["English", "Français", "Español", "Deutsch", "中文", "Русский", "العربية", "हिन्दी", "Kiswahili", "Yorùbá", "Igbo", "Lingála", "Luganda", "isiZulu", "Naijá Pidgin", "Norsk", "Svenska", "Português", "日本語", "한국어"];
  const row = [...langs, ...langs];
  return (
    <section className="border-y border-white/5 bg-white/[0.015] py-9">
      <p className="mb-5 text-center text-[11px] uppercase tracking-widest text-white/35">
        Every film, every speech — in 20 languages, including the ones everyone else skips
      </p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
        <div className="cf-marquee flex w-max gap-3">
          {row.map((l, i) => (
            <span
              key={i}
              className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-sm text-white/60 transition hover:border-indigo-400/40 hover:text-white"
            >
              {l}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function PublishEverywhere() {
  const row = [...SOCIAL_CHANNELS, ...SOCIAL_CHANNELS];
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="text-3xl font-semibold sm:text-5xl">
          One film. <span className="text-fuchsia-300">{SOCIAL_CHANNELS.length} channels.</span> Zero extra work.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-white/60">
          Every cut is auto-resized, captioned and delivered to each platform — the right aspect ratio, length and
          metadata, in one click.
        </p>
        <Link href="/publish" className="mt-6 inline-block rounded-lg border border-white/20 px-5 py-2.5 text-sm hover:bg-white/5">
          Set up publishing →
        </Link>
      </div>
      <div className="relative mt-10 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
        <div className="cf-marquee flex w-max gap-3">
          {row.map((c, i) => (
            <span
              key={i}
              className="whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.03] px-6 py-4 text-lg font-medium text-white/80 transition hover:border-emerald-400/40 hover:text-white"
            >
              {c.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 8 · Made with Cineforge ───────────────────────────────────────── */
function MadeWith() {
  const examples = [
    { label: "Feature film", tag: "Drama", hue: 270 },
    { label: "Animated scene", tag: "Animation", hue: 190 },
    { label: "Brand commercial", tag: "Commercial", hue: 30 },
    { label: "Vertical short", tag: "Short", hue: 330, vertical: true },
    { label: "Documentary", tag: "Doc", hue: 150 },
    { label: "Music video", tag: "Music", hue: 300 },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8">
        <SectionHeading center={false} eyebrow="Showreel" title="Made with Cineforge" subtitle="Films, animation, commercials, shorts and docs — from a single prompt." />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {examples.map((e) => (
          <div key={e.label} className="group relative overflow-hidden rounded-xl border border-white/10 transition hover:border-white/30 hover:shadow-[0_0_40px_-12px_rgba(99,102,241,0.7)]">
            <div className={`cf-pan transition duration-500 group-hover:scale-105 ${e.vertical ? "aspect-[3/4]" : "aspect-video"}`} style={{ background: `linear-gradient(135deg, hsl(${e.hue} 60% 42%), hsl(${(e.hue + 50) % 360} 55% 26%))` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-3">
              <span className="text-sm font-medium">{e.label}</span>
              <span className="rounded bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">{e.tag}</span>
            </div>
            <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black opacity-0 shadow-lg transition group-hover:opacity-100">▶</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 9 · Marketplace ───────────────────────────────────────────────── */
function Marketplace() {
  return (
    <section className="border-y border-white/10 bg-white/[0.015] py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Earn from what you create</h2>
            <p className="mt-1 text-white/55">Sell characters, worlds, voices and templates. Keep 90%.</p>
          </div>
          <Link href="/marketplace" className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/5">Open the marketplace →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {MARKETPLACE_ITEMS.map((m) => (
            <div key={m.name} className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition hover:-translate-y-1 hover:border-white/30">
              <div className="relative overflow-hidden">
                <div className={`cf-pan aspect-square bg-gradient-to-br transition duration-500 group-hover:scale-110 ${m.accent}`} />
                <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-300 backdrop-blur">keep 90%</span>
              </div>
              <div className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-white/40">{m.kind}</div>
                <div className="mt-0.5 truncate text-sm font-medium">{m.name}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">${m.price}</span>
                  <span className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-black transition group-hover:bg-indigo-200">Buy</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 10 · Pricing ──────────────────────────────────────────────────── */
function Pricing() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <h2 className="text-center text-2xl font-semibold sm:text-3xl">Start free. Scale to a studio.</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PRICING.map((t) => (
          <div
            key={t.tier}
            className={`relative rounded-2xl border p-6 transition hover:-translate-y-1 ${
              t.highlight
                ? "border-fuchsia-400/40 bg-fuchsia-400/[0.05] shadow-[0_0_60px_-20px_rgba(217,70,239,0.8)]"
                : "border-white/10 bg-white/[0.02] hover:border-white/25"
            }`}
          >
            {t.highlight && <div className="pointer-events-none absolute -top-px left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-fuchsia-400/70 to-transparent" />}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t.tier}</h3>
              {t.highlight && <span className="rounded-full bg-fuchsia-400/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fuchsia-200">Popular</span>}
            </div>
            <div className="mt-3 text-3xl font-semibold">{t.price}</div>
            <div className="mt-1 text-xs text-white/45">{t.tagline}</div>
            <ul className="mt-4 space-y-2 text-sm text-white/60">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-emerald-300">✓</span>{f}</li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className={`mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-medium transition ${
                t.highlight ? "bg-white text-black hover:bg-white/90" : "border border-white/20 hover:bg-white/5"
              }`}
            >
              {t.tier === "Enterprise" ? "Talk to us" : "Get started"}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 11 · Final CTA ────────────────────────────────────────────────── */
function FinalCta() {
  return (
    <section className="relative isolate mx-auto max-w-6xl overflow-hidden px-6 py-28 text-center">
      <EngineCore size={680} />
      <Starfield count={30} />
      <div className="cf-aurora pointer-events-none absolute left-1/2 top-1/2 -z-10 h-80 w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(124,45,143,0.4),transparent)] blur-2xl" />
      <h2 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
        Your studio is <span className="cf-sheen bg-[linear-gradient(110deg,#a5b4fc,40%,#f0abfc,60%,#67e8f9)] bg-clip-text text-transparent">one prompt</span> away.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-white/60">Write the idea. We'll handle the crew, the cameras and the distribution.</p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link href="/create/film" className="rounded-xl bg-white px-8 py-4 text-sm font-semibold text-black shadow-[0_0_50px_-10px_rgba(255,255,255,0.6)] transition hover:shadow-[0_0_70px_-10px_rgba(165,180,252,0.9)]">
          Create your first film →
        </Link>
        <Link href="/create" className="rounded-xl border border-white/20 bg-white/[0.02] px-8 py-4 text-sm font-medium backdrop-blur transition hover:border-white/40 hover:bg-white/5">
          See all the ways to start
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-white/40">
        <span>© {new Date().getFullYear()} Cineforge</span>
        <div className="flex gap-5">
          <Link href="/create/film" className="hover:text-white/70">Studio</Link>
          <Link href="/library/voices" className="hover:text-white/70">Voice Lab</Link>
          <Link href="/marketplace" className="hover:text-white/70">Marketplace</Link>
          <Link href="/publish" className="hover:text-white/70">Publish</Link>
          <Link href="/pricing" className="hover:text-white/70">Pricing</Link>
          <a href="https://github.com/ICOFCUCAM/media" className="hover:text-white/70">Code</a>
        </div>
      </div>
    </footer>
  );
}
