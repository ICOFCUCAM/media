import Link from "next/link";
import type { ReactNode } from "react";
import { CinemaArt, SCENES, sceneFor } from "./CinemaArt";

/*
 * Cineforge visual primitives — the editorial vocabulary shared by every
 * studio page (docs/design/*). Hook-free, so they render in server and client
 * components alike. Colours come from the active room (.cf-light / .cf-dark).
 */

export type Tone = "live" | "ok" | "warn" | "danger" | "idle";

const TONE_DOT: Record<Tone, string> = {
  live: "bg-cf-accent",
  ok: "bg-cf-ok",
  warn: "bg-cf-warn",
  danger: "bg-cf-danger",
  idle: "bg-cf-dim",
};

const TONE_TEXT: Record<Tone, string> = {
  live: "text-cf-fg",
  ok: "text-cf-ok",
  warn: "text-cf-warn",
  danger: "text-cf-danger",
  idle: "text-cf-muted",
};

/** A status line: a dot plus a mono label. */
export function Status({ tone = "live", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.06em] ${TONE_TEXT[tone]} ${className}`}>
      <i className={`h-[7px] w-[7px] shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
      {children}
    </span>
  );
}

/** The editorial page header: eyebrow + display title on the left, copy and status on the right. */
export function PageHeader({
  eyebrow,
  title,
  copy,
  status,
  aside,
  art,
}: {
  eyebrow: string;
  title: ReactNode;
  copy?: ReactNode;
  status?: { tone?: Tone; label: ReactNode };
  aside?: ReactNode;
  /** Seed for the header's film strip; false hides it. Defaults to the page. */
  art?: string | false;
}) {
  const reel = art === false ? null : (art ?? `${eyebrow} ${textOf(title)}`);
  return (
    <header className="border-b border-cf-line pb-14">
      <div className="grid gap-10 xl:grid-cols-[1.35fr_0.65fr] xl:gap-[8vw]">
        <div>
          <div className="cf-eyebrow mb-6">{eyebrow}</div>
          <h1 className="cf-display text-[clamp(44px,6.2vw,104px)] leading-[0.92] [&_em]:italic">{title}</h1>
        </div>
        <div className="max-w-[520px] self-end text-[15px] leading-[1.75] text-cf-muted [&_p+p]:mt-4 [&_strong]:font-normal [&_strong]:text-cf-fg">
          {copy}
          {status && (
            <div className="mt-7">
              <Status tone={status.tone}>{status.label}</Status>
            </div>
          )}
          {aside}
        </div>
      </div>
      {reel && <ReelStrip seed={reel} />}
    </header>
  );
}

/** Three drawn frames under a page title — the room reads as a film set. */
function ReelStrip({ seed }: { seed: string }) {
  const first = SCENES.indexOf(sceneFor(seed));
  return (
    <div className="mt-12 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((k) => (
        <CinemaArt
          key={k}
          seed={`${seed} ${k}`}
          scene={SCENES[(first + k * 3) % SCENES.length]}
          letterbox
          motion={k === 0}
          className={`aspect-[21/9] rounded-md ${k > 0 ? "hidden sm:block" : ""}`}
          hud={{ tag: `Shot ${String(k + 1).padStart(2, "0")}` }}
        />
      ))}
    </div>
  );
}

/** A ruled section with an optional label row. */
export function Section({
  label,
  title,
  aside,
  children,
  className = "",
  id,
}: {
  label?: ReactNode;
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`border-b border-cf-line py-12 sm:py-14 ${className}`}>
      {(label || title || aside) && (
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            {label && <div className="cf-label">{label}</div>}
            {title && <h2 className="cf-display mt-3 text-[clamp(28px,3vw,40px)] leading-[1] [&_em]:italic">{title}</h2>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Two-column production grid separated by hairlines (creative | specification). */
export function Split({ children, ratio = "wide" }: { children: ReactNode; ratio?: "wide" | "even" }) {
  return (
    <div
      className={`grid gap-px border border-cf-line bg-cf-line ${
        ratio === "wide" ? "xl:grid-cols-[1.35fr_0.65fr]" : "lg:grid-cols-2"
      }`}
    >
      {children}
    </div>
  );
}

/** A cell inside Split / ruled grids. */
export function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 bg-cf-bg p-6 sm:p-8 ${className}`}>{children}</div>;
}

/** Key / value rows with hairlines. */
export function SpecList({ rows, className = "" }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={`border-t border-cf-line ${className}`}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-5 border-b border-cf-line py-3.5 text-[13px]">
          <dt className="text-cf-muted">{k}</dt>
          <dd className="text-right text-[13px] font-medium text-cf-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A labelled control group (label + current value, then the options). */
export function Control({ name, value, children }: { name: ReactNode; value?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-7 first:mt-0">
      <div className="mb-2.5 flex justify-between gap-4">
        <span className="font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-cf-fg">{name}</span>
        {value && <span className="font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-cf-muted">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/** The inverse call-to-action band that closes a workspace. */
export function ActionBand({ title, copy, children }: { title: ReactNode; copy?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 rounded-lg border border-cf-line2 border-l-4 border-l-cf-accent bg-cf-panel p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
      <div>
        <h2 className="cf-display text-[clamp(26px,3vw,36px)] leading-[1.05] [&_em]:italic">{title}</h2>
        {copy && <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-cf-muted">{copy}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** A quiet, honest empty state. */
export function EmptyState({
  title,
  hint,
  action,
  seed,
  className = "",
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: { label: string; href: string };
  /** Seeds the backdrop still; defaults to the title text. */
  seed?: string;
  className?: string;
}) {
  const artSeed = seed ?? textOf(title);
  return (
    <CinemaArt seed={artSeed || "empty"} letterbox className={`cf-dark min-h-[300px] rounded-lg border border-cf-line ${className}`}>
      <div className="flex h-full flex-col items-center justify-center bg-gradient-to-t from-black/80 via-black/50 to-black/30 px-6 py-12 text-center text-white">
        <p className="cf-display text-[clamp(26px,3vw,38px)] leading-[1.05] [&_em]:italic">{title}</p>
        {hint && <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/80">{hint}</p>}
        {action && (
          <Link href={action.href} className="cf-btn-accent mt-7">
            {action.label}
          </Link>
        )}
      </div>
    </CinemaArt>
  );
}

/** Plain text of a small ReactNode (strings, numbers, nested fragments). */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}
