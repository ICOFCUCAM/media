import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared scaffold for workspace sections (Projects, Characters, Worlds, …).
 * Gives each area a real, consistent shape instead of a bare placeholder.
 */
export function WorkspacePage({
  title,
  subtitle,
  action,
  children,
  empty,
}: {
  title: string;
  subtitle: string;
  action?: { label: string; href: string };
  children?: ReactNode;
  empty?: { headline: string; hint: string };
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-white/55">{subtitle}</p>
        </div>
        {action && (
          <Link
            href={action.href}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            {action.label}
          </Link>
        )}
      </header>
      {children ??
        (empty && (
          <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
            <div className="max-w-sm">
              <p className="text-sm text-white/70">{empty.headline}</p>
              <p className="mt-1 text-xs text-white/40">{empty.hint}</p>
            </div>
          </div>
        ))}
    </div>
  );
}

export function CardGrid({ items }: { items: { title: string; blurb: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="font-medium">{i.title}</h3>
          <p className="mt-1 text-sm text-white/55">{i.blurb}</p>
        </div>
      ))}
    </div>
  );
}
