"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import { AuthCard } from "../../../components/AuthCard";
import { listProjects, type ProjectRow } from "../../../lib/projects";
import { getSupabase } from "../../../lib/supabase";
import { fmtDuration } from "../../../lib/system";

const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLANNING: "Queued",
  GENERATING: "Filming",
  RENDERING: "Editing",
  READY: "Ready",
  PAUSED: "Paused",
  FAILED: "Failed",
};

const ACTIVE = new Set(["PLANNING", "GENERATING", "RENDERING"]);

export default function ProjectsPage() {
  const { enabled, loading, user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    void listProjects(50).then(setProjects);

    // Live board: any status/progress change to the user's projects updates the
    // row in place (RLS scopes the stream to the signed-in owner).
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel("projects:board")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "projects" }, (payload) => {
        const row = payload.new as ProjectRow;
        setProjects((prev) => prev?.map((p) => (p.id === row.id ? row : p)) ?? prev);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "projects" }, (payload) => {
        const row = payload.new as ProjectRow;
        setProjects((prev) => (prev && !prev.some((p) => p.id === row.id) ? [row, ...prev] : prev));
      })
      .subscribe();
    return () => void channel.unsubscribe();
  }, [user]);

  async function onDelete(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? The project and its scenes are removed (clips stay in storage).`)) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("projects").delete().eq("id", id);
    setProjects((prev) => prev?.filter((p) => p.id !== id) ?? prev);
  }

  const active = projects?.filter((p) => ACTIVE.has(p.status)).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1.5 flex items-center gap-2 text-sm text-white/55">
            Every film, series, trailer and short you're working on.
            {active > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="cf-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                {active} in production now
              </span>
            )}
          </p>
        </div>
        <Link
          href="/create/film"
          className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black shadow-[0_0_24px_-8px_rgba(255,255,255,0.6)] transition hover:shadow-[0_0_40px_-8px_rgba(165,180,252,0.8)]"
        >
          + New project
        </Link>
      </header>

      {!enabled ? (
        <Empty headline="Connect Supabase to save projects." hint="Set NEXT_PUBLIC_SUPABASE_URL to persist your work." />
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to see your projects" />
      ) : !projects ? (
        <p className="text-sm text-white/40">Loading projects…</p>
      ) : projects.length === 0 ? (
        <Empty headline="No projects yet." hint="Start in the Studio — your films and series collect here." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Runtime</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Progress</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/projects/${p.id}`)}
                  className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.04]"
                >
                  <td className="max-w-xs truncate px-4 py-2.5 text-white/80">{p.title}</td>
                  <td className="px-4 py-2.5 text-white/55">{fmtDuration(p.target_seconds)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        p.status === "READY"
                          ? "border-emerald-400/40 text-emerald-300"
                          : p.status === "FAILED"
                            ? "border-rose-400/40 text-rose-300"
                            : ACTIVE.has(p.status)
                              ? "border-white/30 text-white/80"
                              : "border-white/20 text-white/50"
                      }`}
                    >
                      {ACTIVE.has(p.status) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
                      {STAGE_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white/55">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full transition-all ${p.status === "FAILED" ? "bg-rose-400/70" : "bg-emerald-400/70"}`}
                          style={{ width: `${Math.round(p.progress * 100)}%` }}
                        />
                      </div>
                      {Math.round(p.progress * 100)}%
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-white/40">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    {!ACTIVE.has(p.status) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void onDelete(p.id, p.title);
                        }}
                        title="Delete project"
                        className="rounded px-2 py-1 text-xs text-white/30 transition hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Empty({ headline, hint }: { headline: string; hint: string }) {
  return (
    <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-white/10 text-center">
      <div className="max-w-sm">
        <p className="text-sm text-white/70">{headline}</p>
        <p className="mt-1 text-xs text-white/40">{hint}</p>
      </div>
    </div>
  );
}
