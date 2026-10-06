import { MasterShot } from "./MasterShot";

/*
 * Release — ONE FILM. EVERY SCREEN. Staged like product photography: an
 * ultra-thin wall-mounted cinema display as the hero, a large-format tablet
 * in three-quarter view as the secondary screen, a flagship phone carrying
 * the 9:16 vertical. The devices are engineered in HTML/CSS; the screens
 * carry only the film itself (a real still from public/frames when present,
 * otherwise the drawn master shot), reframed per screen. No UI on any screen.
 */

/** The film, cropped for a screen: a real still via object-position, or the drawn shot. */
function Film({ still, id, focus, pos }: { still?: string; id: string; focus?: "xMidYMid" | "xMinYMid" | "xMaxYMid"; pos: string }) {
  if (still) return <img src={still} alt="" className="rs-art still-fill" style={{ objectPosition: pos }} loading="lazy" />;
  return <MasterShot idPrefix={id} className="rs-art" focus={focus} />;
}

export function ReleaseScreens({ still }: { still?: string }) {
  return (
    <figure className="release-showcase">
      <div className="release-stage" role="img" aria-label="The same film on a wall-mounted cinema display at 16:9, a tablet at 16:10 and a phone at 9:16">
        {/* Cinema display — the hero */}
        <div className="dv-tv" aria-hidden>
          <div className="dv-tv-glow">
            <Film still={still} id="rs-g" pos="50% 50%" />
          </div>
          <div className="dv-metal dv-tv-metal">
            <div className="dv-bezel dv-tv-bezel">
              <div className="dv-screen dv-tv-screen">
                <Film still={still} id="rs-a" pos="50% 50%" />
                <span className="dv-glass" />
              </div>
            </div>
          </div>
        </div>

        {/* Tablet — the secondary cinema screen */}
        <div className="dv-tablet" aria-hidden>
          <span className="dv-floor-shadow" />
          <div className="dv-tilt dv-tablet-tilt">
            <div className="dv-metal dv-tablet-metal">
              <div className="dv-bezel dv-tablet-bezel">
                <span className="dv-tablet-cam" />
                <div className="dv-screen dv-tablet-screen">
                  <Film still={still} id="rs-b" focus="xMaxYMid" pos="62% 50%" />
                  <span className="dv-glass" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phone — the vertical cut */}
        <div className="dv-phone" aria-hidden>
          <span className="dv-floor-shadow" />
          <div className="dv-tilt dv-phone-tilt">
            <div className="dv-metal dv-phone-metal">
              <div className="dv-bezel dv-phone-bezel">
                <div className="dv-screen dv-phone-screen">
                  <Film still={still} id="rs-c" focus="xMinYMid" pos="18% 50%" />
                  <span className="dv-island" />
                  <span className="dv-glass" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="release-caption">
        <span>Cinema · 16:9</span>
        <span>Tablet · 16:10</span>
        <span>Mobile · 9:16</span>
      </figcaption>
    </figure>
  );
}
