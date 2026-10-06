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
import { EmptyState, SpecList } from "../../../../components/cf/primitives";

const STAGE_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Writing",
  GENERATING: "Filming",
  RENDERING: "Editing",
  READY: "Ready",
};

/**
 * The production file (docs/design/cutting-room.html, dark room) — project
 * command center: re-open any production — finished, failed or still
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

  const ready = state?.status === "READY";
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <Link href="/projects" className="cf-link text-cf-muted hover:text-cf-fg">
        ← The archive
      </Link>

      {project && project !== "missing" ? (
        <header className="mt-8 grid gap-10 border-b border-cf-line pb-12 lg:grid-cols-[1.35fr_0.65fr] lg:gap-[6vw]">
          <div className="min-w-0">
            <div className="cf-eyebrow mb-5">Production file / CF {project.id.slice(0, 4).toUpperCase()}</div>
            <h1 className="cf-display text-[clamp(40px,5.5vw,92px)] leading-[0.9]">{project.title}</h1>
            {project.prompt && <p className="mt-6 max-w-3xl text-[14px] leading-[1.75] text-cf-muted">{project.prompt}</p>}
          </div>
          <div className="self-end">
            <SpecList
              rows={[
                ["Runtime", fmtDuration(project.target_seconds)],
                ["Engine", project.model_id === "cinematic" ? "Cinematic" : project.model_id],
                ["Format", project.resolution],
                ["Mode", project.mode === "storyboard" ? "Scene-by-scene" : "Auto"],
                ["Created", new Date(project.created_at).toLocaleString()],
              ]}
            />
            <div className="mt-6 flex flex-wrap gap-2">
              {ready && (
                <Link href="/publish" className="cf-btn-accent">
                  Publish →
                </Link>
              )}
              <Link href="/create" className="cf-btn-line">
                New production
              </Link>
            </div>
          </div>
        </header>
      ) : (
        <h1 className="cf-display mt-8 border-b border-cf-line pb-12 text-[clamp(40px,5.5vw,92px)] leading-[0.9]">Production file</h1>
      )}

      <div className="pt-12">
        {!enabled ? (
          <EmptyState title={<>Productions need <em>a studio.</em></>} hint="Connect Supabase (NEXT_PUBLIC_SUPABASE_URL) to open projects." />
        ) : loading ? (
          <p className="cf-label">Opening the production…</p>
        ) : !user ? (
          <AuthCard title="Sign in to open this project" />
        ) : project === "missing" ? (
          <EmptyState title="Not in your archive." hint="This project does not exist, or it belongs to another account." action={{ label: "Back to the archive", href: "/projects" }} />
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between border-b border-t border-b-cf-line border-t-cf-fg py-4">
              <span className="cf-label text-cf-fg">Production console</span>
              <span className="cf-label">{state ? STAGE_LABELS[state.status] : "Connecting"}</span>
            </div>
            <RunPanel
              state={state}
              stageLabels={STAGE_LABELS}
              readyTitle="Film ready"
              emptyHint={<p className="cf-display text-[40px] leading-none">Opening the production console…</p>}
            />
          </>
        )}
      </div>
    </div>
  );
}
