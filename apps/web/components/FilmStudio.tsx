"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { CreateStudio } from "./CreateStudio";
import { StoryboardStudio } from "./StoryboardStudio";
import { ScriptStudio, ImageStudio, AudioStudio, VideoStudio, HybridStudio } from "./EntrySurfaces";
import { STUDIO_MODES, projectTypeById, type StudioMode } from "../lib/creation";
import { StudioPage, StudioTabs } from "./cf/StudioLayout";
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
    <StudioPage
      title={`Create a ${production}`}
      badge={live ? { tone: "live", label: "Live · saved to Projects" } : { tone: "warn", label: enabled ? "Preview · sign in to save" : "Preview" }}
      subtitle={MODE_BLURB[mode]}
      scroll={mode !== "prompt"}
      aside={
        enabled && !live ? (
          <button type="button" onClick={() => setShowAuth((v) => !v)} aria-expanded={showAuth} className="cf-link min-h-[40px]">
            {showAuth ? "Hide sign in" : "Sign in to save"}
          </button>
        ) : null
      }
      tabs={
        <>
          {showAuth && !live && (
            <div className="mb-5 rounded-lg border border-cf-line p-5">
              <AuthCard />
            </div>
          )}
          <StudioTabs
            label="Production mode"
            items={STUDIO_MODES.map((m) => ({ id: m.id, label: m.label, beta: m.status === "beta" }))}
            value={mode}
            onChange={choose}
          />
        </>
      }
    >
      <div className={mode === "prompt" ? "lg:h-full" : ""}>
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
    </StudioPage>
  );
}
