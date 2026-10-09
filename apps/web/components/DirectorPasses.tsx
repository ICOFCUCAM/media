"use client";

import { useCallback, useEffect, useState } from "react";
import { loadPasses, setStoryApproved, setStoryboardApproved, type PassState } from "../lib/production";
import { signedUrl } from "../lib/storyboard";
import { Status } from "./cf/primitives";

/**
 * Production passes (DirectorOS W8b): for a three-pass production, approve
 * the story, then each scene's storyboard stills. A scene makes no video until
 * its storyboard is approved — the database enforces it. Hidden for
 * single-pass productions and before migration 0040.
 */
export function DirectorPasses({ projectId, refreshKey }: { projectId: string; refreshKey?: unknown }) {
  const [data, setData] = useState<PassState | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const d = await loadPasses(projectId);
    setData(d);
    const keys = d?.scenes.flatMap((s) => s.stills.slice(0, 4)) ?? [];
    const entries = await Promise.all(keys.map(async (k) => [k, await signedUrl(k)] as const));
    setUrls(Object.fromEntries(entries.filter((e): e is readonly [string, string] => !!e[1])));
  }, [projectId]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15_000); // stills arrive as previs draws them
    return () => clearInterval(t);
  }, [refresh, refreshKey]);

  if (!data || data.passMode !== "three" || !data.scenes.length) return null;
  const pass = !data.storyApprovedAt ? "STORY" : data.scenes.every((s) => s.approvedAt) ? "FINAL" : "PREVIS";

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refused");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Production passes" className="mb-8 border-t border-cf-fg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cf-line py-4">
        <span className="cf-label text-cf-fg">Passes · {pass === "STORY" ? "1 Story" : pass === "PREVIS" ? "2 Storyboard" : "3 Final"}</span>
        {pass === "STORY" ? (
          <button type="button" disabled={busy !== null} onClick={() => void run("story", () => setStoryApproved(projectId, true))} className="cf-btn-ink px-3 py-1.5">
            Approve story — draw the storyboard
          </button>
        ) : pass === "PREVIS" ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("all", async () => { for (const s of data.scenes.filter((x) => !x.approvedAt)) await setStoryboardApproved(s.id, true); })}
            className="cf-btn-ink px-3 py-1.5"
          >
            Approve every storyboard
          </button>
        ) : (
          <span className="cf-label">Every scene approved</span>
        )}
      </div>
      {error && <p role="alert" className="border-b border-cf-line py-3 text-[12px] text-cf-danger">{error}</p>}
      <p className="border-b border-cf-line py-3 text-[12px] leading-relaxed text-cf-muted">
        {pass === "STORY"
          ? "Read the plan. Nothing is drawn or filmed until you approve the story."
          : pass === "PREVIS"
            ? "Storyboard stills are drawn for every shot. Approve a scene to film it; scenes you have not approved make no video."
            : "Every scene is approved. The film renders when the last scene is ready."}
      </p>
      <ol>
        {data.scenes.map((s) => (
          <li key={s.id} className="grid gap-3 border-b border-cf-line py-4 md:grid-cols-[120px_1fr_auto] md:items-start">
            <Status tone={s.approvedAt ? (s.ready === s.shots ? "ok" : "live") : "idle"}>
              {s.approvedAt ? (s.ready === s.shots ? "Filmed" : `Filming ${s.ready}/${s.shots}`) : pass === "STORY" ? "Story" : "Storyboard"}
            </Status>
            <div>
              <p className="text-[13px] font-medium">
                <span className="font-mono text-[11px] text-cf-muted">{String(s.index + 1).padStart(2, "0")}</span> {s.heading}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-cf-muted">{s.summary}</p>
              {s.narration && <p className="mt-1 text-[12px] italic text-cf-muted">“{s.narration}”</p>}
              {pass !== "STORY" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.stills.slice(0, 4).map((k) =>
                    urls[k] ? (
                      /* Plain <img>: a signed, short-lived storage URL. */
                      <img key={k} src={urls[k]} alt={`Storyboard still, scene ${s.index + 1}`} className="h-16 w-28 rounded object-cover" />
                    ) : null,
                  )}
                  {!s.stills.length && <span className="text-[12px] text-cf-dim">Drawing the storyboard…</span>}
                </div>
              )}
            </div>
            {pass !== "STORY" && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run(s.id, () => setStoryboardApproved(s.id, !s.approvedAt))}
                className="cf-link text-[12px] text-cf-muted hover:text-cf-fg disabled:opacity-40"
              >
                {s.approvedAt ? "Withdraw approval" : "Approve storyboard"}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
