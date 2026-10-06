"use client";

import { memo, useEffect, useRef, useState } from "react";
import { MasterShot } from "./MasterShot";
import { CinemaArt, type Scene } from "../../cf/CinemaArt";

/*
 * Release — one production, live on three screens, one stage each:
 *   TV      MAKE     the 16:9 master playing; a quiet playback OSD after each
 *                    cut, and faint guides showing where the other screens frame.
 *   Tablet  DIRECT   the director's instrument: the 16:10 preview, scene
 *                    metadata that follows the cut, storyboard with live status.
 *   Phone   RELEASE  the vertical cut, subtitles cycling through languages,
 *                    cloned narrator, playback, publishing destinations.
 * All three play the same shot at the same moment, each cropped around the
 * shot's subject (not the centre). Every element maps to a shipped capability:
 * storyboard + Continuity Engine, Voice Lab, localisation subtitles, social
 * launch kit/publishing, 4K export, 9:16 rendering. Reduced motion holds still.
 */

type Win = [number, number, number, number];
type Pt = [number, number];

/** The film's shots, as windows in the 1600×900 master, with their subjects. */
const SHOTS: {
  win: Win;
  /** Where each derived screen keeps its subject. */
  tablet: Pt;
  phone: Pt;
  camera: string;
  character: string;
  audio: string;
}[] = [
  { win: [0, 0, 1600, 900], tablet: [760, 470], phone: [335, 620], camera: "Wide · 24mm", character: "Amara · guard", audio: "Original score" },
  { win: [560, 120, 1000, 562.5], tablet: [1040, 360], phone: [1040, 340], camera: "Push-in · 50mm", character: "— establishing", audio: "Original score" },
  { win: [120, 410, 540, 303.75], tablet: [330, 600], phone: [340, 610], camera: "Close · 85mm", character: "Amara", audio: "Narrator · cloned" },
];
const SHOT_SEC = 6;

/** Crop a shot window to a screen aspect, keeping the subject in frame. */
function crop([x, y, w, h]: Win, aspect: number, [sx, sy]: Pt): Win {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  if (w / h > aspect) {
    const cw = h * aspect;
    return [clamp(sx - cw / 2, x, x + w - cw), y, cw, h];
  }
  const ch = w / aspect;
  return [x, clamp(sy - ch / 2, y, y + h - ch), w, ch];
}

const TABLET_ASPECT = 1.6;
const PHONE_ASPECT = 9 / 19.5;

/** The film in a crop window: the drawn master, or a real still positioned to the same window. */
const Film = memo(function Film({ still, id, view }: { still?: string; id: string; view: Win }) {
  const [x, y, w, h] = view;
  if (still)
    return (
      <span className="rs-art rs-still-box">
        <img
          src={still}
          alt=""
          loading="lazy"
          style={{ width: `${(1600 / w) * 100}%`, height: `${(900 / h) * 100}%`, left: `${(-x / w) * 100}%`, top: `${(-y / h) * 100}%` }}
        />
      </span>
    );
  return <MasterShot idPrefix={id} className="rs-art" view={view.join(" ")} />;
});

const BOARD: { n: string; scene: Scene }[] = [
  { n: "03", scene: "savannah" },
  { n: "04", scene: "interior" },
  { n: "05", scene: "figure" },
  { n: "06", scene: "interior" },
  { n: "07", scene: "kingdom" },
  { n: "08", scene: "sea" },
];

const LINES = [
  { code: "EN", text: "Our queen has returned." },
  { code: "FR", text: "Notre reine est revenue." },
  { code: "ES", text: "Nuestra reina ha vuelto." },
  { code: "SW", text: "Malkia wetu amerudi." },
  { code: "YO", text: "Ayaba wa ti padà dé." },
];
const PLATFORMS = ["YT", "TT", "IG", "FB", "X"];

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/* OS status glyphs — what a real device shows, nothing more. */
const Signal = () => (
  <svg viewBox="0 0 16 10" className="os-ico">
    {[0, 1, 2, 3].map((k) => (
      <rect key={k} x={k * 4} y={8 - k * 2.4} width="3" height={2 + k * 2.4} rx="0.6" fill="currentColor" opacity={k < 3 ? 1 : 0.35} />
    ))}
  </svg>
);
const Wifi = () => (
  <svg viewBox="0 0 14 10" className="os-ico" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M1 3.6a9 9 0 0 1 12 0M3.2 5.9a5.8 5.8 0 0 1 7.6 0" />
    <circle cx="7" cy="8.4" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
const Battery = ({ pct }: { pct: number }) => (
  <span className="os-batt">
    {pct}
    <svg viewBox="0 0 22 10" className="os-ico os-batt-ico">
      <rect x="0.6" y="0.6" width="18" height="8.8" rx="2.4" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.1" />
      <rect x="2" y="2" width={15.2 * (pct / 100)} height="6" rx="1.4" fill="currentColor" />
      <rect x="19.6" y="3.4" width="1.6" height="3.2" rx="0.8" fill="currentColor" fillOpacity="0.5" />
    </svg>
  </span>
);

/** Seconds of playback while the showcase is on screen (0 and frozen under reduced motion). */
function usePlayhead(ref: React.RefObject<HTMLElement>) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !timer) timer = setInterval(() => setT((v) => v + 1), 1000);
      else if (!e?.isIntersecting && timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, [ref]);
  return t;
}

/** The device clock — real local time once mounted (9:41 until then, so SSR matches). */
function useClock() {
  const [now, setNow] = useState("9:41");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, ""));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** A very slight parallax: the frames drift a few pixels as the page moves. */
function useParallax(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      el.style.setProperty("--px", Math.max(-1, Math.min(1, p)).toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}

export function ReleaseScreens({ still }: { still?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const t = usePlayhead(stage);
  const clock = useClock();
  useParallax(stage);

  const shotIx = Math.floor(t / SHOT_SEC) % SHOTS.length;
  const intoShot = t % SHOT_SEC;
  const shot = SHOTS[shotIx]!;
  const tv = shot.win;
  const tab = crop(shot.win, TABLET_ASPECT, shot.tablet);
  const ph = crop(shot.win, PHONE_ASPECT, shot.phone);
  const line = LINES[Math.floor(t / 3) % LINES.length]!;
  const tvTime = 84 + (t % 438);
  const phTime = (18 + t) % 30;
  const gen = (64 + t * 3) % 100;
  const guide = ([x, y, w, h]: Win) => ({
    left: `${((x - tv[0]) / tv[2]) * 100}%`,
    top: `${((y - tv[1]) / tv[3]) * 100}%`,
    width: `${(w / tv[2]) * 100}%`,
    height: `${(h / tv[3]) * 100}%`,
  });

  return (
    <figure className="release-showcase">
      <div
        ref={stage}
        className="release-stage"
        role="img"
        aria-label="One production playing on three screens: the 4K master on a cinema display, the director's view on a tablet with scene metadata and storyboard, and the vertical release on a phone with subtitles in five languages, cloned narration and publishing to five platforms"
      >
        {/* MAKE — the cinema master */}
        <div className="dv-tv" aria-hidden>
          <div className="dv-tv-glow">
            <Film still={still} id="rs-g" view={tv} />
          </div>
          <span className="dv-tv-depth" />
          <div className="dv-metal dv-tv-metal">
            <div className="dv-bezel dv-tv-bezel">
              <div className="dv-screen dv-tv-screen">
                <div className="rs-shot" key={`tv-${shotIx}`}>
                  <Film still={still} id="rs-a" view={tv} />
                </div>
                {/* Where the other screens frame this shot — shown briefly after each cut. */}
                <span className={`tv-guides${intoShot < 2 && t > 0 ? " is-on" : ""}`}>
                  <i className="g-tab" style={guide(tab)}>
                    <b>16:10</b>
                  </i>
                  <i className="g-ph" style={guide(ph)}>
                    <b>9:16</b>
                  </i>
                </span>
                <span className={`tv-osd${intoShot < 3 ? " is-on" : ""}`}>
                  <span className="tv-osd-fmt">16:9 · 4K HDR</span>
                  <span className="tv-osd-time">
                    <svg viewBox="0 0 10 10" className="os-ico">
                      <path d="M2.5 1.5v7l6-3.5z" fill="currentColor" />
                    </svg>
                    {mmss(tvTime)} / 08:42
                  </span>
                  <span className="tv-osd-bar">
                    <i style={{ width: `${(tvTime / 522) * 100}%` }} />
                  </span>
                </span>
                <span className="dv-glass" />
              </div>
            </div>
          </div>
        </div>

        {/* DIRECT — the production instrument */}
        <div className="dv-tablet" aria-hidden>
          <span className="dv-contact" />
          <div className="dv-tilt dv-tablet-tilt">
            <div className="dv-metal dv-tablet-metal">
              <span className="dv-edge dv-tablet-edge">
                <i className="grille" />
                <i className="mic" />
                <i className="usbc" />
                <i className="grille" />
              </span>
              <span className="dv-key dv-tablet-power" />
              <span className="dv-key dv-tablet-vol" />
              <span className="dv-break dv-tablet-break-a" />
              <span className="dv-break dv-tablet-break-b" />
              <div className="dv-bezel dv-tablet-bezel">
                <span className="dv-tablet-cam" />
                <div className="dv-screen dv-tablet-screen">
                  <div className="dt">
                    <div className="os-status dt-os">
                      <span>{clock}</span>
                      <span className="os-right">
                        <Wifi />
                        <Battery pct={78} />
                      </span>
                    </div>
                    <header className="dt-head">
                      <span className="dt-title">
                        Ashéron-Kor <small>Director</small>
                      </span>
                      <span className="dt-status">
                        <i /> Scene 08 · generating {gen}%
                      </span>
                    </header>

                    <div className="dt-preview">
                      <div className="rs-shot" key={`tab-${shotIx}`}>
                        <Film still={still} id="rs-b" view={tab} />
                      </div>
                      <span className="dt-cam">16:10</span>
                      <span className="dt-slate">SC 07 · {mmss(tvTime)}</span>
                    </div>

                    <dl className="dt-side">
                      {[
                        ["Scene", "07 · Ext. dawn"],
                        ["World", "Ashéron-Kor"],
                        ["Character", shot.character],
                        ["Camera", shot.camera],
                        ["Audio", shot.audio],
                        ["Continuity", "92 · bridge in"],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd key={v}>{v}</dd>
                        </div>
                      ))}
                    </dl>

                    <div className="dt-board">
                      {BOARD.map((b) => (
                        <span key={b.n} className={`dt-shot ${b.n === "07" ? "is-sel" : b.n === "08" ? "is-live" : "is-ready"}`}>
                          <CinemaArt seed={`board ${b.n}`} scene={b.scene} className="art-fill" />
                          <b>{b.n}</b>
                          <i />
                          {b.n === "08" && (
                            <em className="dt-gen">
                              <u style={{ width: `${gen}%` }} />
                            </em>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="dv-glass" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RELEASE — vertical, subtitled, voiced, published */}
        <div className="dv-phone" aria-hidden>
          <span className="dv-contact" />
          <div className="dv-tilt dv-phone-tilt">
            <div className="dv-metal dv-phone-metal">
              <span className="dv-key dv-phone-action" />
              <span className="dv-key dv-phone-volup" />
              <span className="dv-key dv-phone-voldn" />
              <span className="dv-key dv-phone-power" />
              <span className="dv-key dv-phone-camctl" />
              <span className="dv-break dv-phone-break-a" />
              <span className="dv-break dv-phone-break-b" />
              <span className="dv-edge dv-phone-bottom">
                <i className="holes" />
                <i className="usbc" />
                <i className="holes" />
              </span>
              <div className="dv-bezel dv-phone-bezel">
                <span className="dv-earpiece" />
                <div className="dv-screen dv-phone-screen">
                  <div className="rs-shot" key={`ph-${shotIx}`}>
                    <Film still={still} id="rs-c" view={ph} />
                  </div>
                  <span className="dv-island">
                    <i />
                  </span>
                  <div className="os-status dp-os">
                    <span>{clock}</span>
                    <span className="os-right">
                      <Signal />
                      <Wifi />
                      <Battery pct={86} />
                    </span>
                  </div>
                  <span className="dp-ready">
                    <i /> 9:16 · 1080p
                  </span>
                  <span className="dp-sub">
                    <span className="dp-sub-line" key={line.code}>
                      {line.text}
                    </span>
                    <small>{line.code} · subtitles</small>
                  </span>
                  <div className="dp-sheet">
                    <div className="dp-play">
                      <svg viewBox="0 0 10 10" className="os-ico">
                        <path d="M2.5 1.5v7l6-3.5z" fill="currentColor" />
                      </svg>
                      <span className="dp-bar">
                        <i style={{ width: `${(phTime / 30) * 100}%` }} />
                      </span>
                      <span className="dp-time">0:{String(phTime).padStart(2, "0")} / 0:30</span>
                    </div>
                    <div className="dp-langs">
                      {LINES.map((l) => (
                        <span key={l.code} className={l.code === line.code ? "is-on" : ""}>
                          {l.code}
                        </span>
                      ))}
                      <span className="dp-more">+15</span>
                    </div>
                    <div className="dp-voice">
                      <span className="dp-wave">
                        {Array.from({ length: 14 }).map((_, k) => (
                          <i key={k} style={{ height: `${30 + ((k * 37) % 70)}%` }} />
                        ))}
                      </span>
                      Narrator · cloned voice
                    </div>
                    <div className="dp-platforms">
                      {PLATFORMS.map((p) => (
                        <span key={p}>{p}</span>
                      ))}
                      <em>Launch kit ready</em>
                    </div>
                    <span className="dp-cta">Release to 5 platforms</span>
                  </div>
                  <span className="dv-glass" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="release-caption">
        <span>
          Make <i>Cinema 16:9</i>
        </span>
        <span>
          Direct <i>Tablet 16:10</i>
        </span>
        <span>
          Release <i>Mobile 9:16</i>
        </span>
      </figcaption>
    </figure>
  );
}
