"use client";

import { useEffect, useRef, useState } from "react";
import { CinemaArt, type Scene } from "../cf/CinemaArt";
import { arrangeReel, listShowcase, publicUrl, type ShowcaseRow } from "../../lib/showcase";

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
 * playable by anonymous visitors (hover to play, tap on mobile). A film
 * featured for a frame (/admin/showcase) replaces that frame's placeholder;
 * films featured without a frame fill the empty frames; placeholders keep
 * the six-frame grid complete.
 */
export function HomeShowreel({ stills = [] }: { stills?: (string | undefined)[] }) {
  const [rows, setRows] = useState<ShowcaseRow[]>([]);

  useEffect(() => {
    void listShowcase(20).then(setRows);
  }, []);

  const frames = arrangeReel(rows);

  // Wide screens: the six tiles run as one strip of film that advances frame by
  // frame as the page scrolls (the section holds while it plays). Phones,
  // tablets and reduced motion keep the grid.
  const wrap = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [frameAt, setFrameAt] = useState(1);
  const [film, setFilm] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1101px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => setFilm(wide.matches && !reduced.matches);
    decide();
    wide.addEventListener("change", decide);
    reduced.addEventListener("change", decide);
    return () => { wide.removeEventListener("change", decide); reduced.removeEventListener("change", decide); };
  }, []);

  useEffect(() => {
    const w = wrap.current;
    const st = strip.current;
    if (!w || !st) return;
    if (!film) { w.style.height = ""; st.style.transform = ""; return; }
    let travel = 0;
    const onScroll = () => {
      if (!travel) return;
      const p = Math.min(1, Math.max(0, -w.getBoundingClientRect().top / travel));
      st.style.transform = `translate3d(${-p * travel}px, 0, 0)`;
      setFrameAt(Math.min(6, Math.round(p * 5) + 1));
    };
    // Measured after the strip is laid out as a row (and again when images or the window change it).
    const measure = () => {
      travel = Math.max(0, st.scrollWidth - window.innerWidth);
      w.style.height = `${window.innerHeight + travel}px`;
      onScroll();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(st);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", onScroll); };
  }, [film, rows.length]);

  return (
    <div ref={wrap} className={`reel-scroll${film ? " is-film" : ""}`}>
    <div className="reel-sticky">
    <div ref={strip} className="reel-strip">
    <i className="reel-perf" aria-hidden />
    <div className="reel-grid reveal">
      {frames.map((r, i) => {
        const p = { ...PLACEHOLDERS[i]!, still: stills[i] };
        return r ? (
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
        ) : (
        <div key={p.title} className="reel">
          {p.still ? (
            /* Plain <img>: a generated example still from public/frames. */
            <img src={p.still} alt="" className="art-fill still-fill" loading="lazy" />
          ) : (
            <CinemaArt seed={`${p.title} ${p.tag}`} scene={p.scene} className="art-fill" />
          )}
          {/* Player chrome: these tiles show how a finished film sits in the reel. */}
          <span className="reel-play" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
          </span>
          <span className="reel-quality" aria-hidden>{p.quality}</span>
          <span className="reel-progress" aria-hidden><i style={{ width: `${p.progress}%` }} /></span>
          <span className="reel-tag reel-tag-sample">Sample frame</span>
          <div className="reel-info">
            <span>{p.title}</span>
            <span>{p.tag}</span>
          </div>
        </div>
        );
      })}
    </div>
    <i className="reel-perf" aria-hidden />
    </div>
    {film && <span className="reel-counter" aria-hidden>Frame {String(frameAt).padStart(2, "0")} / 06</span>}
    </div>
    </div>
  );
}
