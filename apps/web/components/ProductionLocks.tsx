"use client";

import { useCallback, useEffect, useState } from "react";
import { loadProductionLocks, loadTakes, restoreTake, setFilmLock, setSceneLock, type ProductionLocks as Locks, type ShotTakes } from "../lib/production";
import { signedUrl } from "../lib/storyboard";
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
  const [open, setOpen] = useState<string | null>(null);
  const [takes, setTakes] = useState<ShotTakes[]>([]);

  const refresh = useCallback(() => loadProductionLocks(projectId).then(setData), [projectId]);
  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  async function toggleTakes(sceneId: string) {
    if (open === sceneId) return setOpen(null);
    setOpen(sceneId);
    setTakes(await loadTakes(sceneId, projectId));
  }
  async function play(key: string) {
    const url = await signedUrl(key);
    if (url) window.open(url, "_blank", "noopener");
  }

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
      <p className="border-b border-cf-line py-3 text-[12px] leading-relaxed text-cf-muted">
        {filmLocked
          ? "Locked: the film is rendered once more from an approved timeline of the locked scenes. That timeline is frozen when the master is delivered."
          : "Locking a finished film freezes every scene, approves its timeline and renders the final master from it."}
      </p>
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
                <button type="button" onClick={() => void toggleTakes(s.id)} className="ml-2 font-mono text-[11px] text-cf-muted hover:text-cf-fg">
                  {s.versions} {s.versions === 1 ? "take" : "takes"} {open === s.id ? "▴" : "▾"}
                </button>
              </p>
              {open === s.id && (
                <ul className="md:col-span-3">
                  {takes.map((t) => (
                    <li key={t.shotId} className="flex flex-wrap items-center gap-2 py-1 text-[12px] text-cf-muted">
                      <span className="font-mono">Shot {t.index + 1}</span>
                      {t.takes.length === 0 && <span>no takes yet</span>}
                      {t.takes.map((v) => (
                        <span key={v.version} className="inline-flex items-center gap-1 rounded border border-cf-line px-1.5 py-0.5">
                          <button type="button" onClick={() => void play(v.storageKey)} className="hover:text-cf-fg">v{v.version}</button>
                          {v.current ? (
                            <span className="text-cf-fg">current</span>
                          ) : (
                            !locked && (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void run(`take-${t.shotId}`, async () => { await restoreTake(t.shotId, v.storageKey); setTakes(await loadTakes(s.id, projectId)); })}
                                className="underline hover:text-cf-fg"
                              >
                                use
                              </button>
                            )
                          )}
                        </span>
                      ))}
                    </li>
                  ))}
                  <li className="py-1 text-[11px] text-cf-dim">Re-assemble the film to see a restored take in it.</li>
                </ul>
              )}
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
