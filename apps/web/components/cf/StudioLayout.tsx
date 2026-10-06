"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CinemaArt, sceneFor } from "./CinemaArt";

/*
 * Studio layout — the working rooms (Create Film, Series, Trailer, Shorts,
 * Advert). Unlike the editorial pages, a studio is a tool: on a desktop the
 * whole room fits one screen — brief and options on the left with Create
 * always in reach, the production preview on the right. On phones the
 * options come first and the Create bar sticks to the bottom of the screen.
 */

/** Page frame: compact title row, optional tabs, then the room itself. */
export function StudioPage({
  title,
  badge,
  subtitle,
  aside,
  tabs,
  children,
  scroll = false,
}: {
  title: ReactNode;
  badge?: { tone: "live" | "warn" | "idle"; label: ReactNode };
  subtitle?: ReactNode;
  aside?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  /** Rooms that are long documents (storyboard) scroll inside the frame. */
  scroll?: boolean;
}) {
  const tone =
    badge?.tone === "live" ? "border-cf-ok/60 text-cf-ok" : badge?.tone === "warn" ? "border-cf-warn/60 text-cf-warn" : "border-cf-line2 text-cf-muted";
  return (
    <div className="flex flex-col lg:h-[calc(100dvh-78px)]">
      <header className="shrink-0 px-5 pb-4 pt-6 sm:px-8 lg:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.03em] sm:text-[30px]">{title}</h1>
              {badge && <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone}`}>{badge.label}</span>}
            </div>
            {subtitle && <p className="mt-1.5 max-w-3xl text-[14px] leading-snug text-cf-muted">{subtitle}</p>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
        {tabs && <div className="mt-5">{tabs}</div>}
      </header>
      <div className={`min-h-0 flex-1 px-5 pb-5 sm:px-8 ${scroll ? "lg:overflow-y-auto" : ""}`}>{children}</div>
    </div>
  );
}

/** Mode tabs under the title (Film: Auto, Hybrid, Scene-by-Scene…). */
export function StudioTabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { id: T; label: string; beta?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <nav
      className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:rounded-lg sm:border sm:border-cf-line sm:bg-cf-panel sm:p-1"
      aria-label={label}
    >
      {items.map((m) => {
        const on = m.id === value;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            aria-pressed={on}
            className={`flex min-h-[40px] shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-4 text-[14px] font-medium transition ${
              on ? "bg-cf-inverse text-cf-on-inverse" : "text-cf-muted hover:bg-cf-soft hover:text-cf-fg"
            }`}
          >
            {m.label}
            {m.beta && <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${on ? "opacity-60" : "text-cf-warn"}`}>beta</span>}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The two-column room. `controls` scroll inside the left panel, `footer`
 * (summary + Create) stays pinned under them, `preview` fills the right.
 */
export function StudioGrid({ controls, footer, preview }: { controls: ReactNode; footer: ReactNode; preview: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:h-full lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col rounded-lg border border-cf-line bg-cf-panel lg:min-h-0">
        <div className="space-y-6 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{controls}</div>
        <div className="sticky bottom-0 z-20 rounded-b-lg border-t border-cf-line bg-cf-panel/95 p-4 backdrop-blur lg:static">{footer}</div>
      </div>
      <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto" id="studio-preview">
        {preview}
      </div>
    </div>
  );
}

/** A compact labelled option group inside the controls panel. */
export function Field({ label, value, children, htmlFor }: { label: ReactNode; value?: ReactNode; children: ReactNode; htmlFor?: string }) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <Label {...(htmlFor ? { htmlFor } : {})} className="text-[12px] font-medium uppercase tracking-[0.06em] text-cf-muted">
          {label}
        </Label>
        {value && <span className="text-[12px] text-cf-dim">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/** Chips row for an option set. */
export function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/**
 * One line naming what a higher plan adds — instead of a wall of greyed-out
 * options. Renders nothing when the plan already runs everything.
 */
export function UnlockRow({ items, plan }: { items: string[]; plan: string }) {
  if (items.length === 0) return null;
  return (
    <Link
      href="/pricing"
      className="flex items-center justify-between gap-3 rounded-md border border-dashed border-cf-line2 px-3.5 py-3 text-[13px] text-cf-muted transition hover:border-cf-accent hover:text-cf-fg"
    >
      <span>
        <span className="text-cf-fg">{plan} plan.</span> Unlock {joinList(items)}.
      </span>
      <span className="shrink-0 font-semibold text-cf-accent">Plans →</span>
    </Link>
  );
}

function joinList(items: string[]) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Pinned footer content: a two-row summary and the actions. */
export function StudioFooter({ rows, children, note }: { rows: [ReactNode, ReactNode][]; children: ReactNode; note?: ReactNode }) {
  return (
    <div>
      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex justify-between gap-2">
            <dt className="text-cf-muted">{k}</dt>
            <dd className="font-medium text-cf-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2">{children}</div>
      {note && <div className="mt-2.5">{note}</div>}
    </div>
  );
}

/** One-tap starting points that fill the brief. */
export function ExampleShelf({ examples, onPick }: { examples: { title: string; brief: string }[]; onPick: (brief: string) => void }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-cf-muted">Start from an example</div>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [mask-image:linear-gradient(to_right,black_88%,transparent)] [scrollbar-width:none]">
        {examples.map((e) => (
          <button
            key={e.title}
            type="button"
            onClick={() => onPick(e.brief)}
            className="group flex min-h-[40px] shrink-0 items-center gap-2 rounded-md border border-cf-line2 bg-cf-bg py-1 pl-1 pr-3 text-left text-[13px] font-medium text-cf-fg transition hover:border-cf-accent"
            title={e.brief}
          >
            <CinemaArt seed={e.brief} scene={sceneFor(e.brief)} className="h-7 w-11 shrink-0 rounded" />
            {e.title}
          </button>
        ))}
      </div>
    </div>
  );
}
