"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { createCharacter, listCharacters, type CharacterWithOrigin } from "../lib/library";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";

/** Create and browse reusable characters — locked identity, reusable anywhere. */
export function CharacterLibrary() {
  const { enabled, loading, user } = useAuth();
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
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Characters</h1>
        <p className="mt-1 text-sm text-white/55">
          Design a cast once — locked identity, look and personality — then reuse them across any project.
        </p>
      </header>

      {!enabled ? (
        <Note>Connect Supabase to save characters.</Note>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to build your cast" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold">New character</h2>
            <Input value={name} onChange={setName} placeholder="Name (e.g. Amara)" required />
            <Textarea value={appearance} onChange={setAppearance} placeholder="Appearance — age, build, features, wardrobe…" required />
            <Textarea value={personality} onChange={setPersonality} placeholder="Personality & arc (optional)" />
            <button
              type="submit"
              disabled={busy || !name || !appearance}
              className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Create character"}
            </button>
            {error && <p className="text-xs text-amber-300">{error}</p>}
          </form>

          <div>
            {!items ? (
              <p className="text-sm text-white/40">Loading characters…</p>
            ) : items.length === 0 ? (
              <Note>No characters yet. Create your first on the left — it becomes reusable everywhere.</Note>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((c) => (
                  <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    {portraits[c.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portraits[c.id]} alt={c.name} className="mb-2 aspect-[3/2] w-full rounded-lg object-cover" />
                    ) : (
                      <div className="mb-2 aspect-[3/2] rounded-lg bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20" />
                    )}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-medium">{c.name}</div>
                      {c.projects?.title && (
                        <span className="truncate text-[10px] uppercase tracking-wider text-white/35">
                          {c.projects.title === "Library" ? "Library" : `cast of "${c.projects.title}"`}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-white/55">{c.appearance}</p>
                    <Link href="/create/film?mode=storyboard" className="mt-3 inline-block text-xs text-white/40 hover:text-white">
                      Use in a film →
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

function Input({ value, onChange, placeholder, required }: { value: string; onChange: (v: string) => void; placeholder: string; required?: boolean }) {
  return (
    <input
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
    />
  );
}
function Textarea({ value, onChange, placeholder, required }: { value: string; onChange: (v: string) => void; placeholder: string; required?: boolean }) {
  return (
    <textarea
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
    />
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-sm text-white/50">
      <p className="max-w-sm">{children}</p>
    </div>
  );
}
