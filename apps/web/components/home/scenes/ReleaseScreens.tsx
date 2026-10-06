import { MasterShot } from "./MasterShot";

/*
 * Release chapter — one film, every screen. The master shot reframed for
 * each destination: the 16:9 master, a 1:1 feed cut that holds the citadel,
 * and a 9:16 vertical that reframes onto the queen. The same frame is reused
 * on purpose here: the point is that it is one film.
 */
export function ReleaseScreens() {
  return (
    <div className="release-stage" aria-label="One master shot delivered as 16:9, 1:1 and 9:16">
      <figure className="rs-screen rs-master">
        <MasterShot idPrefix="rs-a" className="rs-art" />
        <figcaption>16:9 · 4K master</figcaption>
      </figure>
      <figure className="rs-screen rs-square">
        <MasterShot idPrefix="rs-b" className="rs-art" focus="xMaxYMid" />
        <figcaption>1:1 · Feed</figcaption>
      </figure>
      <figure className="rs-screen rs-phone">
        <MasterShot idPrefix="rs-c" className="rs-art" focus="xMinYMid" />
        <span className="rs-sub">Our queen returns.</span>
        <figcaption>9:16</figcaption>
      </figure>
    </div>
  );
}
