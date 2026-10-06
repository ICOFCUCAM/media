"use client";

import { useId, type ReactNode } from "react";

/*
 * ConfigCard — one production setting (Length, Quality & engine, Format) as a
 * cinematic card. The card is a real control: when there is a choice, a
 * native <select> covers it (keyboard, screen readers and phone pickers all
 * work as usual); when the plan allows a single value the card is a static
 * read-out. Styling lives in globals.css (.cf-config*).
 */

export type ConfigTone = "length" | "engine" | "format";

export function ConfigCard({
  tone,
  icon,
  label,
  main,
  secondary,
  meta,
  options,
  value,
  onChange,
  hint,
}: {
  tone: ConfigTone;
  icon: ReactNode;
  label: string;
  main: ReactNode;
  secondary?: ReactNode;
  meta?: ReactNode;
  /** The choices this plan can run; one (or none) renders a static card. */
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** Tooltip — e.g. why there is only one option. */
  hint?: string;
}) {
  const id = useId();
  const selectable = options.length > 1;
  return (
    <div className="cf-config" data-tone={tone} data-static={selectable ? undefined : ""} title={hint}>
      <div className="flex items-start justify-between">
        <span className="cf-config-icon" aria-hidden>
          {icon}
        </span>
        <span className="cf-config-check" aria-hidden>
          <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.2 5 8.5l4.5-5" />
          </svg>
        </span>
      </div>
      <span className="cf-config-label" id={`${id}-label`}>
        {label}
      </span>
      <span className="cf-config-value">
        <span className="min-w-0 truncate">{main}</span>
        {selectable && (
          <svg className="cf-config-chevron" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        )}
      </span>
      {secondary && <span className="cf-config-sub">{secondary}</span>}
      {meta && <span className="cf-config-meta">{meta}</span>}
      {selectable && (
        <select className="cf-config-select" aria-labelledby={`${id}-label`} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/* Small line icons, drawn to sit in the tinted icon well. */
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" {...stroke}>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  );
}

export function EngineIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" {...stroke}>
      <rect x="4" y="4" width="8" height="8" rx="1.6" />
      <path d="M6.5 6.5h3v3h-3zM6 1.8V4M10 1.8V4M6 12v2.2M10 12v2.2M1.8 6H4M1.8 10H4M12 6h2.2M12 10h2.2" />
    </svg>
  );
}

export function FormatIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" {...stroke}>
      <rect x="1.8" y="3" width="12.4" height="8.4" rx="1.4" />
      <path d="M6.6 5.6v3.2L9.4 7.2z" />
      <path d="M5.5 13.6h5" />
    </svg>
  );
}
