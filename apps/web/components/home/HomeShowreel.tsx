"use client";

import { useEffect, useState } from "react";
import { CinemaArt, type Scene } from "../cf/CinemaArt";
import { listShowcase, publicUrl, type ShowcaseRow } from "../../lib/showcase";

/** Placeholder frames shown until admins feature real films. */
const PLACEHOLDERS: { title: string; tag: string; scene: Scene; quality: string; progress: number }[] = [
  { title: "Feature Film", tag: "Drama", scene: "kingdom", quality: "4K", progress: 38 },
  { title: "World", tag: "Fantasy", scene: "forest", quality: "1080p", progress: 62 },
  { title: "Documentary", tag: "Film", scene: "savannah", quality: "4K", progress: 15 },
  { title: "Commercial", tag: "Brand", scene: "studio", quality: "1080p", progress: 80 },
  { title: "Short", tag: "Vertical", scene: "city", quality: "9:16", progress: 50 },
  { title: "Music Video", tag: "Performance", scene: "stage", quality: "4K", progress: 27 },
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
          {/* Player chrome: these tiles show how a finished film sits in the reel. */}
          <span className="reel-play" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
          </span>
          <span className="reel-quality" aria-hidden>{p.quality}</span>
          <span className="reel-progress" aria-hidden><i style={{ width: `${p.progress}%` }} /></span>
          <span className="reel-tag">Example frame · your film here</span>
          <div className="reel-info">
            <span>{p.title}</span>
            <span>{p.tag}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
