"use client";

import Link from "next/link";
import { useState } from "react";
import { CinemaArt, type Scene } from "./CinemaArt";
import { PROJECT_TYPES, CREATION_MODES, type CreationMode, type ProjectType } from "../../lib/creation";

/** Which kind of frame each production type is pictured with. */
const TYPE_SCENE: Record<string, Scene> = {
  film: "kingdom",
  series: "city",
  trailer: "space",
  commercial: "studio",
  social: "figure",
  music: "stage",
  documentary: "savannah",
};

/** Types that open inside the film studio and accept every entry mode. */
const FILM_FAMILY = new Set(["film", "documentary", "music"]);

/**
 * Resolve a (what, from) pair to the real studio route. Film-family work
 * opens the Director's Room in the chosen mode; dedicated studios (series,
 * trailer, shorts, advert) own their flow; character / world / episode-first
 * starts go to their libraries.
 */
function pathFor(type: ProjectType, mode: CreationMode): string {
  if (!mode.studio) return mode.href;
  if (!FILM_FAMILY.has(type.id)) return type.href;
  const q = new URLSearchParams({ mode: mode.studio });
  if (type.id !== "film") q.set("type", type.id);
  return `/create/film?${q.toString()}`;
}

export function CreateGate() {
  const [type, setType] = useState<ProjectType>(PROJECT_TYPES[0]!);
  const [mode, setMode] = useState<CreationMode>(CREATION_MODES[0]!);
  const href = pathFor(type, mode);
  const ownStudio = !FILM_FAMILY.has(type.id) && !!mode.studio;

  return (
    <div className="space-y-7 pb-28">
      <section aria-labelledby="gate-what">
        <h2 id="gate-what" className="mb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-cf-muted">
          What are you making?
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" role="radiogroup" aria-labelledby="gate-what">
          {PROJECT_TYPES.map((t) => {
            const on = t.id === type.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setType(t)}
                className={`group relative h-[150px] overflow-hidden rounded-lg text-left text-white outline-offset-[-3px] transition ${on ? "outline outline-[3px] outline-cf-accent" : ""}`}
              >
                <span className="absolute inset-0 transition duration-500 group-hover:scale-[1.04]" aria-hidden>
                  <CinemaArt seed={`${t.title} ${t.blurb}`} scene={TYPE_SCENE[t.id]} className="h-full w-full" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" aria-hidden />
                <span className="relative flex h-full flex-col justify-end p-3.5">
                  <span className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${on ? "bg-cf-accent" : "border border-white/50"}`} aria-hidden />
                  <span className="font-display text-[18px] font-semibold leading-tight">{t.title}</span>
                  <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-white/75">{t.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {ownStudio ? (
        <p className="rounded-lg border border-cf-line bg-cf-panel px-4 py-3.5 text-[14px] text-cf-muted">
          <span className="text-cf-fg">{type.title}</span> has its own studio — you start from a written brief there.
        </p>
      ) : (
        <section aria-labelledby="gate-from">
          <h2 id="gate-from" className="mb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-cf-muted">
            What are you starting with?
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="radiogroup" aria-labelledby="gate-from">
            {CREATION_MODES.map((m) => {
              const on = m.id === mode.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMode(m)}
                  className={`flex min-h-[92px] flex-col rounded-lg border p-3.5 text-left transition ${
                    on ? "border-cf-accent bg-cf-soft" : "border-cf-line bg-cf-panel hover:border-cf-line2"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold">{m.title}</span>
                    {m.status !== "live" && <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-cf-warn">{m.status}</span>}
                  </span>
                  <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-cf-muted">{m.blurb}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cf-line2 bg-cf-panel/95 p-3 pl-5 shadow-[0_20px_50px_rgba(0,0,0,.45)] backdrop-blur">
        <span className="text-[14px] text-cf-muted">
          <span className="font-semibold text-cf-fg">{type.title}</span>
          {ownStudio ? ` · opens the ${type.title.toLowerCase()} studio` : ` · from ${mode.title.replace(/ → .*/, "").toLowerCase()} · ${mode.studio ? "opens the director's room" : "opens the library"}`}
        </span>
        <Link href={href} className="cf-btn-accent">
          Begin {type.title.toLowerCase()} →
        </Link>
      </div>
    </div>
  );
}
