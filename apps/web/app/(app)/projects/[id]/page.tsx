"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../components/AuthProvider";
import { AuthCard } from "../../../../components/AuthCard";
import { RunPanel } from "../../../../components/RunPanel";
import { SupabaseRun } from "../../../../lib/supabase-run";
import { getSupabase } from "../../../../lib/supabase";
import { fmtDuration } from "../../../../lib/system";
import type { DemoState, ProjectStatus } from "../../../../lib/demo";
import type { ProjectRow } from "../../../../lib/projects";

const STAGE_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Writing",
  GENERATING: "Filming",
  RENDERING: "Editing",
  READY: "Ready",
};

/**
 * Project command center: re-open any production — finished, failed or still
 * on the GPU — and watch the same live console the create surfaces show. All
 * state is real: historical events use their database timestamps; in-flight
 * projects keep streaming over Realtime.
 */
export default function ProjectCommandCenter({ params }: { params: { id: string } }) {
  const { enabled, loading, user } = useAuth();
  const [project, setProject] = useState<ProjectRow | null | "missing">(null);
  const [state, setState] = useState<DemoState | null>(null);

  useEffect(() => {
    if (!user) return;
    const sb = getSupabase();
    if (!sb) return;
    let run: SupabaseRun | undefined;
    void sb
      .from("projects")
      .select()
      .eq("id", params.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setProject("missing");
          return;
        }
        setProject(data);
        run = new SupabaseRun(
          { prompt: data.prompt, modelId: data.model_id, targetSeconds: data.target_seconds },
          setState,
          { id: data.id, createdAt: data.created_at, status: data.status },
        );
        void run.start().catch(() => {});
      });
    return () => run?.cancel();
  }, [user, params.id]);

  return (
    <div className="relative isolate mx-auto max-w-6xl px-6 py-8">
      <div className="cf-aurora pointer-events-none absolute right-0 top-0 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.10),transparent)] blur-3xl" />
      <header className="mb-8">
        <Link href="/projects" className="text-xs text-white/40 transition hover:text-white/70">
          ← All projects
        </Link>
        {project && project !== "missing" ? (
          <div className="mt-3">
            <p className="mb-1.5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-indigo-300/80">
              <span className="h-1 w-5 rounded-full bg-indigo-400/50" /> Production
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{project.title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/55">{project.prompt}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-white/35">
              <span className="rounded-full border border-white/10 px-2 py-0.5">{fmtDuration(project.target_seconds)}</span>
              <span className="rounded-full border border-white/10 px-2 py-0.5">{project.model_id === "cinematic" ? "✦ Cinematic" : project.model_id}</span>
              <span>created {new Date(project.created_at).toLocaleString()}</span>
            </p>
          </div>
        ) : (
          <h1 className="mt-3 text-3xl font-semibold">Project</h1>
        )}
      </header>

      {!enabled ? (
        <p className="text-sm text-white/40">Connect Supabase to open projects.</p>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to open this project" />
      ) : project === "missing" ? (
        <p className="text-sm text-white/40">Project not found (or it belongs to another account).</p>
      ) : (
        <RunPanel
          state={state}
          stageLabels={STAGE_LABELS}
          readyTitle="Film ready"
          emptyHint={<p className="text-sm">Opening production console…</p>}
        />
      )}
    </div>
  );
}
