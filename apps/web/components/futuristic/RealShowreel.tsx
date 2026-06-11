"use client";

import { useEffect, useState } from "react";
import { listShowcase, publicUrl, type ShowcaseRow } from "../../lib/showcase";

/**
 * Real showreel — admin-featured films from the public showcase bucket,
 * playable by anonymous homepage visitors (hover to play, tap on mobile).
 * Returns null when nothing is featured yet so the gradient placeholders
 * keep the section alive.
 */
export function RealShowreel() {
  const [rows, setRows] = useState<ShowcaseRow[] | null>(null);

  useEffect(() => {
    void listShowcase(6).then(setRows);
  }, []);

  if (!rows?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rows.map((r) => (
        <div key={r.id} className="group relative overflow-hidden rounded-xl border border-white/10 transition hover:border-white/30 hover:shadow-[0_0_40px_-12px_rgba(99,102,241,0.7)]">
          <video
            src={publicUrl(r.video_path)}
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(e) => void e.currentTarget.play()}
            onMouseLeave={(e) => e.currentTarget.pause()}
            onClick={(e) => (e.currentTarget.paused ? void e.currentTarget.play() : e.currentTarget.pause())}
            className="aspect-video w-full cursor-pointer object-cover"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-3">
            <span className="truncate text-sm font-medium">{r.title}</span>
            <span className="ml-2 shrink-0 rounded bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">{r.tag}</span>
          </div>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300 backdrop-blur">
            Real · generated here
          </span>
        </div>
      ))}
    </div>
  );
}
