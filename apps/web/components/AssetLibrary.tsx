"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { StudioGate } from "./cf/StudioGate";
import { CinemaArt, type Scene } from "./cf/CinemaArt";

/** How each asset category is pictured until it has real reference art. */
const CATEGORY_SCENE: Record<string, Scene> = { prop: "interior", vehicle: "city", creature: "forest", logo: "studio", brand: "studio", object: "interior" };
import { Cell, Control, EmptyState, PageHeader, Section, SpecList, Split } from "./cf/primitives";
import { createAsset, listAssets, ASSET_CATEGORIES, type AssetCategory, type AssetRow } from "../lib/library";

const PLURAL: Record<AssetCategory, string> = {
  prop: "Props",
  vehicle: "Vehicles",
  creature: "Creatures",
  logo: "Logos",
  brand: "Brands",
  object: "Objects",
};

/** The Asset Archive (docs/design/asset-archive.html, dark room). Visual Asset Studio — reusable props, vehicles, creatures, logos and brands. */
export function AssetLibrary({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
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
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Production / Asset archive"
        title={<>The asset<br /><em>archive.</em></>}
        copy={
          <>
            <p>A reusable visual library — props, vehicles, creatures, logos and brands — and every shot your productions have painted.</p>
            <p><strong>Catalogued once. Available to every production.</strong></p>
          </>
        }
        status={{ tone: items?.length ? "live" : "idle", label: items ? `${items.length} catalogued` : "Asset archive" }}
      />
      <div className="pt-12">
        <StudioGate signIn="Sign in to build your asset library" what="Assets">
          <Split>
            <Cell>
              <form onSubmit={onCreate}>
                <div className="cf-label">Catalogue an asset</div>
                <h2 className="cf-display mt-8 text-[clamp(30px,3vw,42px)] leading-none">Add to the archive.</h2>
                <label htmlFor="asset-name" className="mb-2 mt-7 block font-sans text-[11px] font-medium uppercase tracking-[0.06em]">Name</label>
                <input id="asset-name" value={name} required onChange={(e) => setName(e.target.value)} placeholder="Royal carriage" className="cf-input font-display font-semibold text-[18px]" />
                <div className="mt-6">
                  <Control name="Category" value={category}>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Asset category">
                      {ASSET_CATEGORIES.map((c) => (
                        <button type="button" key={c} onClick={() => setCategory(c)} aria-pressed={category === c} className="cf-option">
                          {c}
                        </button>
                      ))}
                    </div>
                  </Control>
                </div>
                <label htmlFor="asset-desc" className="mb-2 mt-6 block font-sans text-[11px] font-medium uppercase tracking-[0.06em]">Description</label>
                <textarea id="asset-desc" value={description} required onChange={(e) => setDescription(e.target.value)} placeholder="Materials, era, distinctive details…" rows={4} className="cf-input resize-y" />
                <button type="submit" disabled={busy || !name || !description} className="cf-btn-accent mt-8">
                  {busy ? "Cataloguing…" : "Create asset"}
                </button>
                {error && <p role="alert" className="mt-4 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">{error}</p>}
              </form>
            </Cell>
            <Cell>
              <div className="cf-label">Holdings</div>
              <SpecList className="mt-8" rows={ASSET_CATEGORIES.map((c) => [PLURAL[c], String(items?.filter((a) => a.category === c).length ?? 0)])} />
            </Cell>
          </Split>

          <Section
            label="Catalogue"
            title={items ? `${String(shown.length).padStart(2, "0")} ${filter === "all" ? "assets" : PLURAL[filter].toLowerCase()}` : "Catalogue"}
          >
            <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label="Filter assets">
              <button type="button" className="cf-option" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
              {ASSET_CATEGORIES.map((c) => (
                <button key={c} type="button" className="cf-option" aria-pressed={filter === c} onClick={() => setFilter(c)}>
                  {PLURAL[c]}
                </button>
              ))}
            </div>
            {!items ? (
              <p className="cf-label">Loading the catalogue…</p>
            ) : shown.length === 0 ? (
              <EmptyState
                title={items.length === 0 ? <>The archive is <em>empty.</em></> : "Nothing in this category."}
                hint={items.length === 0 ? "Catalogue your first asset above — it becomes reusable everywhere." : "Try another category."}
              />
            ) : (
              <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((a, i) => (
                  <article key={a.id} className="flex min-h-[200px] flex-col bg-cf-bg">
                    <CinemaArt seed={`${a.name} ${a.description ?? ""}`} scene={CATEGORY_SCENE[a.category]} className="aspect-video" hud={{ tag: a.category }} />
                    <div className="flex flex-1 flex-col p-5">
                      <span className="font-mono text-[11px] text-cf-muted">A / {String(i + 1).padStart(3, "0")}</span>
                      <h3 className="mt-3 font-display font-semibold text-[24px] leading-tight tracking-[-0.03em]">{a.name}</h3>
                      <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-cf-muted">{a.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Section>
          {children}
        </StudioGate>
      </div>
    </div>
  );
}
