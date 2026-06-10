"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";
import { HlsPlayer } from "./HlsPlayer";

/** Streaming — your channel: every finished film with adaptive playback
 *  (HLS ladder when rendered, MP4 fallback) and per-title stats. */
export function StreamingChannel() {
  const { enabled, loading, user } = useAuth();
  const [titles, setTitles] = useState<
    { projectId: string; title: string; duration: number; views: number; url: string | null; locales: string[] }[] | null
  >(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    void (async () => {
      const { data: projects } = await sb.from("projects").select("id,title,status").eq("status", "READY").order("created_at", { ascending: false }).limit(24);
      const ids = (projects ?? []).map((p) => p.id);
      if (!ids.length) return setTitles([]);
      const { data: films } = await sb.from("films").select("project_id,mp4_key,hls_key,duration_sec,views,locales").in("project_id", ids);
      const titleOf = new Map((projects ?? []).map((p) => [p.id, p.title]));
      const rows = await Promise.all(
        (films ?? []).map(async (f) => ({
          projectId: f.project_id,
          title: titleOf.get(f.project_id) ?? "Untitled",
          duration: f.duration_sec,
          views: f.views ?? 0,
          url: (f.mp4_key ? await signedUrl(f.mp4_key) : null) ?? null,
          locales: Object.keys((f.locales as Record<string, unknown> | null) ?? {}),
        })),
      );
      setTitles(rows.filter((r) => r.url));
    })();
  }, [user]);

  const current = titles?.find((t) => t.projectId === active) ?? titles?.[0];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Streaming</h1>
        <p className="mt-1 text-sm text-white/55">Your channel — every finished title, streamable now. Public channel pages ship next.</p>
      </header>

      {!enabled ? (
        <p className="text-sm text-white/45">Connect Supabase first.</p>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to open your channel" />
      ) : !titles ? (
        <p className="text-sm text-white/40">Loading titles…</p>
      ) : titles.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/55">
          No finished films yet — your channel fills itself as productions complete.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            {current?.url && <HlsPlayer src={current.url} />}
            <div className="mt-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{current?.title}</h2>
                <p className="text-xs text-white/45">
                  {Math.round(current?.duration ?? 0)}s · {current?.views ?? 0} views
                  {current?.locales.length ? ` · dubbed: ${current.locales.map((l) => l.toUpperCase()).join(", ")}` : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {titles.map((t) => (
              <button
                key={t.projectId}
                onClick={() => setActive(t.projectId)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  current?.projectId === t.projectId ? "border-white/40 bg-white/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <span className="truncate">{t.title}</span>
                <span className="ml-2 shrink-0 text-xs text-white/40">{t.views} views</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
