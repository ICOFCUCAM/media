import { MARKETPLACE_CATEGORIES } from "../../../lib/products";
import { MarketplaceVoices } from "../../../components/MarketplaceVoices";

export const metadata = { title: "Marketplace — Cineforge" };

export default function MarketplacePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Creator Marketplace</h1>
          <p className="mt-1 text-sm text-white/55">
            Turn what you make into a catalog. Sell films, characters, worlds, voices and templates — set your own price.
          </p>
        </div>
        <button className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90">
          List an asset
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MARKETPLACE_CATEGORIES.map((c) => (
          <div
            key={c.id}
            className="group rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20"
          >
            <div className="mb-3 aspect-video rounded-lg bg-gradient-to-br from-white/10 to-white/[0.02]" />
            <h3 className="font-medium">{c.name}</h3>
            <p className="mt-1 text-sm text-white/55">{c.blurb}</p>
            <div className="mt-3 text-xs text-white/35 group-hover:text-white/60">Browse →</div>
          </div>
        ))}
      </div>

      <MarketplaceVoices />

      <section className="mt-10 grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-6 sm:grid-cols-3">
        {[
          { k: "Keep 90%", v: "Industry-leading creator split on every sale." },
          { k: "Licensing built in", v: "Personal, commercial and extended licenses, handled for you." },
          { k: "Instant delivery", v: "Buyers get assets that drop straight into their own projects." },
        ].map((x) => (
          <div key={x.k}>
            <div className="text-sm font-semibold">{x.k}</div>
            <p className="mt-1 text-sm text-white/55">{x.v}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
