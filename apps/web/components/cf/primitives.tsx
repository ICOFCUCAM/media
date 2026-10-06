import Link from "next/link";
import type { ReactNode } from "react";

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
    <span className={`inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] ${TONE_TEXT[tone]} ${className}`}>
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
}: {
  eyebrow: string;
  title: ReactNode;
  copy?: ReactNode;
  status?: { tone?: Tone; label: ReactNode };
  aside?: ReactNode;
}) {
  return (
    <header className="grid gap-10 border-b border-cf-line pb-14 lg:grid-cols-[1.35fr_0.65fr] lg:gap-[8vw]">
      <div>
        <div className="cf-eyebrow mb-6">{eyebrow}</div>
        <h1 className="cf-display text-[clamp(52px,7.5vw,128px)] leading-[0.84] [&_em]:italic">{title}</h1>
      </div>
      <div className="max-w-[440px] self-end text-[15px] leading-[1.75] text-cf-muted [&_p+p]:mt-4 [&_strong]:font-normal [&_strong]:text-cf-fg">
        {copy}
        {status && (
          <div className="mt-7">
            <Status tone={status.tone}>{status.label}</Status>
          </div>
        )}
        {aside}
      </div>
    </header>
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
        ratio === "wide" ? "lg:grid-cols-[1.35fr_0.65fr]" : "lg:grid-cols-2"
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
        <div key={i} className="flex justify-between gap-5 border-b border-cf-line py-4 text-[11px]">
          <dt className="text-cf-muted">{k}</dt>
          <dd className="text-right font-mono text-[9px] uppercase tracking-[0.08em] text-cf-fg">{v}</dd>
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
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-cf-fg">{name}</span>
        {value && <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-cf-muted">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/** The inverse call-to-action band that closes a workspace. */
export function ActionBand({ title, copy, children }: { title: ReactNode; copy?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 bg-cf-inverse p-8 text-cf-on-inverse sm:flex-row sm:items-center sm:justify-between sm:p-10">
      <div>
        <h2 className="cf-display text-[clamp(26px,3vw,36px)] leading-[1.05] [&_em]:italic">{title}</h2>
        {copy && <p className="mt-2 max-w-xl text-[13px] leading-relaxed opacity-60">{copy}</p>}
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
  className = "",
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: { label: string; href: string };
  className?: string;
}) {
  return (
    <div className={`flex min-h-[260px] flex-col items-center justify-center border border-dashed border-cf-line px-6 py-12 text-center ${className}`}>
      <p className="cf-display text-[clamp(26px,3vw,38px)] leading-[1.05] [&_em]:italic">{title}</p>
      {hint && <p className="cf-label mt-3 max-w-md leading-relaxed">{hint}</p>}
      {action && (
        <Link href={action.href} className="cf-btn-ink mt-7">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Numbered row used by pipelines, archives and indexes. */
export function IndexRow({
  n,
  title,
  meta,
  state,
  href,
}: {
  n: number | string;
  title: ReactNode;
  meta?: ReactNode;
  state?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className="font-mono text-[9px] text-cf-muted">{typeof n === "number" ? String(n).padStart(2, "0") : n}</span>
      <span className="min-w-0">
        <span className="block truncate font-serif text-[18px] leading-tight">{title}</span>
        {meta && <span className="mt-1 block truncate text-[11px] text-cf-muted">{meta}</span>}
      </span>
      {state && <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-cf-muted">{state}</span>}
    </>
  );
  const cls = "grid min-h-[68px] grid-cols-[45px_1fr_auto] items-center gap-4 border-b border-cf-line py-3";
  return href ? (
    <Link href={href} className={`${cls} transition hover:bg-cf-soft/60`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
