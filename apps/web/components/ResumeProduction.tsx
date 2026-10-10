"use client";

import { useCallback, useEffect, useState } from "react";
import { loadResumeState, requestResume, type ResumeState } from "../lib/production";

/**
 * Resume a paused film (W23; docs/24 §C8). The budget governor pauses a film
 * whose GPU spend passes its estimate; Resume asks the worker to raise the
 * estimate from the shots already made and carry on. Finished shots are kept
 * and cost nothing again. Shown only while the film is paused (or failed after
 * planning); nothing is shown before migration 0055 is applied.
 */
export function ResumeProduction({ projectId, refreshKey }: { projectId: string; refreshKey?: unknown }) {
  const [data, setData] = useState<ResumeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => loadResumeState(projectId).then(setData), [projectId]);
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);
  // While a request waits for the worker, look again every few seconds.
  useEffect(() => {
    if (!data?.requestedAt) return;
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [data?.requestedAt, refresh]);

  if (!data || (data.status !== "PAUSED" && data.status !== "FAILED")) return null;
  const minutes = (ms: number) => `${Math.round(ms / 60000)} min`;

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      await requestResume(projectId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resume was refused");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Resume production" className="mb-8 border-t border-cf-fg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cf-line py-4">
        <span className="cf-label text-cf-fg">{data.status === "PAUSED" ? "Production paused" : "Production stopped"}</span>
        <button type="button" disabled={busy || Boolean(data.requestedAt)} onClick={() => void resume()} className="cf-btn-ink px-3 py-1.5">
          {data.requestedAt ? "Resuming…" : "Resume production"}
        </button>
      </div>
      <p className="py-3 text-[13px] leading-[1.7] text-cf-muted">
        {data.errorMessage ?? "The film stopped before it finished."} GPU time used so far: {minutes(data.spentMs)}
        {data.estimatedMs ? ` of an estimated ${minutes(data.estimatedMs)}` : ""}. Resume keeps every finished shot and makes only the rest; the estimate is raised from what the finished shots really took.
      </p>
      {error && <p role="alert" className="pb-3 text-[12px] text-cf-danger">{error}</p>}
    </section>
  );
}
