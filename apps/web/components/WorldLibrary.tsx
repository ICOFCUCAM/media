"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { StudioGate } from "./cf/StudioGate";
import { Composer } from "./cf/Composer";
import { CinemaArt } from "./cf/CinemaArt";
import { Cell, Control, EmptyState, PageHeader, Section, SpecList, Split } from "./cf/primitives";
import { createLocation, listLocations, LOCATION_KINDS, type LocationWithOrigin } from "../lib/library";
import type { LocationKind } from "../lib/database.types";

/** Production Design (docs/design/production-design-worlds.html, dark room).
 *  Create and browse reusable worlds — locations, lore, consistent across films. */
export function WorldLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState<LocationWithOrigin[] | null>(null);
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
      setItems((prev) => [{ ...row, projects: { title: "Library" } }, ...(prev ?? [])]);
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        art={false}
        eyebrow="Production / Production design"
        title={<>Design the<br /><em>world.</em></>}
        copy={
          <>
            <p>Build a place once — a city, kingdom or landscape — and film inside it again and again.</p>
            <p><strong>Locations keep their architecture, era and weather in every scene that uses them.</strong></p>
          </>
        }
        status={{ tone: items?.length ? "live" : "idle", label: items ? `${items.length} locations` : "Production design" }}
      />
      <div className="pt-12">
        <StudioGate signIn="Sign in to build your worlds" what="Worlds">
          <Composer label="New location" count={items ? items.length : null}>
          <Split>
            <Cell>
              <form onSubmit={onCreate}>
                <div className="cf-label">New location</div>
                <h2 className="cf-display mt-8 text-[clamp(30px,3vw,42px)] leading-none">Describe the place.</h2>
                <label htmlFor="world-name" className="mb-2 mt-7 block font-sans text-[11px] font-medium uppercase tracking-[0.06em]">Name</label>
                <input id="world-name" value={name} required onChange={(e) => setName(e.target.value)} placeholder="Old Lagos" className="cf-input font-display font-semibold text-[18px]" />
                <div className="mt-6">
                  <Control name="Kind" value={kind}>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Location kind">
                      {LOCATION_KINDS.map((k) => (
                        <button type="button" key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className="cf-option">
                          {k}
                        </button>
                      ))}
                    </div>
                  </Control>
                </div>
                <label htmlFor="world-desc" className="mb-2 mt-6 block font-sans text-[11px] font-medium uppercase tracking-[0.06em]">Description</label>
                <textarea id="world-desc" value={description} required onChange={(e) => setDescription(e.target.value)} placeholder="Architecture, era, mood, weather…" rows={4} className="cf-input resize-y" />
                <button type="submit" disabled={busy || !name || !description} className="cf-btn-accent mt-8">
                  {busy ? "Building…" : "Create world"}
                </button>
                {error && <p role="alert" className="mt-4 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">{error}</p>}
              </form>
            </Cell>
            <Cell>
              <div className="cf-label">Locations by kind</div>
              <SpecList
                className="mt-8"
                rows={LOCATION_KINDS.map((k) => [k.toLowerCase(), String(items?.filter((l) => l.kind === k).length ?? 0)])}
              />
            </Cell>
          </Split>
          </Composer>

          <Section label="The world bible" title={items ? `${String(items.length).padStart(2, "0")} locations` : "Locations"}>
            {!items ? (
              <p className="cf-label">Loading locations…</p>
            ) : items.length === 0 ? (
              <EmptyState title={<>No worlds <em>yet.</em></>} hint="Create your first location above — then set stories inside it." />
            ) : (
              <ol className="border-t border-cf-line">
                {items.map((l) => (
                  <li key={l.id} className="grid gap-4 border-b border-cf-line py-6 md:grid-cols-[200px_1fr_1.4fr_auto] md:items-start">
                    <CinemaArt seed={`${l.kind} ${l.name} ${l.description ?? ""}`} letterbox className="aspect-video rounded-md" hud={{ tag: l.kind }} />
                    <div>
                      <h3 className="font-display font-semibold text-[26px] leading-none tracking-[-0.03em]">{l.name}</h3>
                      <span className="cf-label mt-2 block">
                        {l.kind}
                        {l.projects?.title && l.projects.title !== "Library" ? ` · from “${l.projects.title}”` : " · Library"}
                      </span>
                    </div>
                    <p className="text-[13px] leading-relaxed text-cf-muted">{l.description}</p>
                    <Link href="/create/film?mode=storyboard" className="cf-link whitespace-nowrap text-cf-muted hover:text-cf-fg">
                      Set a story here →
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </StudioGate>
      </div>
    </div>
  );
}
