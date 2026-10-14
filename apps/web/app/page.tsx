import type { Metadata } from "next";
import Link from "next/link";
import "./home.css";
import "./home-premium.css";
import "./home-iconic.css";
import { HomeMotion } from "../components/home/HomeMotion";
import { HomeShowreel } from "../components/home/HomeShowreel";
import { HeroFrame } from "../components/home/HeroFrame";
import { HeroTitle } from "../components/home/HeroTitle";
import { WorkspacePreview } from "../components/home/WorkspacePreview";
import { ActHead, ProductionThread } from "../components/home/ProductionThread";
import { CinemaArt, type Scene } from "../components/cf/CinemaArt";
import { ClockIcon, ConfigCard, EngineIcon, FormatIcon } from "../components/cf/ConfigCard";
import { MasterShot } from "../components/home/scenes/MasterShot";
import { WorldAtlas } from "../components/home/scenes/WorldAtlas";
import { StoryCloseUp } from "../components/home/scenes/StoryCloseUp";
import { ReleaseScreens } from "../components/home/scenes/ReleaseScreens";
import { VoicePresenter } from "../components/home/scenes/VoicePresenter";
import { AssetVisual } from "../components/home/scenes/AssetVisual";
import { frame, frameVideo, type FrameSlot } from "../lib/frames";
import {
  NAV,
  PRODUCTS,
  SOCIAL_CHANNELS,
  MARKETPLACE_ITEMS,
  IDEA_TO_AUDIENCE,
  PRICING,
} from "../lib/products";

/*
 * Cineforge homepage — "The Film Production System".
 * Layout and containers follow docs/design/homepage.html exactly (styles in ./home.css,
 * scoped under .cfh); every section is wired to the real studio routes and
 * product data in lib/products.
 *
 * The page is one film told in four acts — the world, the production, the
 * release, the studio — all in the same world (Ashéron-Kor), joined by one
 * motif: the production thread (Idea → Distribute) that opens every act.
 * Immersive chapters alternate with quiet editorial ones.
 */

const DESCRIPTION =
  "Cineforge is a complete production environment for films, series, trailers, adverts, shorts and music videos — from the first idea to the finished release.";

export const metadata: Metadata = {
  title: { absolute: "Cineforge — The Film Production System" },
  description: DESCRIPTION,
  openGraph: {
    title: "Cineforge — Make worlds.",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/frames/hero.webp", width: 1896, height: 1086, alt: "Ashéron-Kor at dawn: the citadel backlit by the sun, the queen and her guard on the ridge" }],
  },
  twitter: { card: "summary_large_image", title: "Cineforge — Make worlds.", description: DESCRIPTION, images: ["/frames/hero.webp"] },
};


const CHANNEL_FORMAT: Record<(typeof SOCIAL_CHANNELS)[number]["kind"], string> = {
  video: "16:9",
  short: "9:16",
  post: "Multiple",
};

const navSection = (title: string) => NAV.find((s) => s.title === title)?.items ?? [];

export default function Home() {
  return (
    <div className="cfh" id="top">
      <HomeMotion />
      <Nav />
      <main>
        {/* Act I · The world */}
        <Hero />
        <Manifesto />
        <WorldChapter />
        <StoryChapter />
        {/* Act II · The production */}
        <Journey />
        <Workspace />
        <Voice />
        {/* Act III · The release */}
        <Showreel />
        <Publish />
        <Marketplace />
        {/* Act IV · The studio */}
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ── Navigation ────────────────────────────────────────────────────── */
function Nav() {
  return (
    <nav className="nav">
      <Link href="/" className="logo">
        <span className="logo-mark" />
        CINEFORGE
      </Link>

      <div className="nav-center">
        <a href="#production">Production</a>
        <a href="#studio">Studio</a>
        <a href="#films">Films</a>
        <a href="#marketplace">Marketplace</a>
        <a href="#pricing">Access</a>
      </div>

      <div className="nav-right">
        <Link href="/projects" className="nav-login">Sign in</Link>
        <Link href="/create" className="nav-cta">Enter Studio</Link>
        {/* Phones and tablets: the section links fold into a menu (no JS needed). */}
        <details className="nav-menu">
          <summary aria-label="Menu">Menu</summary>
          <div className="nav-menu-panel">
            <a href="#production">Production</a>
            <a href="#studio">Studio</a>
            <a href="#films">Films</a>
            <a href="#marketplace">Marketplace</a>
            <a href="#pricing">Access</a>
            <Link href="/projects">Sign in</Link>
          </div>
        </details>
      </div>
    </nav>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────── */
function Hero() {
  const still = frame("hero");
  const wide = frame("hero-wide");
  const thumbs = (["hero-1", "hero-2", "hero-3"] as const).map((k) => frame(k));
  return (
    <section className="hero hero-v2">
      {/* The largest paint on the page: fetch the hero picture first. */}
      {wide && <link rel="preload" as="image" href={wide} fetchPriority="high" />}
      <div className="hero-image" />
      <HeroFrame masterStill={still} wideStill={wide} loop={frameVideo("hero-loop")} thumbs={thumbs} />

      <div className="hero-content">
        <div className="eyebrow hero-kicker"><i className="hero-kicker-rule" aria-hidden />The film production system</div>

        <HeroTitle />

        <p className="hero-description">
          Cineforge is a complete production environment for creating films, series, trailers, adverts,
          shorts and music videos — from the first idea to the finished release.
        </p>

        <div className="hero-actions">
          <Link href="/create" className="primary">Enter the Studio</Link>
          <a href="#films" className="text-link">Watch the work →</a>
        </div>
      </div>

      <div className="hero-bottom">
        <ProductionThread from={0} to={PRODUCTION_LAST} className="thread-hero" />
        <span className="hero-copy">© {new Date().getFullYear()} Cineforge<i aria-hidden /></span>
      </div>
    </section>
  );
}

const PRODUCTION_LAST = 5;

/* ── Manifesto ─────────────────────────────────────────────────────── */
function Manifesto() {
  return (
    <section className="section manifesto">
      <div className="container">
        <ActHead n="I" name="The world" from={0} to={0} />
      </div>
      <div className="container manifesto-grid reveal">
        <div>
          <div className="eyebrow">A different kind of studio</div>
        </div>

        <div className="manifesto-copy">
          <h2>
            Not another<br />
            <em>AI tool.</em>
          </h2>
          <p>
            A production system where the story, characters, locations, scenes, voices, picture and release
            remain connected from beginning to end.
          </p>
          <p>
            <span>One world. One production. One continuous creative space.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Chapter 01 · World — the real entry points into the studio ───── */
function WorldChapter() {
  // The world's own establishing shot, else the citadel from the hero film.
  const world = frame("world") ?? frame("hero-spires");
  return (
    <section className="section chapter dark">
      <div className="container chapter-grid reveal">
        <div className="chapter-image chapter-atlas">
          <i className="cfh-grain cf-grain" aria-hidden />
          <i className="cfp-corner tl" aria-hidden /><i className="cfp-corner tr" aria-hidden /><i className="cfp-corner bl" aria-hidden /><i className="cfp-corner br" aria-hidden />
          {world ? (
            <>
              {/* Plain <img>: a static still from public/frames. */}
              <img src={world} alt="Ashéron-Kor at dawn: the great spire crowned by its ring of light, the river falling from the citadel walls" className="art-fill still-fill" loading="lazy" />
              <div className="atlas-inset" aria-hidden>
                <WorldAtlas className="art-fill" />
              </div>
            </>
          ) : (
            <WorldAtlas className="art-fill" />
          )}
        </div>

        <div className="chapter-copy">
          <div className="chapter-number">01 / WORLD</div>

          <h2>
            Build the<br />
            <em>world.</em>
          </h2>

          <p>
            Start with an idea. Develop the story, establish the characters, define the locations and preserve
            the visual identity of the production as the film grows.
          </p>

          <div className="chapter-index">
            {PRODUCTS.map((p) => (
              <Link key={p.id} href={p.href}>
                <span>{p.title}</span>
                <span>{p.durations[0]?.label} – {p.durations[p.durations.length - 1]?.label}</span>
              </Link>
            ))}
          </div>

          <Link href="/library/worlds" className="text-link">Explore world building →</Link>
        </div>
      </div>
    </section>
  );
}

/* ── Chapter 02 · Workspace ────────────────────────────────────────── */
const WS_PRESETS: { title: string; tags: string; scene: Scene }[] = [
  { title: "Kingdom epic", tags: "Epic · Historical", scene: "kingdom" },
  { title: "Neon noir", tags: "Thriller · Sci-Fi", scene: "city" },
  { title: "Ocean voyage", tags: "Adventure · Drama", scene: "sea" },
];


function Workspace() {
  const studio = navSection("Studio");
  const production = navSection("Production");
  const heroStill = frame("hero");
  return (
    <section className="section workspace" id="studio">
      <div className="container">
        <div className="workspace-head reveal">
          <div>
            <div className="eyebrow">03 / WORKSPACE</div>
            <h2>
              A real<br />
              <em>film workspace.</em>
            </h2>
          </div>

          <p>
            Plan scenes. Control shots. Work with characters, environments and sound. Review the production
            while it is being built.
          </p>
        </div>

        <div className="studio reveal">
          <aside className="studio-sidebar">
            <h4>Studio</h4>
            {studio.map((item) => (
              <Link key={item.href} href={item.href} className={`studio-item${item.href === "/create/film" ? " active" : ""}`}>
                {item.label}
              </Link>
            ))}
            <h4>Production</h4>
            {production.map((item) => (
              <Link key={item.href} href={item.href} className="studio-item">
                {item.label}
              </Link>
            ))}
          </aside>

          <div className="studio-main cf-dark">
            {/* A miniature of the real Create Film studio, built from its own components. */}
            <div className="ws-shot" role="img" aria-label="The Create Film studio: start from an example, describe the film, configure length, engine and format, then create — with the production preview alongside">
              <div className="ws-tabs" aria-hidden>
                {["Auto", "Hybrid", "Scene-by-Scene", "Script", "Image"].map((t, i) => (
                  <span key={t} className={i === 0 ? "is-on" : ""}>{t}</span>
                ))}
              </div>
              <div className="ws-room" aria-hidden>
                <div className="ws-controls">
                  <div className="ws-label ws-optional">Start from an example</div>
                  <div className="ws-presets">
                    {WS_PRESETS.map((p, i) => (
                      <span key={p.title} className="cf-preset" aria-pressed={i === 0}>
                        <span className="cf-preset-thumb">
                          {i === 0 && heroStill ? <img src={heroStill} alt="" className="still-fill" loading="lazy" /> : <CinemaArt seed={p.title} scene={p.scene} className="h-full w-full" />}
                        </span>
                        <span className="cf-preset-title">{p.title}</span>
                        <span className="cf-preset-tags">{p.tags}</span>
                      </span>
                    ))}
                  </div>
                  <div className="ws-label ws-optional">Describe your film</div>
                  <div className="ws-brief">An epic about an African kingdom fighting for its independence, told over three generations.</div>
                  <div className="ws-label">Configure</div>
                  <div className="cf-config-grid ws-config">
                    <ConfigCard tone="length" icon={<ClockIcon />} label="Length" main="2 minutes" secondary="Final runtime" options={[]} />
                    <ConfigCard tone="engine" icon={<EngineIcon />} label="Engine" main="Cinematic" secondary="Kling 2.1" options={[]} />
                    <ConfigCard tone="format" icon={<FormatIcon />} label="Format" main="1080p" secondary="Full HD" options={[]} />
                  </div>
                  <div className="ws-create">Create film</div>
                </div>
                <div className="ws-preview">
                  <WorkspacePreview stills={(["hero-river", "hero-2", "hero-spires", "hero-ridge", "hero"] as const).map((k) => frame(k))} />
                </div>
              </div>
            </div>

            <div className="pipeline">
              {IDEA_TO_AUDIENCE.map((step, i) => (
                <span key={step} style={{ ["--i" as string]: i, ["--n" as string]: IDEA_TO_AUDIENCE.length }}>
                  {String(i + 1).padStart(2, "0")} {step}
                </span>
              ))}
            </div>
          </div>

          <aside className="studio-right">
            <div className="inspector">Scene Inspector</div>
            {[
              ["Camera", "35mm"],
              ["Lens", "50mm"],
              ["Lighting", "Torchlight"],
              ["Character", "Locked"],
              ["World", "Locked"],
              ["Sound", "Original"],
            ].map(([k, v]) => (
              <div key={k} className="parameter">
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            <Link href="/create/film" className="nav-cta">Open the workspace</Link>
          </aside>
        </div>
      </div>
    </section>
  );
}

/* ── Chapter 03 · Story ────────────────────────────────────────────── */
function StoryChapter() {
  // Amara's close-up when it exists, else her wide on the ridge from the hero film.
  const own = frame("story");
  const ridge = frame("hero-ridge");
  const story = own
    ? { src: own, alt: "Close-up: Amara in profile, firelit, in a burnt-orange gele", slate: "CU · AMARA", lens: "85MM" }
    : ridge
      ? { src: ridge, alt: "Amara and her guard on the ridge at sunset, the spires of Ashéron-Kor beyond", slate: "WS · AMARA ON THE RIDGE", lens: "35MM" }
      : null;
  return (
    <section className="section chapter dark">
      <div className="container chapter-grid reveal">
        <div className="chapter-copy">
          <div className="chapter-number">02 / CAST</div>

          <h2>
            Every shot<br />
            <em>belongs.</em>
          </h2>

          <p>
            Characters remember who they are. Worlds remain coherent. Scenes connect. The production evolves
            without losing the identity of the story.
          </p>

          <Link href="/library/characters" className="text-link">Build your cast →</Link>
        </div>

        <div className="chapter-image chapter-portrait">
          <i className="cfh-grain cf-grain" aria-hidden />
          <i className="cfp-corner tl" aria-hidden /><i className="cfp-corner tr" aria-hidden /><i className="cfp-corner bl" aria-hidden /><i className="cfp-corner br" aria-hidden />
          {story ? (
            <>
              <img src={story.src} alt={story.alt} className="art-fill still-fill story-still" loading="lazy" />
              <span className="still-slate" aria-hidden>{story.slate}<br /><small>SC 12 · TK 3 · {story.lens}</small></span>
              <span className="still-subtitle">— Then we will build it ourselves.</span>
            </>
          ) : (
            <StoryCloseUp className="art-fill" />
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Act II · The production journey ─────────────────────────────── */
/**
 * One production, followed through the studio: each stage of the thread is a
 * department the visitor can open, shown working on the same film the hero
 * opens on. Frames come from the hero film; a stage without one shows its
 * product surface (the brief, the script page, the edit and the mix) instead.
 */
const SCRIPT: [string, string][] = [
  ["slug", "EXT. THE RIDGE ABOVE ASHÉRON-KOR — DAWN"],
  ["action", "The sun breaks behind the spires. AMARA (40s) watches the citadel wake, her guard at her back."],
  ["cue", "AMARA"],
  ["line", "They will never give us a kingdom."],
  ["cue", "KOFI"],
  ["line", "Then what is left?"],
  ["cue", "AMARA"],
  ["line", "Then we will build it ourselves."],
];

/** Each stem's regions as start/end pairs, in % of the cut. */
const STEMS: [string, number[]][] = [
  ["DIA", [0, 18, 26, 44, 52, 70]],
  ["MUS", [0, 100]],
  ["AMB", [0, 64, 70, 100]],
  ["SFX", [12, 16, 47, 50, 82, 86]],
];

const regions = (cuts: number[]) => cuts.flatMap((c, i) => (i % 2 ? [] : [[c, cuts[i + 1]!] as const]));

function Journey() {
  const [master, ridge, hall, valley, spires, river] = (["hero", "hero-1", "hero-2", "hero-3", "hero-spires", "hero-river"] as const).map((k) => frame(k));
  const boards = [valley, ridge, hall, master];
  const reel = [spires, frame("hero-ridge"), hall, river];
  const steps: { title: string; body: string; href: string; go: string; visual: React.ReactNode }[] = [
    {
      title: "Idea",
      body: "A sentence is enough. The studio turns it into a production: story, cast, world and length.",
      href: "/create",
      go: "Start a production",
      visual: (
        <div className="jv-brief">
          <span className="jv-label">The brief</span>
          <p>An epic about an African kingdom fighting for its independence, told over three generations.</p>
          <span className="jv-meta">Film · 2 min · 1080p</span>
        </div>
      ),
    },
    {
      title: "Script",
      body: "A real screenplay — scenes, action and dialogue — that every later department reads from.",
      href: "/create/film",
      go: "Open the Director’s Room",
      visual: (
        <div className="jv-script" aria-hidden>
          {SCRIPT.map(([k, t], i) => <p key={i} className={`jv-${k}`}>{t}</p>)}
        </div>
      ),
    },
    {
      title: "Visualise",
      body: "Storyboards and reference stills lock every character, costume and place before a frame is filmed.",
      href: "/library/characters",
      go: "Build your cast",
      visual: (
        <div className="jv-boards" aria-hidden>
          {boards.map((b, i) => (
            <span key={i}>
              {b ? <img src={b} alt="" className="still-fill" loading="lazy" /> : <CinemaArt seed={`board ${i}`} className="art-fill" />}
              <small>{String(i + 1).padStart(2, "0")}</small>
            </span>
          ))}
        </div>
      ),
    },
    {
      title: "Produce",
      body: "Each shot is generated from its board with the same faces, light and lens — and checked against canon.",
      href: "/projects",
      go: "Your productions",
      visual: (
        <div className="jv-shot" aria-hidden>
          {river ? <img src={river} alt="" className="still-fill" loading="lazy" /> : <CinemaArt seed="produce" scene="kingdom" className="art-fill" />}
          <span className="jv-slate">SC 04 · TK 2<br /><small>EXT. THE RIVER GATE · 50MM</small></span>
          <span className="jv-check">Continuity ✓</span>
        </div>
      ),
    },
    {
      title: "Final cut",
      body: "The edit, voices, music, ambience and effects are cut and mixed to the picture, in sync.",
      href: "/library/music",
      go: "Score and sound",
      visual: (
        <div className="jv-edit" aria-hidden>
          <div className="jv-reel">
            {reel.map((b, i) => (
              <span key={i}>{b ? <img src={b} alt="" className="still-fill" loading="lazy" /> : null}</span>
            ))}
            <i className="jv-head" />
          </div>
          {STEMS.map(([name, cuts]) => (
            <div key={name} className="jv-stem">
              <b>{name}</b>
              <span>
                {regions(cuts).map(([s, e]) => (
                  <i key={s} style={{ left: `${s}%`, width: `${e - s}%` }} />
                ))}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Distribute",
      body: "One master becomes every cut: every aspect ratio, every language, every channel — and your own.",
      href: "/publish",
      go: "Set up publishing",
      visual: (
        <div className="jv-release" aria-hidden>
          {master ? <img src={master} alt="" className="still-fill" loading="lazy" /> : <MasterShot idPrefix="journey" className="art-fill" />}
          <span className="jv-vertical">{master ? <img src={master} alt="" className="still-fill" loading="lazy" /> : null}</span>
          <span className="jv-meta">16:9 · 9:16 · 20 languages</span>
        </div>
      ),
    },
  ];
  return (
    <section className="section journey" id="production">
      <div className="container">
        <ActHead n="II" name="The production" from={1} to={4} />
        <div className="journey-head reveal">
          <h2>
            From idea<br />
            <em>to finished film.</em>
          </h2>
          <p>
            Follow one production — <span>Ashéron-Kor</span> — through the studio. Every stage is a department you can
            open, and every department reads from the same story.
          </p>
        </div>
      </div>

      <ol className="journey-track" aria-label="The production journey">
        {steps.map((s, i) => (
          <li key={s.title} className="journey-step reveal" style={{ ["--i" as string]: i }}>
            <div className="journey-visual">{s.visual}</div>
            <div className="journey-no"><i aria-hidden />{String(i + 1).padStart(2, "0")}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <Link href={s.href} className="journey-go">{s.go} →</Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
/* ── 04 · Showreel ─────────────────────────────────────────────────── */
/** Each sample tile's own still, else a still from the same world (the hero film) until one is generated. */
const REEL_STILLS: [FrameSlot, FrameSlot | null][] = [
  ["work-1", "hero"], ["work-2", "hero-3"], ["work-3", "hero-1"], ["work-4", null], ["work-5", "hero-2"], ["work-6", null],
];

function Showreel() {
  return (
    <section className="section showreel" id="films">
      <div className="container">
        <ActHead n="III" name="The release" from={5} to={5} />
        <div className="showreel-header reveal">
          <div>
            <div className="eyebrow">05 / THE WORK</div>
            <h2>
              Made<br />
              <em>with Cineforge.</em>
            </h2>
          </div>
          <Link href="/publish/streaming" className="text-link">View complete showreel →</Link>
        </div>

        <HomeShowreel stills={REEL_STILLS.map(([own, from]) => frame(own) ?? (from ? frame(from) : undefined))} />
      </div>
    </section>
  );
}

/* ── 05 · Release ──────────────────────────────────────────────────── */
function Publish() {
  return (
    <section className="section publish">
      <div className="container publish-grid reveal">
        <div>
          <div className="eyebrow">06 / RELEASE</div>
          <h2>
            One film.<br />
            <em>Every screen.</em>
          </h2>
          <ReleaseScreens still={frame("hero")} />
        </div>

        <div className="publish-copy">
          <p>
            The production does not end at the final cut. Every cut is resized, captioned and delivered to{" "}
            {SOCIAL_CHANNELS.length} channels — the right aspect ratio, length and metadata — without rebuilding
            the work from scratch.
          </p>

          <div className="channel-list">
            {SOCIAL_CHANNELS.map((c) => (
              <div key={c.id} className="channel">
                <span>{c.name}</span>
                <span>{CHANNEL_FORMAT[c.kind]}</span>
              </div>
            ))}
            <div className="channel">
              <span>Private Channel</span>
              <span>1080p HLS</span>
            </div>
            {/* Phones show the first five channels and this count instead of all of them. */}
            <div className="channel channel-more" aria-hidden>
              <span>+ {SOCIAL_CHANNELS.length + 1 - 5} more channels</span>
              <span />
            </div>
          </div>

          <Link href="/publish" className="text-link">Set up publishing →</Link>
        </div>
      </div>
    </section>
  );
}

/* ── 06 · Voice ────────────────────────────────────────────────────── */
const VOICE_FEATURES: [string, string][] = [
  ["Clone your voice", "Voice Studio"],
  ["Speak 20 languages", "Dubbing"],
  ["Put yourself on camera", "Avatars"],
  ["Offer your voice", "Marketplace"],
];

function Voice() {
  return (
    <section className="section voice">
      <div className="container voice-grid reveal">
        <div>
          <div className="eyebrow">04 / VOICE</div>
          <h2>
            Give the<br />
            story a<br />
            <em>voice.</em>
          </h2>
          <VoicePresenter still={frame("voice")} />
        </div>

        <div className="voice-copy">
          <p>
            Thirty seconds of speech becomes a voice that reads anything. Narration, dialogue, multilingual
            versions and presenters become part of the same production system.
          </p>
          <p>
            One production can speak to audiences across languages without losing the identity of the
            original work.
          </p>

          <div className="channel-list">
            {VOICE_FEATURES.map(([title, chip]) => (
              <div key={title} className="channel">
                <span>{title}</span>
                <span>{chip}</span>
              </div>
            ))}
          </div>

          <Link href="/library/voices" className="text-link">Open the Voice Studio →</Link>
        </div>
      </div>
    </section>
  );
}

/* ── 07 · Marketplace ──────────────────────────────────────────────── */
function Marketplace() {
  return (
    <section className="section showreel market" id="marketplace">
      <div className="container">
        <div className="showreel-header reveal">
          <div>
            <div className="eyebrow">07 / MARKETPLACE</div>
            <h2>
              Earn from<br />
              <em>what you make.</em>
            </h2>
          </div>
          <Link href="/marketplace" className="text-link">Open the marketplace →</Link>
        </div>

        <div className="reel-grid reveal">
          {MARKETPLACE_ITEMS.map((m) => (
            <Link key={m.name} href="/marketplace" className="reel">
              <AssetVisual kind={m.kind} name={m.name} className="art-fill" />
              <span className="reel-tag">Keep 90%</span>
              <div className="reel-info">
                <span>{m.kind} · {m.name}</span>
                <span>${m.price}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Access · Pricing ──────────────────────────────────────────────── */
function Pricing() {
  return (
    <section className="section pricing" id="pricing">
      <div className="container">
        <ActHead n="IV" name="The studio" from={0} to={PRODUCTION_LAST} />
        <div className="pricing-header reveal">
          <div>
            <div className="eyebrow">08 / ACCESS</div>
            <h2>
              Enter the<br />
              <em>studio.</em>
            </h2>
          </div>
          <p>
            Start free with the tools you need. Expand into a complete production environment as your work
            grows.
          </p>
        </div>

        <div className="price-row reveal" style={{ ["--tiers" as string]: PRICING.length - 1 }}>
          {PRICING.map((t) => (
            <div key={t.tier} className={`price${t.highlight ? " featured" : ""}`}>
              <div className="price-name">
                <span>{t.tier}</span>
                {t.highlight && <span className="price-flag">Recommended</span>}
              </div>
              <PriceValue price={t.price} />
              <div className="price-description">{t.tagline}</div>
              <ul>
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link href="/pricing" className="price-cta">
                {t.tier === "Enterprise" ? "Talk to us" : t.tier === "Free" ? "Start free" : `Choose ${t.tier}`}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** "$19/mo" → $19 + /mo; "from $499" → from + $499 — one line, the number leads. */
function PriceValue({ price }: { price: string }) {
  const m = price.match(/^(from\s+)?(\$[\d,]+)(\/\w+)?$/i);
  if (!m) return <div className="price-value">{price}</div>;
  return (
    <div className="price-value">
      {m[1] && <span className="price-pre">{m[1].trim()}</span>}
      {m[2]}
      {m[3] && <span className="price-unit">{m[3]}</span>}
    </div>
  );
}

/* ── Final CTA ─────────────────────────────────────────────────────── */
function FinalCta() {
  const still = frame("hero");
  return (
    <section className="section final">
      {/* The closing frame: the film's master shot, held like an end title. */}
      <div className="final-frame" aria-hidden>
        {still ? (
          /* Plain <img>: a static still from public/frames. */
          <img src={still} alt="" className="art-fill still-fill" loading="lazy" />
        ) : (
          <MasterShot idPrefix="final" className="art-fill" />
        )}
      </div>
      <div className="container reveal">
        <div className="eyebrow">CINEFORGE / {new Date().getFullYear()}</div>
        <h2>
          Your story.<br />
          <em>your world.</em>
        </h2>
        <p>Enter the production system and build something worth watching.</p>
        <Link href="/create" className="primary">Enter the studio</Link>
        <Link href="/create/film" className="text-link">Or go straight to the Director’s Room →</Link>
      </div>
    </section>
  );
}

/* ── Footer ────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer>
      <div className="footer-brand">
        <Link href="/" className="logo">
          <span className="logo-mark" />
          CINEFORGE
        </Link>
        <span>The film production system.</span>
      </div>
      <nav className="footer-links" aria-label="Footer">
        <Link href="/create">Studio</Link>
        <Link href="/projects">Films</Link>
        <Link href="/library/voices">Voice</Link>
        <Link href="/publish">Publishing</Link>
        <Link href="/marketplace">Marketplace</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <div className="footer-legal">
        <a href="#top" className="footer-top">Back to top <i aria-hidden>↑</i></a>
        <span>© {new Date().getFullYear()} Cineforge</span>
      </div>
    </footer>
  );
}
