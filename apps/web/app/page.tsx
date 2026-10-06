import type { Metadata } from "next";
import Link from "next/link";
import "./home.css";
import { HomeMotion } from "../components/home/HomeMotion";
import { HomeShowreel } from "../components/home/HomeShowreel";
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
 * Layout and containers follow preview(12).html exactly (styles in ./home.css,
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
        <Link href="/create/film" className="nav-cta">Enter Studio</Link>
      </div>
    </nav>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="hero">
      <div className="hero-image" />

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
          <Link href="/create/film" className="primary">Enter the Studio</Link>
          <a href="#films" className="text-link">Watch the work →</a>
        </div>
      </div>

      <div className="hero-bottom">
        <span>{IDEA_TO_AUDIENCE.join(" / ")}</span>
        <span>© {new Date().getFullYear()} Cineforge</span>
      </div>
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
        <div className="chapter-image" data-frame="CINEFORGE / FRAME 001" />

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

          <div className="studio-main">
            <div className="scene">
              <div className="scene-label">SCENE 07 / EXT. ASHÉRON-KOR / DAWN</div>
              <div className="playhead" />
              <div className="timeline">
                <div className="clip" />
                <div className="clip" />
                <div className="clip" />
                <div className="clip" />
                <div className="clip" />
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
              ["Lighting", "Dawn"],
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

        <div className="chapter-image" data-frame="CINEFORGE / FRAME 002" />
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
    go: "Create anything",
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
    go: "Voice Lab",
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
        <div style={{ height: 55 }} />

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

        <HomeShowreel />
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
          <div style={{ height: 35 }} />
          <h2>
            One film.<br />
            <em>Every screen.</em>
          </h2>
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
          </div>

          <Link href="/publish" className="text-link">Set up publishing →</Link>
        </div>
      </div>
    </section>
  );
}

/* ── 06 · Voice ────────────────────────────────────────────────────── */
const VOICE_FEATURES: [string, string][] = [
  ["Clone your voice", "Voice Lab"],
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
          <div style={{ height: 35 }} />
          <h2>
            Give the<br />
            story a<br />
            <em>voice.</em>
          </h2>
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

          <div className="voice-wave" aria-hidden>
            {Array.from({ length: 21 }).map((_, i) => (
              <span key={i} style={{ animationDelay: `${(i % 7) * 0.09}s` }} />
            ))}
          </div>

          <div className="channel-list">
            {VOICE_FEATURES.map(([title, chip]) => (
              <div key={title} className="channel">
                <span>{title}</span>
                <span>{chip}</span>
              </div>
            ))}
          </div>

          <Link href="/library/voices" className="text-link">Open the Voice Lab →</Link>
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
            <div style={{ height: 25 }} />
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
                {t.highlight && <span className="price-flag">Most chosen</span>}
              </div>
              <div className="price-value">{t.price}</div>
              <div className="price-description">{t.tagline}</div>
              <ul>
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link href="/pricing" className="price-cta">
                {t.tier === "Enterprise" ? "Talk to us" : t.tier === "Free" ? "Start free" : `Go ${t.tier}`}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ─────────────────────────────────────────────────────── */
function FinalCta() {
  return (
    <section className="section final">
      <div className="container reveal">
        <div className="eyebrow">CINEFORGE / {new Date().getFullYear()}</div>
        <div style={{ height: 40 }} />
        <h2>
          YOUR STORY.<br />
          <em>YOUR WORLD.</em>
        </h2>
        <p>Enter the production system and build something worth watching.</p>
        <Link href="/create/film" className="primary">Enter Cineforge</Link>
        <Link href="/create" className="text-link">See all the ways to start →</Link>
      </div>
    </section>
  );
}

/* ── Footer ────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer>
      <div>© {new Date().getFullYear()} Cineforge</div>
      <div className="footer-links">
        <Link href="/create/film">Studio</Link>
        <Link href="/projects">Films</Link>
        <Link href="/library/voices">Voice</Link>
        <Link href="/publish">Publishing</Link>
        <Link href="/marketplace">Marketplace</Link>
        <Link href="/pricing">Pricing</Link>
        <a href="https://github.com/ICOFCUCAM/media">Code</a>
      </div>
    </footer>
  );
}
