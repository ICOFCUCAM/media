import Link from "next/link";
import { PROJECT_TYPES, CREATION_MODES, type ModeStatus } from "../../../lib/creation";

export const metadata = { title: "Create — Cineforge" };

/**
 * The multi-entry creation hub. A project can begin from any asset — a brief, a
 * script, a storyboard, an image, an existing clip, narration, a character or a
 * world. Pick what you're making, then how you want to start.
 */
export default function CreateHub() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Create anything</h1>
        <p className="mt-2 max-w-2xl text-white/60">
          A production studio, not a prompt box. Choose what you're making, then start from whatever you
          already have — an idea, a script, an image, a voice, or a whole world.
        </p>
      </header>

      {/* What are you making? */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">New project</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROJECT_TYPES.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/25"
            >
              <div className="font-medium">{t.title}</div>
              <p className="mt-1 text-sm text-white/55">{t.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* How do you want to start? */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Start from…</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CREATION_MODES.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/25"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{m.title}</h3>
                <StatusTag status={m.status} />
              </div>
              <p className="mt-1 flex-1 text-sm text-white/55">{m.blurb}</p>
              <div className="mt-3 text-xs text-white/35 transition group-hover:text-white/70">Start →</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusTag({ status }: { status: ModeStatus }) {
  if (status === "live") return null;
  const cls = status === "beta" ? "border-amber-400/40 text-amber-300" : "border-white/20 text-white/45";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>{status}</span>;
}
