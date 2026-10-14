"use client";

import { useEffect, useState } from "react";
import { CinemaArt, type Scene } from "../cf/CinemaArt";

/*
 * The workspace preview, playing: the playhead travels the timeline, the
 * active clip advances, and the viewer cross-fades to that clip's scene with
 * its slate. Slow and continuous — an editor scrubbing, not a slideshow.
 * Reduced motion holds scene 07. Given stills (frames of the homepage film),
 * each clip shows its own frame, so the workspace edits the same world the
 * hero opens on.
 */

const CLIPS: { seed: string; scene: Scene; slug: string }[] = [
  { seed: "Scene 05 savannah march", scene: "savannah", slug: "SCENE 05 / EXT. THE RIVER GATE / DAWN" },
  { seed: "Scene 06 war council", scene: "interior", slug: "SCENE 06 / INT. THE PILLARED HALL / DUSK" },
  { seed: "Scene 07 throne hall", scene: "kingdom", slug: "SCENE 07 / EXT. ASHÉRON-KOR / DAWN" },
  { seed: "Scene 08 the heir", scene: "figure", slug: "SCENE 08 / EXT. THE RIDGE / DAWN" },
  { seed: "Scene 09 the return", scene: "kingdom", slug: "SCENE 09 / EXT. ASHÉRON-KOR / RETURN" },
];

const HOLD = 3200;

export function WorkspacePreview({ stills = [] }: { stills?: (string | undefined)[] }) {
  const [at, setAt] = useState(2);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setAt((v) => (v + 1) % CLIPS.length), HOLD);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="scene">
      {CLIPS.map((c, i) => (
        <div key={c.seed} className={`ws-take${i === at ? " is-on" : ""}`} aria-hidden={i !== at}>
          <Take still={stills[i]} clip={c} />
        </div>
      ))}
      <div className="scene-label">{CLIPS[at]!.slug}</div>
      {/* The playhead crosses the active clip while it holds. */}
      <div className="playhead ws-playhead" key={at} style={{ ["--from" as string]: `${8 + at * 18.4}%`, ["--to" as string]: `${8 + at * 18.4 + 16}%` }} />
      <div className="timeline">
        {CLIPS.map((c, i) => (
          <div key={c.seed} className={`clip${i === at ? " is-on" : ""}`}>
            <Take still={stills[i]} clip={c} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Take({ still, clip }: { still?: string; clip: (typeof CLIPS)[number] }) {
  // Plain <img>: a static still from public/frames.
  return still ? <img src={still} alt="" className="art-fill still-fill" loading="lazy" /> : <CinemaArt seed={clip.seed} scene={clip.scene} className="art-fill" />;
}
