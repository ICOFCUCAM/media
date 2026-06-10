"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { CreateStudio } from "./CreateStudio";
import { StoryboardStudio } from "./StoryboardStudio";
import { ScriptStudio, ImageStudio, AudioStudio, VideoStudio, HybridStudio } from "./EntrySurfaces";
import { STUDIO_MODES, type StudioMode } from "../lib/creation";
import { productById } from "../lib/products";

export function FilmStudio() {
  return <FilmWorkspace />;
}

const MODE_BLURB: Record<StudioMode, string> = {
  prompt: "Auto — one prompt → a full film: screenplay, cast, locations, score and a final cut.",
  hybrid: "Auto-draft the screenplay & scenes, then refine each in the Storyboard.",
  script: "Bring a screenplay; we break it into a shot list and scenes.",
  storyboard: "Build and generate scene by scene — full creative control.",
  image: "Start from images; add motion and camera per shot.",
  audio: "Upload narration; we build the visuals around it.",
  video: "Upload a clip; generate variations, extensions or a sequel.",
};

/**
 * Mode-aware workspace: every creation entry point on one screen (Prompt ·
 * Script · Scene-by-Scene · Image · Audio · Video), read from ?mode=. Auto mode
 * runs the shared production console — the REAL pipeline when signed in (the
 * worker owns the lifecycle; the page only reflects Realtime state), a loudly
 * labelled preview otherwise. The old in-browser lifecycle stand-in is gone:
 * it raced the real worker and wrote fake completions into live data.
 */
function FilmWorkspace() {
  const { enabled, user, signOut } = useAuth();
  const live = enabled && !!user;
  const [mode, setMode] = useState<StudioMode>("prompt");
  const [showAuth, setShowAuth] = useState(false);
  const p = productById("film")!;

  // Read the requested mode from the URL (avoids useSearchParams' Suspense
  // requirement on statically-rendered routes).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("mode");
    if (q && STUDIO_MODES.some((m) => m.id === q)) setMode(q as StudioMode);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            Create a Film
            {live ? (
              <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-[10px] font-normal text-emerald-300">Live · Supabase</span>
            ) : (
              <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] font-normal text-amber-300">Preview</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-white/55">{MODE_BLURB[mode]}</p>
        </div>
        <div className="text-right text-xs text-white/45">
          {live ? (
            <>
              <div>{user!.email}</div>
              <button onClick={signOut} className="mt-1 underline hover:text-white">Sign out</button>
            </>
          ) : enabled ? (
            <button onClick={() => setShowAuth((v) => !v)} className="underline hover:text-white">Sign in to save</button>
          ) : (
            <span title="Set NEXT_PUBLIC_SUPABASE_URL to persist your work">Preview — not saved</span>
          )}
        </div>
      </header>

      {showAuth && !live && (
        <div className="mb-6">
          <AuthCard />
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/5 p-1 text-sm">
        {STUDIO_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
              mode === m.id ? "bg-white text-black" : "text-white/60 hover:text-white"
            }`}
          >
            {m.label}
            {m.status === "beta" && (
              <span className={`rounded-full px-1.5 text-[9px] uppercase ${mode === m.id ? "bg-black/10 text-black/60" : "text-amber-300"}`}>beta</span>
            )}
          </button>
        ))}
      </div>

      {mode === "prompt" && (
        <CreateStudio
          kind="film"
          embedded
          heading=""
          blurb=""
          durations={p.durations}
          defaultSeconds={p.defaultSeconds}
          defaultPrompt="An epic about an African kingdom fighting for its independence, told over three generations."
          cta="Create film"
        />
      )}
      {mode === "hybrid" && <HybridStudio />}
      {mode === "script" && <ScriptStudio />}
      {mode === "storyboard" && <StoryboardStudio />}
      {mode === "image" && <ImageStudio />}
      {mode === "audio" && <AudioStudio />}
      {mode === "video" && <VideoStudio />}
    </div>
  );
}
