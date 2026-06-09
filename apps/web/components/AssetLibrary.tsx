"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { createAsset, listAssets, ASSET_CATEGORIES, type AssetCategory, type AssetRow } from "../lib/library";

const PLURAL: Record<AssetCategory, string> = {
  prop: "Props",
  vehicle: "Vehicles",
  creature: "Creatures",
  logo: "Logos",
  brand: "Brands",
  object: "Objects",
};
const GRADIENT: Record<AssetCategory, string> = {
  prop: "from-amber-500/25 to-rose-500/20",
  vehicle: "from-sky-500/25 to-indigo-500/20",
  creature: "from-emerald-500/25 to-teal-500/20",
  logo: "from-fuchsia-500/25 to-purple-500/20",
  brand: "from-cyan-500/25 to-blue-500/20",
  object: "from-white/15 to-white/[0.04]",
};

/** Visual Asset Studio — reusable props, vehicles, creatures, logos and brands. */
export function AssetLibrary() {
  const { enabled, loading, user } = useAuth();
  const [items, setItems] = useState<AssetRow[] | null>(null);
  const [filter, setFilter] = useState<AssetCategory | "all">("all");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("prop");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) listAssets().then(setItems);
  }, [user]);

  const shown = useMemo(() => (items ?? []).filter((a) => filter === "all" || a.category === filter), [items, filter]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await createAsset({ name, category, description });
      setItems((prev) => [row, ...(prev ?? [])]);
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <p className="mt-1 text-sm text-white/55">
          A reusable visual library — props, vehicles, creatures, logos and brands you can drop into any project.
        </p>
      </header>

      {!enabled ? (
        <Note>Connect Supabase to save assets.</Note>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to build your asset library" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold">New asset</h2>
            <input
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Royal Carriage)"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <div className="flex flex-wrap gap-1.5">
              {ASSET_CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition ${
                    category === c ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-white/55 hover:border-white/25"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <textarea
              value={description}
              required
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe it — materials, era, distinctive details…"
              rows={4}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <button
              type="submit"
              disabled={busy || !name || !description}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Create asset"}
            </button>
            {error && <p className="text-xs text-amber-300">{error}</p>}
          </form>

          <div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
              {ASSET_CATEGORIES.map((c) => (
                <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>{PLURAL[c]}</FilterChip>
              ))}
            </div>
            {!items ? (
              <p className="text-sm text-white/40">Loading assets…</p>
            ) : shown.length === 0 ? (
              <Note>
                {items.length === 0 ? "No assets yet. Create your first on the left — it's reusable everywhere." : "Nothing in this category yet."}
              </Note>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((a) => (
                  <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <div className={`mb-2 aspect-[3/2] rounded-lg bg-gradient-to-br ${GRADIENT[(a.category as AssetCategory) ?? "object"] ?? GRADIENT.object}`} />
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/45">{a.category}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-white/55">{a.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-white/55 hover:border-white/25"
      }`}
    >
      {children}
    </button>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-sm text-white/50">
      <p className="max-w-sm">{children}</p>
    </div>
  );
}
