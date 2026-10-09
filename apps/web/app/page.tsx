import type { Metadata } from "next";
import Link from "next/link";
import "./home.css";
import { HomeMotion } from "../components/home/HomeMotion";
import { HomeShowreel } from "../components/home/HomeShowreel";
import { HeroFrame } from "../components/home/HeroFrame";
import { WorkspacePreview } from "../components/home/WorkspacePreview";
import { CinemaArt, type Scene } from "../components/cf/CinemaArt";
import { ClockIcon, ConfigCard, EngineIcon, FormatIcon } from "../components/cf/ConfigCard";
import { MasterShot } from "../components/home/scenes/MasterShot";
import { WorldAtlas } from "../components/home/scenes/WorldAtlas";
import { StoryCloseUp } from "../components/home/scenes/StoryCloseUp";
import { ReleaseScreens } from "../components/home/scenes/ReleaseScreens";
import { VoicePresenter } from "../components/home/scenes/VoicePresenter";
import { AssetVisual } from "../components/home/scenes/AssetVisual";
import { STUDIO_MODES } from "../lib/creation";
import { frame } from "../lib/frames";
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
 */

export const metadata: Metadata = {
  title: { absolute: "Cineforge — The Film Production System" },
};

const LANGUAGES = [
  "English", "Français", "Español", "Deutsch", "中文", "Русский", "العربية", "हिन्दी", "Kiswahili", "Yorùbá",
  "Igbo", "Lingála", "Luganda", "isiZulu", "Naijá Pidgin", "Norsk", "Svenska", "Português", "日本語", "한국어",
];

const CHANNEL_FORMAT: Record<(typeof SOCIAL_CHANNELS)[number]["kind"], string> = {
  video: "16:9",
  short: "9:16",
  post: "Multiple",
};

const navSection = (title: string) => NAV.find((s) => s.title === title)?.items ?? [];

export default function Home() {
  return (
    <div className="cfh">
      <HomeMotion />
      <Nav />
      <main>
        <Hero />
        <Metrics />
        <Manifesto />
        <WorldChapter />
        <Workspace />
        <StoryChapter />
        <Capabilities />
        <Languages />
        <Showreel />
        <Publish />
        <Voice />
        <Marketplace />
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
        <a href="#studio">Studio</a>
        <a href="#capabilities">Capabilities</a>
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
            <a href="#studio">Studio</a>
            <a href="#capabilities">Capabilities</a>
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
  return (
    <section className="hero">
      <div className="hero-image" />
      <HeroFrame masterStill={frame("hero")} />

      <div className="hero-content">
        <div className="eyebrow hero-kicker">The film production system / 01</div>

        <h1 className="hero-title">
          MAKE<br />
          <em>worlds.</em>
        </h1>

        <p className="hero-description">
          Cineforge is a complete production environment for creating films, series, trailers, adverts,
          shorts and music videos — from the first idea to the finished release.
        </p>

        <div className="hero-actions">
          <Link href="/create" className="primary">Enter the Studio</Link>
          <a href="#films" className="text-link">Watch the work →</a>
        </div>
      </div>

      <a href="#studio" className="hero-scroll" aria-label="Scroll to the studio" />

      <div className="hero-bottom">
        <span>{IDEA_TO_AUDIENCE.join(" / ")}</span>
        <span>© {new Date().getFullYear()} Cineforge</span>
      </div>
    </section>
  );
}

/* ── Metrics — figures the system itself backs ─────────────────────── */
function Metrics() {
  const items: [string, string][] = [
    [String(LANGUAGES.length), "languages dubbed"],
    [String(SOCIAL_CHANNELS.length), "publish channels"],
    [String(STUDIO_MODES.length), "ways to start a film"],
    ["1080p", "adaptive HLS streaming"],
  ];
  return (
    <section className="metrics" aria-label="Cineforge in numbers">
      {items.map(([v, k]) => (
        <div key={k} className="metric">
          <div className="metric-value">{v}</div>
          <div className="metric-label">{k}</div>
        </div>
      ))}
    </section>
  );
}

/* ── Manifesto ─────────────────────────────────────────────────────── */
function Manifesto() {
  return (
    <section className="section manifesto">
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
  return (
    <section className="section chapter dark">
      <div className="container chapter-grid reveal">
        <div className="chapter-image chapter-atlas">
          <i className="cfh-grain cf-grain" aria-hidden />
          {frame("world") ? (
            <>
              {/* Plain <img>: a static still from public/frames. */}
              <img src={frame("world")} alt="Aerial establishing shot of the realm at dusk: river delta, red dunes, highland forest and the distant citadel" className="art-fill still-fill" loading="lazy" />
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
  return (
    <section className="section workspace" id="studio">
      <div className="container">
        <div className="workspace-head reveal">
          <div>
            <div className="eyebrow">02 / PRODUCTION</div>
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
                          <CinemaArt seed={p.title} scene={p.scene} className="h-full w-full" />
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
                  <WorkspacePreview />
                </div>
              </div>
            </div>

            <div className="pipeline">
              {IDEA_TO_AUDIENCE.map((step, i) => (
                <span key={step}>
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
  return (
    <section className="section chapter dark">
      <div className="container chapter-grid reveal">
        <div className="chapter-copy">
          <div className="chapter-number">03 / STORY</div>

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
          {frame("story") ? (
            <>
              <img src={frame("story")} alt="Close-up: Amara in profile, firelit, in a burnt-orange gele" className="art-fill still-fill" loading="lazy" />
              <span className="still-slate" aria-hidden>CU · AMARA<br /><small>SC 12 · TK 3 · 85MM</small></span>
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

/* ── The System · Capabilities ─────────────────────────────────────── */
const CAPABILITIES: { title: string; body: string; href: string; go: string }[] = [
  {
    title: "Create",
    body: "Turn an idea into a production. Develop scripts, characters, scenes, locations and shots inside the same creative environment.",
    href: "/create",
    go: "New production",
  },
  {
    title: "Direct",
    body: "Shape the visual language of the film. Review scenes, adjust shots, replace material and guide the production rather than simply generating isolated clips.",
    href: "/projects",
    go: "Your productions",
  },
  {
    title: "Perform",
    body: "Voices, narration, multilingual dialogue and presenters become part of the production rather than separate tools.",
    href: "/library/voices",
    go: "Voice Studio",
  },
  {
    title: "Finish",
    body: "Bring picture, sound, narration and scenes together into a finished cinematic cut — then publish it and earn from it.",
    href: "/publish",
    go: "Publish & monetize",
  },
];

function Capabilities() {
  return (
    <section className="section capabilities" id="capabilities">
      <div className="container">
        <div className="eyebrow reveal">The system</div>

        <div className="capability-track">
          {CAPABILITIES.map((c, i) => (
            <Link key={c.title} href={c.href} className="capability reveal">
              <div className="capability-number">{String(i + 1).padStart(2, "0")}</div>
              <h3>{c.title}</h3>
              <div>
                <p>{c.body}</p>
                <span className="capability-go">{c.go} →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Languages ─────────────────────────────────────────────────────── */
function Languages() {
  return (
    <div className="languages" aria-label={`${LANGUAGES.length} languages`}>
      <div className="language-track">
        {[...LANGUAGES, ...LANGUAGES].map((l, i) => (
          <span key={i} className="language" aria-hidden={i >= LANGUAGES.length}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── 04 · Showreel ─────────────────────────────────────────────────── */
function Showreel() {
  return (
    <section className="section showreel" id="films">
      <div className="container">
        <div className="showreel-header reveal">
          <div>
            <div className="eyebrow">04 / THE WORK</div>
            <h2>
              Made<br />
              <em>with Cineforge.</em>
            </h2>
          </div>
          <Link href="/publish/streaming" className="text-link">View complete showreel →</Link>
        </div>

        <HomeShowreel stills={(["work-1", "work-2", "work-3", "work-4", "work-5", "work-6"] as const).map((s) => frame(s))} />
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
          <div className="eyebrow">05 / RELEASE</div>
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
          <div className="eyebrow">06 / VOICE</div>
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
        <div className="pricing-header reveal">
          <div>
            <div className="eyebrow">ACCESS</div>
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
          YOUR STORY.<br />
          <em>YOUR WORLD.</em>
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
      <div className="footer-legal">© {new Date().getFullYear()} Cineforge</div>
    </footer>
  );
}
