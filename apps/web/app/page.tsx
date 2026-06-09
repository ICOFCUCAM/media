import Link from "next/link";
import { SiteHeader } from "../components/SiteHeader";
import { PRODUCTS, WORKFLOW, SOCIAL_CHANNELS, MARKETPLACE_CATEGORIES } from "../lib/products";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-6 pt-20 pb-12 text-center">
          <p className="mb-4 inline-block rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-widest text-white/60">
            Your AI Film Studio
          </p>
          <h1 className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-semibold leading-tight text-transparent sm:text-6xl">
            Imagine it. Watch it become a film.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
            Type one idea and Cineforge writes it, casts it, films it and scores it — then publishes it
            everywhere and helps you earn from it. Netflix, Pixar and a film crew, in your browser.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/create/film"
              className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90"
            >
              Start creating →
            </Link>
            <Link
              href="/marketplace"
              className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/5"
            >
              Explore the marketplace
            </Link>
          </div>
        </section>

        {/* ── Products ─────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-4 sm:grid-cols-2">
            {PRODUCTS.map((p) => (
              <Link
                key={p.id}
                href={p.href}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-white/25"
              >
                <div
                  className={`absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${p.accent} opacity-20 blur-2xl transition group-hover:opacity-40`}
                />
                <h3 className="text-lg font-semibold">{p.title}</h3>
                <p className="mt-1 max-w-sm text-sm text-white/60">{p.tagline}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.durations.slice(0, 5).map((d) => (
                    <span key={d.value} className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-white/55">
                      {d.label}
                    </span>
                  ))}
                </div>
                <div className="mt-4 text-sm text-white/40 transition group-hover:text-white/70">Open →</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Workflow ─────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-white/40">
            Create · Edit · Publish · Monetize
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFLOW.map((w) => (
              <div key={w.step} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <div className="text-xs text-white/30">{w.step}</div>
                <div className="mt-1 text-base font-semibold">{w.title}</div>
                <p className="mt-1 text-sm text-white/55">{w.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Publish everywhere ───────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold">Publish everywhere, in one click</h2>
                <p className="mt-1 max-w-xl text-sm text-white/60">
                  Every cut is resized, captioned and delivered to each platform automatically.
                </p>
              </div>
              <Link href="/publish" className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
                Set up publishing →
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {SOCIAL_CHANNELS.map((c) => (
                <span key={c.id} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-sm text-white/70">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Monetize ─────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Earn from what you create</h2>
              <p className="mt-1 max-w-xl text-sm text-white/60">
                Sell finished films, reusable characters, story worlds and voice packs in the creator marketplace.
              </p>
            </div>
            <Link href="/marketplace" className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
              Open the marketplace →
            </Link>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {MARKETPLACE_CATEGORIES.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-3 aspect-video rounded-lg bg-gradient-to-br from-white/10 to-white/[0.02]" />
                <div className="text-sm font-medium">{c.name}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mx-auto max-w-6xl px-6 py-12 text-sm text-white/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6">
            <span>© {new Date().getFullYear()} Cineforge</span>
            <div className="flex gap-5">
              <Link href="/create/film" className="hover:text-white/70">Studio</Link>
              <Link href="/marketplace" className="hover:text-white/70">Marketplace</Link>
              <a href="https://github.com/ICOFCUCAM/media" className="hover:text-white/70">Code</a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
