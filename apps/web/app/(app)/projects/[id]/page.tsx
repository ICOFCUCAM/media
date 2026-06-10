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
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <Link href="/projects" className="text-xs text-white/40 hover:text-white/70">
          ← All projects
        </Link>
        {project && project !== "missing" ? (
          <div className="mt-2">
            <h1 className="text-2xl font-semibold">{project.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-white/55">{project.prompt}</p>
            <p className="mt-1 text-xs text-white/35">
              {fmtDuration(project.target_seconds)} target · {project.model_id} · created {new Date(project.created_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <h1 className="mt-2 text-2xl font-semibold">Project</h1>
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
