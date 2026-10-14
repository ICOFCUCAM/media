"use client";

import { useEffect, useState } from "react";
import { CinemaArt, type Scene } from "../cf/CinemaArt";
import { MasterShot } from "./scenes/MasterShot";
import { heroFilm, listShowcase, publicUrl, type ShowcaseRow } from "../../lib/showcase";

/**
 * The hero's living frame: a film visibly becoming a film. When admins have
 * featured a real film it plays here (muted, looped) and says so; otherwise
 * the frame walks the production path — prompt, storyboard, generation, final
 * cut — on the signature master shot. Reduced motion holds the finished frame.
 */

/** The signature master shot's slate — one shot, held through the whole path. */
const SHOT = { slug: "EXT. ASHÉRON-KOR — DAWN", meta: "Day 1 · 06:12 · 35mm · f/2.8", number: "SHOT 01 / 28" };

/** Scenes the storyboard tiles cycle through. */
const BOARD: Scene[] = ["figure", "interior", "kingdom"];
/** What the three stills are, as a script supervisor would slate them. */
const STRIP = ["SC 04 · The ridge", "SC 11 · Hall of pillars", "SC 19 · Twin suns"];

const PROMPT = "An epic about an African kingdom fighting for its independence, told over three generations.";
const STAGES = ["Prompt", "Storyboard", "Generation", "Final cut"] as const;
// How long each stage holds, in ms.
const HOLD = [1800, 1300, 1600, 2600];

/**
 * `wideStill` is the master still with soft extensions on both sides (left 25 %,
 * right 6 % of its width): the frame shows exactly the master still and the
 * picture carries on past its edges into the dark.
 */
export function HeroFrame({ masterStill, wideStill, thumbs = [] }: { masterStill?: string; wideStill?: string; thumbs?: (string | undefined)[] }) {
  const [real, setReal] = useState<ShowcaseRow | null>(null);
  const [stage, setStage] = useState(3);
  const [typed, setTyped] = useState(PROMPT.length);
  const [still, setStill] = useState(true);

  useEffect(() => {
    void listShowcase(20).then((rows) => { const r = heroFilm(rows); if (r) setReal(r); });
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Walk the production path on the master shot.
  useEffect(() => {
    if (still || real) return;
    const t = setTimeout(() => {
      if (stage === 3) {
        setTyped(0);
        setStage(0);
      } else setStage(stage + 1);
    }, HOLD[stage]);
    return () => clearTimeout(t);
  }, [stage, still, real]);

  // Type the prompt during the first stage.
  useEffect(() => {
    if (stage !== 0 || typed >= PROMPT.length) return;
    const t = setTimeout(() => setTyped((n) => Math.min(PROMPT.length, n + 3)), 28);
    return () => clearTimeout(t);
  }, [stage, typed]);

  const at = real ? 3 : stage;
  const resolving = !real && at === 2;
  const shown = real || at >= 2;

  return (
    <div className="hero-stage" aria-label="A film becoming a film">
      <div className="hero-frame-wrap">
      {/* The master still is one continuous picture: it runs past the frame and fades into the dark,
          so the frame is a line drawn over the world, not a box around it. */}
      {!real && masterStill && (
        <div className={`hero-bleed${wideStill ? " is-wide" : ""}${shown ? " is-shown" : ""}`} aria-hidden>
          <img src={wideStill ?? masterStill} alt="" className="still-fill" fetchPriority="high" />
          <i className="cfh-grain cf-grain" aria-hidden />
        </div>
      )}
      <div className={`hero-frame${!real && masterStill ? " is-open" : ""}`} role={!real && masterStill ? "img" : undefined}
        aria-label={!real && masterStill ? "Ashéron-Kor at dawn: the citadel backlit by the sun, the queen and her guard on the ridge" : undefined}>
        {real ? (
          <video className="hero-frame-video" src={publicUrl(real.video_path)} autoPlay muted loop playsInline preload="metadata" aria-label={real.title} />
        ) : !masterStill ? (
          <div className={`hero-frame-image${shown ? " is-shown" : ""}`}>
            <MasterShot idPrefix="hero" className="art-fill" />
          </div>
        ) : null}
        {resolving && <i className="hero-frame-scan" aria-hidden />}
        {!real && at < 2 && (
          <div className="hero-prompt" aria-hidden>
            <span>Prompt</span>
            <p>
              {PROMPT.slice(0, typed)}
              {at === 0 && <i className="hero-caret" />}
            </p>
          </div>
        )}
        <i className="cfh-grain cf-grain" aria-hidden />
        <i className="hero-sweep" aria-hidden />

        <div className="hero-frame-hud">
          <div className="hero-frame-row">
            <span className="hero-frame-badge">
              <i className={`hero-dot${at === 3 || real ? " is-live" : ""}`} aria-hidden />
              {real ? "Real · generated here" : resolving ? "Generating" : at === 3 ? "4K · Ready" : STAGES[at]}
            </span>
            <span>{real ? real.tag : SHOT.number}</span>
          </div>
          <div className="hero-frame-row">
            <span>{real ? real.title : SHOT.slug}</span>
            {!real && <span className="hero-frame-meta">{SHOT.meta}</span>}
          </div>
        </div>
        <i className="hero-corner tl" aria-hidden />
        <i className="hero-corner tr" aria-hidden />
        <i className="hero-corner bl" aria-hidden />
        <i className="hero-corner br" aria-hidden />
      </div>

      </div>

      {/* Three stills from the same world: they arrive at the storyboard stage. */}
      <div className="hero-strip">
        {[0, 1, 2].map((k) => (
          <i key={k} className={real || at >= 1 ? "is-on" : ""} style={{ transitionDelay: `${k * 140}ms` }}>
            {thumbs[k] ? (
              <img src={thumbs[k]} alt="" className="art-fill still-fill" loading="lazy" />
            ) : (
              <CinemaArt seed={`${SHOT.slug} board ${k}`} scene={BOARD[k]} className="art-fill" />
            )}
            <b className="hero-strip-cap">{STRIP[k]}</b>
          </i>
        ))}
      </div>

      <ol className="hero-flow" aria-label="Production path">
        {STAGES.map((name, k) => (
          <li key={name} className={k === at ? "is-on" : k < at ? "is-done" : ""}>
            {k > 0 && <><i className="hero-flow-rule" aria-hidden /><i className="hero-flow-ring" aria-hidden /></>}
            <span>{name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
