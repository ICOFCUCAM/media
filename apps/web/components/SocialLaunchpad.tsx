"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { getSupabase } from "../lib/supabase";

/**
 * Social Launchpad (docs/31) — upload any video, the AI writes a per-platform
 * launch kit (title/description/hashtags tuned for each platform), then one
 * button posts it to every connected platform. Rows are written PENDING; the
 * worker builds the kit and performs the launch.
 */

const PLATFORM_META: Record<string, { label: string; hint: string }> = {
  youtube: { label: "YouTube", hint: "uploads as PRIVATE — review, then publish" },
  tiktok: { label: "TikTok", hint: "lands in your TikTok inbox to confirm" },
  instagram: { label: "Instagram", hint: "publishes as a Reel" },
  facebook: { label: "Facebook", hint: "posts to your Page" },
  x: { label: "X", hint: "needs paid API tier" },
};

interface LaunchRow {
  id: string;
  brief: string;
  status: string;
  kit: Record<string, { title: string; description: string; hashtags: string[] }> | null;
  results: Record<string, { status: string; url?: string; detail?: string }> | null;
  error_message: string | null;
  created_at: string;
}

const BUCKET = "cineforge-assets";

export function SocialLaunchpad() {
  const { enabled, loading, user } = useAuth();
  const [launches, setLaunches] = useState<LaunchRow[] | null>(null);
  const [brief, setBrief] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !user) return;
    const { data } = await sb
      .from("social_launches")
      .select("id,brief,status,kit,results,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setLaunches(data as unknown as LaunchRow[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [user, refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    const file = fileRef.current?.files?.[0];
    if (!sb || !user || !file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const key = `launches/${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(key, file, { upsert: true });
      if (up.error) throw new Error(up.error.message);
      const ins = await sb.from("social_launches").insert({ user_id: user.id, video_key: key, brief });
      if (ins.error) throw new Error(ins.error.message);
      setBrief("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLaunch(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("social_launches").update({ status: "LAUNCH_REQUESTED" }).eq("id", id);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Publish Everywhere</h1>
        <p className="mt-1 text-sm text-white/55">
          Upload a video and a one-line brief — the AI writes the launch kit for every platform, then one button posts
          it to every connected account.
        </p>
      </header>

      {!enabled ? (
        <Note>Connect Supabase to publish.</Note>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to publish" />
      ) : (
        <div className="space-y-6">
          <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold">New launch</h2>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              required
              className="w-full text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white"
            />
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What is this video? One or two sentences — the AI expands it into every platform's title, description and hashtags…"
              required
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
            />
            <button
              type="submit"
              disabled={busy || !brief.trim()}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Uploading…" : "Upload & build launch kit"}
            </button>
            {error && <p className="text-xs text-amber-300">{error}</p>}
          </form>

          {!launches ? (
            <p className="text-sm text-white/40">Loading…</p>
          ) : launches.length === 0 ? (
            <Note>No launches yet. Upload your first video above.</Note>
          ) : (
            launches.map((l) => <LaunchCard key={l.id} row={l} onLaunch={() => onLaunch(l.id)} />)
          )}
        </div>
      )}
    </div>
  );
}

function LaunchCard({ row, onLaunch }: { row: LaunchRow; onLaunch: () => void }) {
  const kitReady = row.status === "KIT_READY" || row.status === "LAUNCHED" || row.status === "LAUNCHING" || row.status === "LAUNCH_REQUESTED";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.brief || "Untitled launch"}</div>
          <div className="text-xs text-white/40">{new Date(row.created_at).toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
            {row.status.replace(/_/g, " ").toLowerCase()}
          </span>
          {row.status === "KIT_READY" && (
            <button
              onClick={onLaunch}
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-300"
            >
              🚀 Launch everywhere
            </button>
          )}
        </div>
      </div>

      {row.error_message && <p className="mt-2 text-xs text-amber-300">{row.error_message}</p>}

      {kitReady && row.kit && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(row.kit).map(([platform, k]) => {
            const meta = PLATFORM_META[platform] ?? { label: platform, hint: "" };
            const result = row.results?.[platform];
            return (
              <div key={platform} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{meta.label}</span>
                  {result && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                        result.status === "published"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : result.status === "skipped"
                            ? "bg-white/10 text-white/45"
                            : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {result.status}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-xs text-white/80" title={k.title}>
                  {k.title}
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-white/50">{k.description}</p>
                <p className="mt-1 truncate text-[11px] text-sky-300/70">{k.hashtags?.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
                {result?.url && (
                  <a href={result.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-emerald-300 underline">
                    View post →
                  </a>
                )}
                {result?.detail && <p className="mt-1 text-[10px] text-white/40">{result.detail}</p>}
                {!result && <p className="mt-1 text-[10px] text-white/35">{meta.hint}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/55">{children}</div>;
}
