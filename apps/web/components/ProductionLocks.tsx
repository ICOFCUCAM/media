"use client";

import { useCallback, useEffect, useState } from "react";
import { loadProductionLocks, setFilmLock, setSceneLock, type ProductionLocks as Locks } from "../lib/production";
import { Status } from "./cf/primitives";

/**
 * Locks and versions (DirectorOS W8): lock a finished scene or the whole film
 * so nothing can change it — no regeneration, no canon edit — until you unlock
 * it; see how many takes each scene has and every delivered master. Nothing
 * is shown before migration 0037 is applied.
 */
export function ProductionLocks({ projectId, refreshKey }: { projectId: string; refreshKey?: unknown }) {
  const [data, setData] = useState<Locks | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => loadProductionLocks(projectId).then(setData), [projectId]);
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  if (!data || !data.scenes.length) return null;
  const filmLocked = Boolean(data.filmLockedAt);
  const allReady = data.scenes.every((s) => s.shots > 0 && s.ready === s.shots);

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The change was refused");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Locks and versions" className="mb-8 border-t border-cf-fg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cf-line py-4">
        <span className="cf-label text-cf-fg">Locks and versions</span>
        <button
          type="button"
          disabled={busy !== null || (!filmLocked && !allReady)}
          onClick={() => void run("film", () => setFilmLock(projectId, !filmLocked))}
          className={filmLocked ? "cf-btn-line px-3 py-1.5" : "cf-btn-ink px-3 py-1.5"}
          title={!filmLocked && !allReady ? "Every shot must be ready before the film can be locked" : undefined}
        >
          {filmLocked ? "Unlock film" : "Lock film"}
        </button>
      </div>
      {error && (
        <p role="alert" className="border-b border-cf-line py-3 text-[12px] text-cf-danger">
          {error}
        </p>
      )}
      <ol>
        {data.scenes.map((s) => {
          const locked = filmLocked || Boolean(s.lockedAt);
          const finished = s.shots > 0 && s.ready === s.shots;
          return (
            <li key={s.id} className="grid gap-2 border-b border-cf-line py-3 md:grid-cols-[120px_1fr_auto] md:items-center">
              <Status tone={locked ? "ok" : finished ? "live" : "idle"}>{locked ? "Locked" : finished ? "Finished" : `${s.ready}/${s.shots} ready`}</Status>
              <p className="text-[13px] leading-relaxed">
                <span className="font-mono text-[11px] text-cf-muted">{String(s.index + 1).padStart(2, "0")}</span> {s.heading}
                <span className="ml-2 font-mono text-[11px] text-cf-muted">
                  {s.versions} {s.versions === 1 ? "take" : "takes"}
                </span>
              </p>
              {!filmLocked && (
                <button
                  type="button"
                  disabled={busy !== null || (!s.lockedAt && !finished)}
                  onClick={() => void run(s.id, () => setSceneLock(s.id, !s.lockedAt))}
                  className="cf-link text-[12px] text-cf-muted hover:text-cf-fg disabled:opacity-40"
                >
                  {s.lockedAt ? "Unlock" : "Lock"}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {data.masters.length > 0 && (
        <p className="py-3 text-[12px] text-cf-muted">
          Masters delivered: {data.masters.map((m) => `v${m.version}`).join(" · ")} — every render is kept; the newest is the one that plays.
        </p>
      )}
    </section>
  );
}
