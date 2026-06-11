"use client";

import { useEffect, useState } from "react";

/**
 * GenerativeFrame — a cinematic frame that cycles through the act of being
 * generated: prompt → latent noise → scanline pass → materialized image.
 * Pure CSS gradients stand in for real frames (no asset deps), evoking the
 * 2030 "type a sentence, watch it resolve" promise.
 */

const FRAMES = [
  { label: "EXT. ASHÉRON-KOR — DAWN", g: "from-amber-500/40 via-rose-500/30 to-indigo-700/40" },
  { label: "INT. THRONE ROOM — NIGHT", g: "from-fuchsia-600/40 via-purple-700/30 to-slate-900/60" },
  { label: "EXT. SAVANNAH — GOLDEN HOUR", g: "from-orange-400/40 via-amber-600/30 to-emerald-800/40" },
  { label: "EXT. WAR CAMP — DUSK", g: "from-rose-600/40 via-red-800/30 to-indigo-900/50" },
];

export function GenerativeFrame({ className = "" }: { className?: string }) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"resolving" | "ready">("resolving");

  useEffect(() => {
    const ready = setTimeout(() => setPhase("ready"), 1500);
    const next = setTimeout(() => {
      setPhase("resolving");
      setTimeout(() => setI((v) => (v + 1) % FRAMES.length), 120);
    }, 4200);
    return () => {
      clearTimeout(ready);
      clearTimeout(next);
    };
  }, [i]);

  const f = FRAMES[i]!;
  return (
    <div className={`cf-grain relative aspect-video overflow-hidden rounded-2xl border border-white/15 bg-black shadow-[0_0_80px_-20px_rgba(99,102,241,0.6)] ${className}`}>
      {/* The "image" */}
      <div key={i} className={`cf-materialize absolute inset-0 bg-gradient-to-br ${f.g}`}>
        {/* subtle depth blobs */}
        <div className="absolute left-1/4 top-1/3 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute right-1/4 bottom-1/4 h-32 w-32 rounded-full bg-black/30 blur-2xl" />
      </div>

      {/* Latent-noise + scanline while resolving */}
      {phase === "resolving" && (
        <>
          <div className="cf-grain absolute inset-0 opacity-60" />
          <div className="cf-scan absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-cyan-300/40 via-cyan-300/10 to-transparent" />
        </>
      )}

      {/* HUD overlay */}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-white/20 bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-white/70 backdrop-blur">
            {phase === "resolving" ? "◐ Generating" : "● 4K · Ready"}
          </span>
          <span className="font-mono text-[10px] text-white/50">SHOT {String(i + 1).padStart(2, "0")}/28</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="max-w-[70%] font-mono text-[11px] text-white/80 drop-shadow">{f.label}</span>
          <div className="flex gap-1">
            {FRAMES.map((_, k) => (
              <span key={k} className={`h-1 w-5 rounded-full transition ${k === i ? "bg-white" : "bg-white/25"}`} />
            ))}
          </div>
        </div>
      </div>

      {/* corner brackets — viewfinder */}
      <Corner className="left-3 top-3 border-l border-t" />
      <Corner className="right-3 top-3 border-r border-t" />
      <Corner className="left-3 bottom-3 border-b border-l" />
      <Corner className="right-3 bottom-3 border-b border-r" />
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <span className={`absolute h-4 w-4 border-white/40 ${className}`} aria-hidden />;
}
