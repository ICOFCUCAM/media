"use client";

import { useEffect, useState } from "react";
import { listShowcase, publicUrl, type ShowcaseRow } from "../../lib/showcase";

/**
 * The hero's living frame: a film visibly becoming a film. When admins have
 * featured a real film it plays here (muted, looped) and says so; otherwise
 * the frame walks the production path — prompt, storyboard, generation, final
 * cut — on depicted shots. Reduced motion holds a still, finished frame.
 */

const SHOTS = [
  { slug: "EXT. ASHÉRON-KOR — DAWN", bg: "linear-gradient(135deg,#6b4a22 0%,#2a2014 55%,#0e1110 100%)" },
  { slug: "INT. THRONE ROOM — NIGHT", bg: "linear-gradient(135deg,#3d3122 0%,#16130e 60%,#090908 100%)" },
  { slug: "EXT. SAVANNAH — GOLDEN HOUR", bg: "linear-gradient(135deg,#7a5320 0%,#4a3416 50%,#1f2a17 100%)" },
  { slug: "EXT. WAR CAMP — DUSK", bg: "linear-gradient(135deg,#5a2f1f 0%,#2b1a14 55%,#0f1312 100%)" },
];

const PROMPT = "An epic about an African kingdom fighting for its independence, told over three generations.";
const STAGES = ["Prompt", "Storyboard", "Generation", "Final cut"] as const;
// How long each stage holds, in ms.
const HOLD = [1800, 1300, 1600, 2600];

export function HeroFrame() {
  const [real, setReal] = useState<ShowcaseRow | null>(null);
  const [shot, setShot] = useState(0);
  const [stage, setStage] = useState(3);
  const [typed, setTyped] = useState(PROMPT.length);
  const [still, setStill] = useState(true);

  useEffect(() => {
    void listShowcase(1).then((rows) => rows[0] && setReal(rows[0]));
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Walk the production path on depicted shots.
  useEffect(() => {
    if (still || real) return;
    const t = setTimeout(() => {
      if (stage === 3) {
        setShot((s) => (s + 1) % SHOTS.length);
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

  const s = SHOTS[shot]!;
  const at = real ? 3 : stage;
  const resolving = !real && at === 2;
  const shown = real || at >= 2;

  return (
    <div className="hero-stage" aria-label="A film becoming a film">
      <div className="hero-frame">
        {real ? (
          <video className="hero-frame-video" src={publicUrl(real.video_path)} autoPlay muted loop playsInline preload="metadata" aria-label={real.title} />
        ) : (
          <div key={shot} className={`hero-frame-image${shown ? " is-shown" : ""}`} style={{ background: s.bg }}>
            <i className="hero-frame-bloom" />
          </div>
        )}
        {resolving && <i className="hero-frame-scan" aria-hidden />}

        <div className="hero-frame-hud">
          <div className="hero-frame-row">
            <span className="hero-frame-badge">
              {real ? "● Real · generated here" : resolving ? "◐ Generating" : at === 3 ? "● 4K · Ready" : `○ ${STAGES[at]}`}
            </span>
            <span>{real ? real.tag : `SHOT ${String(shot + 3).padStart(2, "0")}/28`}</span>
          </div>
          <div className="hero-frame-row">
            <span>{real ? real.title : s.slug}</span>
            {!real && (
              <span className="hero-frame-ticks" aria-hidden>
                {SHOTS.map((_, k) => (
                  <i key={k} className={k === shot ? "is-on" : ""} />
                ))}
              </span>
            )}
          </div>
        </div>
        <i className="hero-corner tl" aria-hidden />
        <i className="hero-corner tr" aria-hidden />
        <i className="hero-corner bl" aria-hidden />
        <i className="hero-corner br" aria-hidden />
      </div>

      {!real && (
        <div className="hero-desk" aria-hidden>
          <div className="hero-prompt">
            <span>Prompt</span>
            <p>
              {PROMPT.slice(0, typed)}
              {at === 0 && <i className="hero-caret" />}
            </p>
          </div>
          <div className="hero-board">
            {Array.from({ length: 9 }).map((_, k) => (
              <i key={k} className={at >= 1 ? "is-on" : ""} style={{ transitionDelay: `${k * 90}ms` }} />
            ))}
          </div>
        </div>
      )}

      <ol className="hero-flow" aria-label="Production path">
        {STAGES.map((name, k) => (
          <li key={name} className={k === at ? "is-on" : k < at ? "is-done" : ""}>
            {name}
          </li>
        ))}
      </ol>
    </div>
  );
}
