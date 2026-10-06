import { MasterShot } from "./MasterShot";

/*
 * Release chapter — one film, every screen, on real hardware: the 16:9
 * master on a television in a streaming player, the 1:1 cut-down in a feed
 * post on a tablet, the 9:16 vertical as a reel on a phone. The same frame
 * is reused on purpose: the point is that it is one film, reframed.
 */

/** The master as a real still (cropped by object-position) or the drawn shot. */
function Master({ still, id, focus, pos }: { still?: string; id: string; focus?: "xMidYMid" | "xMinYMid" | "xMaxYMid"; pos: string }) {
  if (still) return <img src={still} alt="" className="rs-art still-fill" style={{ objectPosition: pos }} loading="lazy" />;
  return <MasterShot idPrefix={id} className="rs-art" focus={focus} />;
}

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Heart = () => (
  <svg viewBox="0 0 24 24" {...icon}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </svg>
);
const Bubble = () => (
  <svg viewBox="0 0 24 24" {...icon}>
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" />
  </svg>
);
const Send = () => (
  <svg viewBox="0 0 24 24" {...icon}>
    <path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" />
  </svg>
);

export function ReleaseScreens({ still }: { still?: string }) {
  return (
    <div className="release-stage" aria-label="One master shot delivered to a television at 16:9, a tablet feed at 1:1 and a phone at 9:16">
      {/* Television — 16:9 master in a streaming player */}
      <figure className="dev dev-tv">
        <div className="dev-tv-panel">
          <div className="dev-screen">
            <Master still={still} id="rs-a" pos="50% 50%" />
            <span className="rs-reframe" aria-hidden>
              <i>Reframing 16:9 → 9:16</i>
            </span>
            <div className="tv-ui" aria-hidden>
              <span className="tv-badge">16:9 · 4K HDR</span>
              <div className="tv-bottom">
                <span className="tv-title">Ashéron-Kor</span>
                <span className="tv-meta">Drama · Episode 1 · Dolby Atmos</span>
                <span className="tv-bar">
                  <i />
                </span>
              </div>
            </div>
          </div>
          <span className="dev-tv-logo" aria-hidden />
        </div>
        <span className="dev-tv-neck" aria-hidden />
        <span className="dev-tv-foot" aria-hidden />
        <figcaption className="sr-only">Television, 16:9 master</figcaption>
      </figure>

      {/* Tablet — 1:1 cut-down in a feed */}
      <figure className="dev dev-tablet">
        <div className="dev-tablet-body">
          <span className="dev-cam" aria-hidden />
          <div className="dev-screen feed" aria-hidden>
            <div className="feed-head">
              <span className="feed-avatar" />
              <span className="feed-handle">
                ashéron.kor <small>1:1 · Feed</small>
              </span>
              <span className="feed-dots">•••</span>
            </div>
            <div className="feed-media">
              <Master still={still} id="rs-b" focus="xMaxYMid" pos="70% 50%" />
            </div>
            <div className="feed-actions">
              <Heart />
              <Bubble />
              <Send />
            </div>
            <span className="feed-caption">
              <b>ashéron.kor</b> The citadel wakes. Premiere Friday.
            </span>
            <span className="feed-line" />
            <span className="feed-line short" />
          </div>
        </div>
        <figcaption className="sr-only">Tablet, 1:1 feed post</figcaption>
      </figure>

      {/* Phone — 9:16 vertical reel */}
      <figure className="dev dev-phone">
        <div className="dev-phone-body">
          <div className="dev-screen reel-screen" aria-hidden>
            <Master still={still} id="rs-c" focus="xMinYMid" pos="18% 50%" />
            <div className="ph-status">
              <span>9:41</span>
              <span className="ph-icons">
                <i />
                <i />
                <i />
              </span>
            </div>
            <span className="ph-island" />
            <span className="ph-tag">9:16</span>
            <div className="ph-rail">
              <Heart />
              <Bubble />
              <Send />
            </div>
            <div className="ph-bottom">
              <span className="ph-handle">@asheron.kor</span>
              <span className="ph-caption">Our queen returns.</span>
              <span className="ph-music">♪ Original score</span>
            </div>
          </div>
        </div>
        <figcaption className="sr-only">Phone, 9:16 vertical reel</figcaption>
      </figure>
    </div>
  );
}
