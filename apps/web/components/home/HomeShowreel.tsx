"use client";

import { useEffect, useState } from "react";
import { CinemaArt, type Scene } from "../cf/CinemaArt";
import { listShowcase, publicUrl, type ShowcaseRow } from "../../lib/showcase";

/** Placeholder frames shown until admins feature real films. */
const PLACEHOLDERS: { title: string; tag: string; scene: Scene }[] = [
  { title: "Feature Film", tag: "Drama", scene: "kingdom" },
  { title: "World", tag: "Fantasy", scene: "forest" },
  { title: "Documentary", tag: "Film", scene: "savannah" },
  { title: "Commercial", tag: "Brand", scene: "studio" },
  { title: "Short", tag: "Vertical", scene: "city" },
  { title: "Music Video", tag: "Performance", scene: "stage" },
];

/**
 * Showreel grid — admin-featured films from the public showcase bucket,
 * playable by anonymous visitors (hover to play, tap on mobile). Real films
 * fill the first frames; placeholders keep the six-frame grid complete.
 */
export function HomeShowreel() {
  const [rows, setRows] = useState<ShowcaseRow[]>([]);

  useEffect(() => {
    void listShowcase(6).then(setRows);
  }, []);

  const fill = PLACEHOLDERS.slice(rows.length);

  return (
    <div className="reel-grid reveal">
      {rows.map((r) => (
        <div key={r.id} className="reel">
          <video
            src={publicUrl(r.video_path)}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={r.title}
            onMouseEnter={(e) => void e.currentTarget.play()}
            onMouseLeave={(e) => e.currentTarget.pause()}
            onClick={(e) => (e.currentTarget.paused ? void e.currentTarget.play() : e.currentTarget.pause())}
          />
          <span className="reel-tag">Real · generated here</span>
          <div className="reel-info">
            <span>{r.title}</span>
            <span>{r.tag}</span>
          </div>
        </div>
      ))}
      {fill.map((p) => (
        <div key={p.title} className="reel">
          <CinemaArt seed={`${p.title} ${p.tag}`} scene={p.scene} className="art-fill" />
          <span className="reel-tag">Drawn frame · your film here</span>
          <div className="reel-info">
            <span>{p.title}</span>
            <span>{p.tag}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
