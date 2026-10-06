"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { CreateStudio } from "./CreateStudio";
import { StoryboardStudio } from "./StoryboardStudio";
import { ScriptStudio, ImageStudio, AudioStudio, VideoStudio, HybridStudio } from "./EntrySurfaces";
import { STUDIO_MODES, projectTypeById, type StudioMode } from "../lib/creation";
import { PageHeader } from "./cf/primitives";
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
 * The Director's Room (docs/design/create-film.html). Mode-aware workspace: every creation entry point on one screen (Prompt ·
 * Script · Scene-by-Scene · Image · Audio · Video), read from ?mode=. Auto mode
 * runs the shared production console — the REAL pipeline when signed in (the
 * worker owns the lifecycle; the page only reflects Realtime state), a loudly
 * labelled preview otherwise. The old in-browser lifecycle stand-in is gone:
 * it raced the real worker and wrote fake completions into live data.
 */
function FilmWorkspace() {
  const { enabled, user } = useAuth();
  const live = enabled && !!user;
  const [mode, setMode] = useState<StudioMode>("prompt");
  const [type, setType] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const p = productById("film")!;

  // Read the requested mode/type from the URL (avoids useSearchParams'
  // Suspense requirement on statically-rendered routes).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("mode");
    if (m && STUDIO_MODES.some((x) => x.id === m)) setMode(m as StudioMode);
    const t = projectTypeById(q.get("type"));
    if (t && t.id !== "film") setType(t.title);
  }, []);

  // Keep ?mode= in sync so a room can be linked, reloaded and shared.
  function choose(m: StudioMode) {
    setMode(m);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", m);
    window.history.replaceState(null, "", url.toString());
  }

  const production = type ?? "Film";

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow={`${production} production / 01`}
        title={<>Direct<br />the <em>{type ? type.toLowerCase() : "film"}.</em></>}
        copy={
          <>
            <p>From premise to final cut, Cineforge turns one creative direction into a complete production.</p>
            <p>{MODE_BLURB[mode]}</p>
            <p><strong>You direct. Cineforge carries the production.</strong></p>
          </>
        }
        status={live ? { tone: "live", label: "Live studio · saved to your projects" } : { tone: "warn", label: enabled ? "Preview · sign in to save" : "Preview · not saved" }}
        aside={
          enabled && !live ? (
            <button type="button" onClick={() => setShowAuth((v) => !v)} aria-expanded={showAuth} className="cf-link mt-5 block">
              {showAuth ? "Hide sign in" : "Sign in to save →"}
            </button>
          ) : null
        }
      />

      {showAuth && !live && (
        <div className="border-b border-cf-line py-10">
          <AuthCard />
        </div>
      )}

      <nav className="mt-12 flex overflow-x-auto border-b border-t border-b-cf-line border-t-cf-fg" aria-label="Production mode">
        {STUDIO_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => choose(m.id)}
            aria-pressed={mode === m.id}
            className={`flex min-w-[120px] shrink-0 items-center justify-center gap-2 border-r border-cf-line px-5 py-4 font-mono text-[9px] uppercase tracking-[0.08em] transition ${
              mode === m.id ? "bg-cf-inverse text-cf-on-inverse" : "text-cf-muted hover:text-cf-fg"
            }`}
          >
            {m.label}
            {m.status === "beta" && <span className={mode === m.id ? "text-cf-accent" : "text-cf-warn"}>beta</span>}
          </button>
        ))}
      </nav>

      <div className="pt-10">
        {mode === "prompt" && (
          <CreateStudio
            kind="film"
            embedded
            heading=""
            blurb=""
            production={production}
            durations={p.durations}
            defaultSeconds={p.defaultSeconds}
            defaultPrompt="An epic about an African kingdom fighting for its independence, told over three generations."
            cta={`Create ${production.toLowerCase()}`}
          />
        )}
        {mode === "hybrid" && <HybridStudio />}
        {mode === "script" && <ScriptStudio />}
        {mode === "storyboard" && <StoryboardStudio />}
        {mode === "image" && <ImageStudio />}
        {mode === "audio" && <AudioStudio />}
        {mode === "video" && <VideoStudio />}
      </div>
    </div>
  );
}
