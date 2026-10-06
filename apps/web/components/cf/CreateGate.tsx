"use client";

import Link from "next/link";
import { useState } from "react";
import { PROJECT_TYPES, CREATION_MODES, type CreationMode, type ProjectType } from "../../lib/creation";
import { ActionBand, Section, SpecList } from "./primitives";

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
    <>
      <Section label="Make / 01" title="What are we making?">
        <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Production type">
          {PROJECT_TYPES.map((t, i) => {
            const on = t.id === type.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setType(t)}
                className={`flex min-h-[200px] flex-col p-6 text-left transition ${on ? "bg-cf-inverse text-cf-on-inverse" : "bg-cf-bg hover:bg-cf-soft"}`}
              >
                <span className="flex items-center justify-between">
                  <span className="font-mono text-[11px] opacity-60">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`h-2 w-2 rounded-full ${on ? "bg-cf-accent" : "border border-cf-line"}`} aria-hidden />
                </span>
                <span className="mt-auto pt-10 font-display font-semibold text-[30px] leading-none tracking-[-0.04em]">{t.title}</span>
                <span className="mt-3 text-[12px] leading-relaxed opacity-60">{t.blurb}</span>
              </button>
            );
          })}
          {PROJECT_TYPES.length % 4 !== 0 && <div className="hidden bg-cf-bg xl:block" style={{ gridColumn: `span ${4 - (PROJECT_TYPES.length % 4)}` }} aria-hidden />}
        </div>
      </Section>

      <Section label="Material / 02" title="What are we starting with?">
        <div className="grid gap-px border border-cf-line bg-cf-line md:grid-cols-2 xl:grid-cols-5" role="radiogroup" aria-label="Starting material">
          {CREATION_MODES.map((m, i) => {
            const on = m.id === mode.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMode(m)}
                className={`flex min-h-[170px] flex-col p-5 text-left transition ${on ? "bg-cf-inverse text-cf-on-inverse" : "bg-cf-bg hover:bg-cf-soft"}`}
              >
                <span className="flex items-center justify-between font-sans text-[11px] font-medium uppercase tracking-[0.06em]">
                  <span className="opacity-60">{String(i + 1).padStart(2, "0")}</span>
                  {m.status !== "live" && <span className={on ? "text-cf-accent" : "text-cf-warn"}>{m.status}</span>}
                </span>
                <span className="mt-auto pt-8 font-display font-semibold text-[21px] leading-tight tracking-[-0.03em]">{m.title}</span>
                <span className="mt-2 text-[11px] leading-relaxed opacity-60">{m.blurb}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Path / 03" title="The production path.">
        <div className="grid gap-10 lg:grid-cols-[0.65fr_1.35fr]">
          <SpecList
            rows={[
              ["Production", type.title],
              ["Starting from", mode.title],
              ["Opens in", ownStudio ? `${type.title} studio` : mode.studio ? "Director's room" : "Production library"],
              ["Route", href],
            ]}
          />
          <ActionBand
            title={<>Enter <em>production.</em></>}
            copy={
              ownStudio
                ? `${type.title} work has its own studio — it starts from a written brief there.`
                : "Your material becomes the production brief. The studio takes it from there."
            }
          >
            <Link href={href} className="cf-btn-accent">
              Begin {type.title.toLowerCase()} →
            </Link>
          </ActionBand>
        </div>
      </Section>
    </>
  );
}
