import { MasterShot } from "./MasterShot";

/*
 * Release — ONE FILM. EVERY SCREEN. Staged like product photography: an
 * ultra-thin wall-mounted cinema display as the hero, a large-format tablet
 * in three-quarter view as the secondary screen, a flagship phone carrying
 * the 9:16 vertical. The devices are engineered in HTML/CSS; the screens
 * carry only the film itself (a real still from public/frames when present,
 * otherwise the drawn master shot), reframed per screen. No UI on any screen.
 */

/**
 * Adaptive reframing — each screen gets its own composition, not a centre crop.
 * `view` is the reframe window in the 1600×900 master (drawn shot); `pos` and
 * `zoom` are the same intent for a real still (focal point + push-in).
 */
const FRAMES = {
  /* 16:9 — the cinematic master, untouched. */
  cinema: { view: "0 0 1600 900", pos: "50% 50%", zoom: 1 },
  /* 16:10 — push in: citadel centred, the queen held on the left third. */
  tablet: { view: "180 100 1280 800", pos: "50% 45%", zoom: 1.12 },
  /* 9:16 — a vertical built on the queen and her guard, not the centre. */
  mobile: { view: "160 250 360 640", pos: "21% 62%", zoom: 1.3 },
};

function Film({ still, id, frame }: { still?: string; id: string; frame: keyof typeof FRAMES }) {
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

export function ReleaseScreens({ still }: { still?: string }) {
  return (
    <figure className="release-showcase">
      <div className="release-stage" role="img" aria-label="The same film on a wall-mounted cinema display at 16:9, a tablet at 16:10 and a phone at 9:16">
        {/* Cinema display — the hero */}
        <div className="dv-tv" aria-hidden>
          <div className="dv-tv-glow">
            <Film still={still} id="rs-g" frame="cinema" />
          </div>
          <div className="dv-metal dv-tv-metal">
            <div className="dv-bezel dv-tv-bezel">
              <div className="dv-screen dv-tv-screen">
                <Film still={still} id="rs-a" frame="cinema" />
                <span className="dv-glass" />
              </div>
            </div>
          </div>
        </div>

        {/* Tablet — the secondary cinema screen */}
        <div className="dv-tablet" aria-hidden>
          <span className="dv-contact" />
          <div className="dv-tilt dv-tablet-tilt">
            <div className="dv-metal dv-tablet-metal">
              <div className="dv-bezel dv-tablet-bezel">
                <span className="dv-tablet-cam" />
                <div className="dv-screen dv-tablet-screen">
                  <Film still={still} id="rs-b" frame="tablet" />
                  <span className="dv-glass" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phone — the vertical cut */}
        <div className="dv-phone" aria-hidden>
          <span className="dv-contact" />
          <div className="dv-tilt dv-phone-tilt">
            <div className="dv-metal dv-phone-metal">
              <div className="dv-bezel dv-phone-bezel">
                <div className="dv-screen dv-phone-screen">
                  <Film still={still} id="rs-c" frame="mobile" />
                  <span className="dv-island" />
                  <span className="dv-glass" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="release-caption">
        <span>Cinema <i>16:9</i></span>
        <span>Tablet <i>16:10</i></span>
        <span>Mobile <i>9:16</i></span>
      </figcaption>
    </figure>
  );
}
