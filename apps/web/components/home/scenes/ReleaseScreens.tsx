import { MasterShot } from "./MasterShot";
import { CinemaArt, type Scene } from "../../cf/CinemaArt";

/*
 * Release — the devices as proof of what CineForge does, one stage each:
 *   TV      MAKE     the finished 4K cinema master — pure film.
 *   Tablet  DIRECT   the director's instrument: scene preview, storyboard with
 *                    live production status, continuity (score, anchored
 *                    character and world, the bridge in), camera plan, voice.
 *   Phone   RELEASE  the vertical cut with translated subtitles, the cloned
 *                    narrator, the per-platform launch kit and posting.
 * Every element maps to a shipped capability (storyboard + Continuity Engine,
 * Voice Lab, localisation subtitles, social launch kit/publishing, 4K
 * upscale). Nothing here claims dubbing or automatic reframing.
 */

type Frame = "cinema" | "tablet" | "mobile";

/** Per-screen compositions in the 1600×900 master (drawn) / focal point + push-in (real still). */
const FRAMES: Record<Frame, { view: string; pos: string; zoom: number }> = {
  cinema: { view: "0 0 1600 900", pos: "50% 50%", zoom: 1 },
  tablet: { view: "380 120 1100 690", pos: "62% 45%", zoom: 1.25 },
  mobile: { view: "160 250 360 640", pos: "21% 62%", zoom: 1.3 },
};

function Film({ still, id, frame }: { still?: string; id: string; frame: Frame }) {
  const f = FRAMES[frame];
  if (still)
    return (
      <img
        src={still}
        alt=""
        className="rs-art still-fill"
        style={{ objectPosition: f.pos, transform: `scale(${f.zoom})`, transformOrigin: f.pos }}
        loading="lazy"
      />
    );
  return <MasterShot idPrefix={id} className="rs-art" view={f.view} />;
}

/** The storyboard strip on the tablet — scene statuses as the pipeline reports them. */
const BOARD: { n: string; scene: Scene; status: "ready" | "live" | "queued" }[] = [
  { n: "03", scene: "savannah", status: "ready" },
  { n: "04", scene: "interior", status: "ready" },
  { n: "05", scene: "figure", status: "ready" },
  { n: "06", scene: "interior", status: "ready" },
  { n: "07", scene: "kingdom", status: "live" },
  { n: "08", scene: "sea", status: "queued" },
];

const PLATFORMS = ["YT", "TT", "IG", "FB", "X"];

/** OS status glyphs — what a real device shows, nothing more. */
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
const LANGS = ["EN", "YO", "SW", "FR", "ES"];

export function ReleaseScreens({ still }: { still?: string }) {
  return (
    <figure className="release-showcase">
      <div
        className="release-stage"
        role="img"
        aria-label="Make, direct, release: the 4K cinema master on a display; the director's view on a tablet with storyboard, production status and continuity; the vertical release on a phone with subtitles, cloned narration and publishing to five platforms"
      >
        {/* MAKE — the cinema master */}
        <div className="dv-tv" aria-hidden>
          <div className="dv-tv-glow">
            <Film still={still} id="rs-g" frame="cinema" />
          </div>
          <span className="dv-tv-depth" />
          <div className="dv-metal dv-tv-metal">
            <div className="dv-bezel dv-tv-bezel">
              <div className="dv-screen dv-tv-screen">
                <Film still={still} id="rs-a" frame="cinema" />
                <span className="tv-mark">4K · Master</span>
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
              {/* Visible short edge: speaker grilles, microphone, USB-C. */}
              <span className="dv-edge dv-tablet-edge">
                <i className="grille" />
                <i className="mic" />
                <i className="usbc" />
                <i className="grille" />
              </span>
              {/* Top edge: power and volume keys, antenna breaks. */}
              <span className="dv-key dv-tablet-power" />
              <span className="dv-key dv-tablet-vol" />
              <span className="dv-break dv-tablet-break-a" />
              <span className="dv-break dv-tablet-break-b" />
              <div className="dv-bezel dv-tablet-bezel">
                <span className="dv-tablet-cam" />
                <div className="dv-screen dv-tablet-screen">
                  <div className="dt">
                    <div className="os-status dt-os">
                      <span>10:24</span>
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
                        <i /> Scene 07 · generating
                      </span>
                    </header>

                    <div className="dt-preview">
                      <Film still={still} id="rs-b" frame="tablet" />
                      <span className="dt-cam">Wide · slow push-in</span>
                      <span className="dt-slate">SC 07 · EXT. ASHÉRON-KOR · DAWN</span>
                    </div>

                    <aside className="dt-side">
                      <div className="dt-score">
                        <svg viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.5" className="dt-ring-bg" />
                          <circle cx="18" cy="18" r="15.5" className="dt-ring" strokeDasharray="89.6 97.4" />
                        </svg>
                        <span className="dt-score-n">92</span>
                        <span className="dt-score-l">Continuity</span>
                      </div>
                      <dl className="dt-rows">
                        <div>
                          <dt>Character</dt>
                          <dd>Amara · anchored</dd>
                        </div>
                        <div>
                          <dt>World</dt>
                          <dd>Ashéron-Kor · anchored</dd>
                        </div>
                        <div>
                          <dt>Bridge in</dt>
                          <dd>After the siege</dd>
                        </div>
                        <div>
                          <dt>Voice</dt>
                          <dd>Narrator · cloned</dd>
                        </div>
                      </dl>
                    </aside>

                    <div className="dt-board">
                      {BOARD.map((b) => (
                        <span key={b.n} className={`dt-shot is-${b.status}`}>
                          <CinemaArt seed={`board ${b.n}`} scene={b.scene} className="art-fill" />
                          <b>{b.n}</b>
                          <i />
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

        {/* RELEASE — vertical, subtitled, voiced, launched */}
        <div className="dv-phone" aria-hidden>
          <span className="dv-contact" />
          <div className="dv-tilt dv-phone-tilt">
            <div className="dv-metal dv-phone-metal">
              {/* Left: action button, volume up/down. Right: power, camera control. */}
              <span className="dv-key dv-phone-action" />
              <span className="dv-key dv-phone-volup" />
              <span className="dv-key dv-phone-voldn" />
              <span className="dv-key dv-phone-power" />
              <span className="dv-key dv-phone-camctl" />
              {/* Antenna breaks in the band. */}
              <span className="dv-break dv-phone-break-a" />
              <span className="dv-break dv-phone-break-b" />
              {/* Bottom edge: speaker, USB-C, microphone. */}
              <span className="dv-edge dv-phone-bottom">
                <i className="holes" />
                <i className="usbc" />
                <i className="holes" />
              </span>
              <div className="dv-bezel dv-phone-bezel">
                <span className="dv-earpiece" />
                <div className="dv-screen dv-phone-screen">
                  <Film still={still} id="rs-c" frame="mobile" />
                  <span className="dv-island">
                    <i />
                  </span>
                  <div className="os-status dp-os">
                    <span>9:41</span>
                    <span className="os-right">
                      <Signal />
                      <Wifi />
                      <Battery pct={86} />
                    </span>
                  </div>
                  <span className="dp-ready">
                    <i /> 9:16 · Ready
                  </span>
                  <span className="dp-sub">
                    Ayaba wa ti padà dé.
                    <small>YO · subtitles</small>
                  </span>
                  <div className="dp-sheet">
                    <div className="dp-play">
                      <svg viewBox="0 0 10 10" className="os-ico">
                        <path d="M2.5 1.5v7l6-3.5z" fill="currentColor" />
                      </svg>
                      <span className="dp-bar">
                        <i />
                      </span>
                      <span className="dp-time">0:14 / 0:30</span>
                    </div>
                    <div className="dp-langs">
                      {LANGS.map((l) => (
                        <span key={l} className={l === "YO" ? "is-on" : ""}>
                          {l}
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
