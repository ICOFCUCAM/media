import { MasterShot } from "./MasterShot";

/*
 * Release chapter — one film, every screen. The master shot reframed for
 * each destination: the 16:9 master, a 1:1 feed cut that holds the citadel,
 * and a 9:16 vertical that reframes onto the queen. The same frame is reused
 * on purpose here: the point is that it is one film.
 */
/** The master as a real still (cropped by object-position) or the drawn shot. */
function Master({ still, id, focus, pos }: { still?: string; id: string; focus?: "xMidYMid" | "xMinYMid" | "xMaxYMid"; pos: string }) {
  if (still) return <img src={still} alt="" className="rs-art still-fill" style={{ objectPosition: pos }} loading="lazy" />;
  return <MasterShot idPrefix={id} className="rs-art" focus={focus} />;
}

export function ReleaseScreens({ still }: { still?: string }) {
  return (
    <div className="release-stage" aria-label="One master shot delivered as 16:9, 1:1 and 9:16">
      <figure className="rs-screen rs-master">
        <Master still={still} id="rs-a" pos="50% 50%" />
        <span className="rs-reframe" aria-hidden><i>Reframing 16:9 → 9:16</i></span>
        <figcaption>16:9 · 4K master</figcaption>
      </figure>
      <figure className="rs-screen rs-square">
        <Master still={still} id="rs-b" focus="xMaxYMid" pos="70% 50%" />
        <figcaption>1:1 · Feed</figcaption>
      </figure>
      <figure className="rs-screen rs-phone">
        <Master still={still} id="rs-c" focus="xMinYMid" pos="18% 50%" />
        <span className="rs-sub">Our queen returns.</span>
        <figcaption>9:16</figcaption>
      </figure>
    </div>
  );
}
