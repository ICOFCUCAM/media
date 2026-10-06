"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { StudioGate } from "./cf/StudioGate";
import { EmptyState, PageHeader, Section } from "./cf/primitives";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";
import { SkeletonRows } from "./Skeleton";

/**
 * The Score Room (docs/design/score-room-music.html). Music & audio library — every track the pipeline produced for your
 * projects (narration, and the film score when the score engine is configured) plus the
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
  const { user } = useAuth();
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

  const kinds = [...new Set((tracks ?? []).map((t) => t.kind))];
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Production / The score room"
        title={<>The score<br /><em>room.</em></>}
        copy={
          <>
            <p>Music is not decoration. It establishes the emotional architecture of a film.</p>
            <p><strong>Every track your productions generated, kept beside the scenes it was made for — narration for every scene, and each film's score, composed for the whole cut.</strong></p>
          </>
        }
        status={{ tone: tracks?.length ? "live" : "idle", label: tracks ? `${tracks.length} tracks` : "Score room" }}
      />
      <div className="pt-12">
        <StudioGate signIn="Sign in to browse your audio" what="Tracks">
          <Section label="Production audio" title={tracks ? `${String(tracks.length).padStart(2, "0")} tracks` : "Tracks"} aside={kinds.length > 0 ? <span className="cf-label">{kinds.join(" · ")}</span> : undefined}>
            {!tracks ? (
              <SkeletonRows rows={4} />
            ) : tracks.length === 0 ? (
              <EmptyState
                title={<>Silence, <em>for now.</em></>}
                hint="Generate a film with narration, or create readings in the Voice Room — every track lands here."
                action={{ label: "Open the voice room", href: "/library/voices" }}
              />
            ) : (
              <ol className="border-t border-cf-fg">
                {tracks.map((t, i) => (
                  <TrackRow key={t.id} n={i + 1} row={t} />
                ))}
              </ol>
            )}
          </Section>
        </StudioGate>
      </div>
    </div>
  );
}

function TrackRow({ n, row }: { n: number; row: TrackRow }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void signedUrl(row.key).then(setUrl);
  }, [row.key]);
  return (
    <li className="grid gap-3 border-b border-cf-line py-4 md:grid-cols-[36px_1fr_0.5fr_1.2fr] md:items-center">
      <span className="font-mono text-[9px] text-cf-muted">{String(n).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="truncate font-serif text-[19px]">{row.title}</div>
        <div className="cf-label mt-1">{new Date(row.created_at).toLocaleDateString()}</div>
      </div>
      <span className="cf-label">{row.kind.toLowerCase()}</span>
      {url ? <audio controls src={url} className="h-9 w-full" aria-label={`Play ${row.kind.toLowerCase()} from ${row.title}`} /> : <span className="cf-label text-cf-dim">Signing…</span>}
    </li>
  );
}
