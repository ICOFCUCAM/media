"use client";

import { useEffect, useState } from "react";

/**
 * "MAKE worlds." in the languages Cineforge dubs into: after the opening
 * holds in English, the title cycles through them — the dubbing engine,
 * shown in the first line a visitor reads. The heading's text for search and
 * screen readers stays English; reduced motion keeps it still.
 *
 * Only translations we are sure of are listed; add a language once a native
 * speaker has checked it.
 */
const TITLES: { code: string; lang: string; verb: string; noun: string }[] = [
  { code: "EN", lang: "English", verb: "MAKE", noun: "worlds." },
  { code: "FR", lang: "Français", verb: "CRÉEZ", noun: "des mondes." },
  { code: "ES", lang: "Español", verb: "CREA", noun: "mundos." },
  { code: "DE", lang: "Deutsch", verb: "BAUE", noun: "Welten." },
  { code: "PT", lang: "Português", verb: "CRIE", noun: "mundos." },
  { code: "SV", lang: "Svenska", verb: "SKAPA", noun: "världar." },
  { code: "NO", lang: "Norsk", verb: "SKAP", noun: "verdener." },
  { code: "RU", lang: "Русский", verb: "СОЗДАЙ", noun: "миры." },
];

const FIRST_HOLD = 5200;
const HOLD = 2600;

export function HeroTitle() {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || paused) return;
    const t = setTimeout(() => setAt((i) => (i + 1) % TITLES.length), at === 0 ? FIRST_HOLD : HOLD);
    return () => clearTimeout(t);
  }, [at, paused]);

  const t = TITLES[at]!;
  return (
    <>
      <h1
        className="hero-title hero-title-cycle"
        aria-label="Make worlds."
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <span key={`v${at}`} className="hero-verb" style={{ ["--len" as string]: t.verb.length }} aria-hidden>{t.verb}</span>
        <br />
        <em key={`n${at}`} style={{ ["--len" as string]: t.noun.length }} aria-hidden>{t.noun}</em>
      </h1>
      <div className="hero-lang" aria-hidden>
        <b>{t.code}</b>
        <span>{at === 0 ? "Original" : `Dubbed · ${t.lang}`}</span>
      </div>
    </>
  );
}
