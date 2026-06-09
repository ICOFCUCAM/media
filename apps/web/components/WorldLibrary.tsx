"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { createLocation, listLocations, LOCATION_KINDS, type LocationRow } from "../lib/library";
import type { LocationKind } from "../lib/database.types";

/** Create and browse reusable worlds — locations, lore, consistent across films. */
export function WorldLibrary() {
  const { enabled, loading, user } = useAuth();
  const [items, setItems] = useState<LocationRow[] | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LocationKind>("CITY");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) listLocations().then(setItems);
  }, [user]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await createLocation({ name, kind, description });
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
        <h1 className="text-2xl font-semibold">Worlds</h1>
        <p className="mt-1 text-sm text-white/55">
          Build a place once — a city, kingdom or landscape — and film inside it again and again.
        </p>
      </header>

      {!enabled ? (
        <Note>Connect Supabase to save worlds.</Note>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to build your worlds" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold">New world</h2>
            <input
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Old Lagos)"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <div className="flex flex-wrap gap-1.5">
              {LOCATION_KINDS.map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wider transition ${
                    kind === k ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-white/55 hover:border-white/25"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <textarea
              value={description}
              required
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the place — architecture, era, mood, weather…"
              rows={4}
              className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            <button
              type="submit"
              disabled={busy || !name || !description}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Create world"}
            </button>
            {error && <p className="text-xs text-amber-300">{error}</p>}
          </form>

          <div>
            {!items ? (
              <p className="text-sm text-white/40">Loading worlds…</p>
            ) : items.length === 0 ? (
              <Note>No worlds yet. Create your first on the left — then set stories inside it.</Note>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((l) => (
                  <div key={l.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="mb-2 aspect-[3/2] rounded-lg bg-gradient-to-br from-emerald-500/25 to-sky-500/20" />
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{l.name}</span>
                      <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/45">{l.kind}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-white/55">{l.description}</p>
                    <Link href="/create/film?mode=storyboard" className="mt-3 inline-block text-xs text-white/40 hover:text-white">
                      Set a story here →
                    </Link>
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

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-sm text-white/50">
      <p className="max-w-sm">{children}</p>
    </div>
  );
}
