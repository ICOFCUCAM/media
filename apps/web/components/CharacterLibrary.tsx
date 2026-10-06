"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { StudioGate } from "./cf/StudioGate";
import { Cell, EmptyState, PageHeader, Section, SpecList, Split } from "./cf/primitives";
import { createCharacter, listCharacters, type CharacterWithOrigin } from "../lib/library";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";

/** The Casting Room (docs/design/casting-room-characters.html, dark room).
 *  Create and browse reusable characters — locked identity, reusable anywhere. */
export function CharacterLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState<CharacterWithOrigin[] | null>(null);
  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState("");
  const [personality, setPersonality] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [portraits, setPortraits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    void listCharacters().then(async (rows) => {
      setItems(rows);
      // Portrait = the first painted still of the character's film.
      const sb = getSupabase();
      if (!sb) return;
      const projectIds = [...new Set(rows.map((r) => r.project_id).filter(Boolean))] as string[];
      if (!projectIds.length) return;
      const { data: scenes } = await sb.from("scenes").select("id,project_id").in("project_id", projectIds).eq("index", 0);
      const sceneByProject = new Map((scenes ?? []).map((s) => [s.project_id, s.id]));
      const found: Record<string, string> = {};
      for (const r of rows) {
        const sceneId = r.project_id ? sceneByProject.get(r.project_id) : undefined;
        if (!sceneId) continue;
        const { data: shot } = await sb.from("shots").select("seed_image_key").eq("scene_id", sceneId).eq("index", 0).maybeSingle();
        if (shot?.seed_image_key) {
          const url = await signedUrl(shot.seed_image_key);
          if (url) found[r.id] = url;
        }
      }
      setPortraits(found);
    });
  }, [user]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await createCharacter({ name, appearance, personality });
      setItems((prev) => [{ ...row, projects: { title: "Library" } }, ...(prev ?? [])]);
      setName("");
      setAppearance("");
      setPersonality("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Production / Casting room"
        title={<>Cast the<br /><em>story.</em></>}
        copy={
          <>
            <p>Design a cast once — locked identity, look and personality — then reuse them in any production.</p>
            <p><strong>Every scene that names a character inherits who they are.</strong></p>
          </>
        }
        status={{ tone: items?.length ? "live" : "idle", label: items ? `${items.length} in the cast` : "Casting room" }}
      />
      <div className="pt-12">
        <StudioGate signIn="Sign in to build your cast" what="Characters">
          <Split>
            <Cell>
              <form onSubmit={onCreate}>
                <div className="cf-label">New character</div>
                <h2 className="cf-display mt-8 text-[clamp(30px,3vw,42px)] leading-none">Open a casting call.</h2>
                <Field id="char-name" label="Name">
                  <input id="char-name" value={name} required onChange={(e) => setName(e.target.value)} placeholder="Amara" className="cf-input font-serif text-[18px]" />
                </Field>
                <Field id="char-look" label="Appearance">
                  <textarea id="char-look" value={appearance} required rows={3} onChange={(e) => setAppearance(e.target.value)} placeholder="Age, build, features, wardrobe…" className="cf-input resize-y" />
                </Field>
                <Field id="char-arc" label="Personality & arc · optional">
                  <textarea id="char-arc" value={personality} rows={3} onChange={(e) => setPersonality(e.target.value)} placeholder="Who they are and where they are going" className="cf-input resize-y" />
                </Field>
                <button type="submit" disabled={busy || !name || !appearance} className="cf-btn-accent mt-8">
                  {busy ? "Casting…" : "Create character"}
                </button>
                {error && <p role="alert" className="mt-4 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">{error}</p>}
              </form>
            </Cell>
            <Cell>
              <div className="cf-label">How casting works</div>
              <SpecList
                className="mt-8"
                rows={[
                  ["Identity", "Locked"],
                  ["Reuse", "Every production"],
                  ["Anchor", "Scene-by-scene board"],
                  ["Portrait", "First painted still"],
                ]}
              />
            </Cell>
          </Split>

          <Section label="The cast" title={items ? `${String(items.length).padStart(2, "0")} characters` : "The cast"}>
            {!items ? (
              <p className="cf-label">Loading the cast…</p>
            ) : items.length === 0 ? (
              <EmptyState title={<>No one is <em>cast yet.</em></>} hint="Create your first character above — it becomes reusable everywhere." />
            ) : (
              <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 xl:grid-cols-3">
                {items.map((c, i) => (
                  <article key={c.id} className="flex flex-col bg-cf-bg">
                    <div className="relative aspect-[4/5] overflow-hidden bg-cf-panel">
                      {portraits[c.id] ? (
                        /* Plain <img>: a signed, short-lived storage URL. */
                        <img src={portraits[c.id]} alt={`Portrait of ${c.name}`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="cf-label text-cf-dim">No portrait yet</span>
                        </div>
                      )}
                      <span className="absolute left-4 top-4 font-mono text-[9px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-serif text-[26px] leading-none tracking-[-0.03em]">{c.name}</h3>
                        <span className="cf-label truncate">{c.projects?.title === "Library" || !c.projects ? "Library" : c.projects.title}</span>
                      </div>
                      <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-cf-muted">{c.appearance}</p>
                      <Link href="/create/film?mode=storyboard" className="cf-link mt-auto pt-5 text-cf-muted hover:text-cf-fg">
                        Cast in a film →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Section>
        </StudioGate>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <label htmlFor={id} className="mb-2 block font-mono text-[9px] uppercase tracking-[0.1em]">
        {label}
      </label>
      {children}
    </div>
  );
}
