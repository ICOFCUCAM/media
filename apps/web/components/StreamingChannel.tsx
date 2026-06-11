"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";
import { HlsPlayer } from "./HlsPlayer";
import { SkeletonCards } from "./Skeleton";
import { featureFilm } from "../lib/showcase";

/** Streaming — your channel: every finished film with adaptive playback
 *  (HLS ladder when rendered, MP4 fallback) and per-title stats. */
export function StreamingChannel() {
  const { enabled, loading, user, profile } = useAuth();
  const isAdmin = profile?.role === "ADMIN";
  const [notice, setNotice] = useState<string | null>(null);
  const [titles, setTitles] = useState<
    { projectId: string; title: string; duration: number; views: number; mp4Key: string; url: string | null; locales: string[] }[] | null
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
          mp4Key: f.mp4_key,
          url: (f.mp4_key ? await signedUrl(f.mp4_key) : null) ?? null,
          locales: Object.keys((f.locales as Record<string, unknown> | null) ?? {}),
        })),
      );
      setTitles(rows.filter((r) => r.url));
    })();
  }, [user]);

  const current = titles?.find((t) => t.projectId === active) ?? titles?.[0];

  async function onDelete(projectId: string, title: string) {
    if (!window.confirm(`Delete "${title}"? The project and its film are removed from your channel.`)) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("projects").delete().eq("id", projectId);
    setTitles((prev) => prev?.filter((t) => t.projectId !== projectId) ?? prev);
    if (active === projectId) setActive(null);
  }

  async function onFeature(t: { projectId: string; title: string; mp4Key: string }) {
    setNotice(null);
    try {
      await featureFilm(t.projectId, t.mp4Key, t.title);
      setNotice(`"${t.title}" is now featured on the homepage ✓`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Feature failed");
    }
  }

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
        <SkeletonCards cards={4} />
      ) : titles.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/55">
          No finished films yet — your channel fills itself as productions complete.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            {current?.url && (
              <div className="overflow-hidden rounded-2xl border border-white/15 shadow-[0_0_80px_-30px_rgba(99,102,241,0.8)]">
                <HlsPlayer src={current.url} />
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">{current?.title}</h2>
                <p className="text-xs text-white/45">
                  {Math.round(current?.duration ?? 0)}s · {current?.views ?? 0} views
                  {current?.locales.length ? ` · dubbed: ${current.locales.map((l) => l.toUpperCase()).join(", ")}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {isAdmin && current && (
                  <button
                    onClick={() => void onFeature(current)}
                    className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-400/10"
                  >
                    ★ Feature on homepage
                  </button>
                )}
                {current && (
                  <button
                    onClick={() => void onDelete(current.projectId, current.title)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/50 transition hover:border-rose-400/40 hover:text-rose-300"
                  >
                    ✕ Delete
                  </button>
                )}
              </div>
            </div>
            {notice && <p className="mt-2 text-xs text-amber-200">{notice}</p>}
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
