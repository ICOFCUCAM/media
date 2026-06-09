"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import { AuthCard } from "../../../components/AuthCard";
import { listProjects, type ProjectRow } from "../../../lib/projects";
import { fmtDuration } from "../../../lib/system";

const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLANNING: "Writing",
  GENERATING: "Filming",
  RENDERING: "Editing",
  READY: "Ready",
  PAUSED: "Paused",
  FAILED: "Failed",
};

export default function ProjectsPage() {
  const { enabled, loading, user } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);

  useEffect(() => {
    if (user) listProjects(50).then(setProjects);
  }, [user]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="mt-1 text-sm text-white/55">Every film, series, trailer and short you're working on.</p>
        </div>
        <Link
          href="/create/film"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
        >
          New project
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
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="max-w-xs truncate px-4 py-2.5 text-white/80">{p.title}</td>
                  <td className="px-4 py-2.5 text-white/55">{fmtDuration(p.target_seconds)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                        p.status === "READY"
                          ? "border-emerald-400/40 text-emerald-300"
                          : p.status === "FAILED"
                            ? "border-rose-400/40 text-rose-300"
                            : "border-white/20 text-white/50"
                      }`}
                    >
                      {STAGE_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white/55">{Math.round(p.progress * 100)}%</td>
                  <td className="px-4 py-2.5 text-white/40">{new Date(p.created_at).toLocaleDateString()}</td>
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
