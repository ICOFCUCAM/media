"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";

/**
 * Music & audio library — every track the pipeline produced for your
 * projects (scores when the music engine lands, narration today) plus the
 * Voice Lab readings, all playable in one place.
 */

interface TrackRow {
  id: string;
  kind: string;
  key: string;
  created_at: string;
  title: string;
}

export function MusicLibrary() {
  const { enabled, loading, user } = useAuth();
  const [tracks, setTracks] = useState<TrackRow[] | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    void (async () => {
      // Per-scene tracks of the user's projects (RLS scopes the join).
      const { data: scenes } = await sb.from("scenes").select("id,project_id,projects(title)").limit(400);
      const sceneTitle = new Map((scenes ?? []).map((s) => [s.id, (s as { projects?: { title?: string } }).projects?.title ?? "Untitled film"]));
      const ids = (scenes ?? []).map((s) => s.id);
      const rows: TrackRow[] = [];
      if (ids.length) {
        const { data: at } = await sb.from("audio_tracks").select("id,scene_id,kind,key,created_at").in("scene_id", ids).order("created_at", { ascending: false }).limit(60);
        for (const t of at ?? []) rows.push({ id: t.id, kind: t.kind, key: t.key, created_at: t.created_at, title: sceneTitle.get(t.scene_id) ?? "Untitled" });
      }
      setTracks(rows);
    })();
  }, [user]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Music & Audio</h1>
        <p className="mt-1 text-sm text-white/55">Every track your productions generated — narration today, scores when the music engine arrives.</p>
      </header>
      {!enabled ? (
        <p className="text-sm text-white/45">Connect Supabase to see your audio.</p>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to browse your audio" />
      ) : !tracks ? (
        <p className="text-sm text-white/40">Loading tracks…</p>
      ) : tracks.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/55">
          No tracks yet — generate a film with narration, or create readings in the <a className="underline" href="/library/voices">Voice Lab</a>.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tracks.map((t) => (
            <TrackCard key={t.id} row={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrackCard({ row }: { row: TrackRow }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void signedUrl(row.key).then(setUrl);
  }, [row.key]);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.title}</div>
          <div className="text-[11px] text-white/40">{row.kind.toLowerCase()} · {new Date(row.created_at).toLocaleDateString()}</div>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/50">{row.kind}</span>
      </div>
      {url && <audio controls src={url} className="mt-3 w-full" />}
    </div>
  );
}
