"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyApproved, costLine, decideProposal, effectOf, listReviews, QUESTION_LABEL, requestReview,
  type Finding, type Review,
} from "../lib/editor";
import { Status } from "./cf/primitives";

const STATUS_TEXT: Record<Review["status"], string> = {
  pending: "Waiting for the Editor…",
  reviewing: "The Editor is watching the cut…",
  ready: "Ready — approve the edits you want",
  apply_requested: "Applying soon…",
  applying: "Applying the edits…",
  applied: "Applied — the film is re-cut",
  failed: "Failed",
};

/**
 * The Editor (DirectorOS W13; Part 1 §21, §46). Ask for a review of the whole
 * cut, or for one change ("make the opening 15 seconds faster"); read the
 * Editor's answers to the nine questions; approve or reject each structured
 * edit, seeing what it costs; apply the approved ones together. Nothing
 * changes until you apply.
 */
export function EditorPanel({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const [reviews, setReviews] = useState<Review[] | null | undefined>(undefined);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => setReviews(await listReviews(projectId).catch(() => null)), [projectId]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 6000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(key: string, f: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await f();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (reviews === undefined) return null;
  const current = reviews?.[0] ?? null;
  const open = current && ["pending", "reviewing", "apply_requested", "applying"].includes(current.status);

  return (
    <section aria-label="Editor" className="border-t border-cf-fg pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="cf-label text-cf-fg">Editor</span>
        <span className="cf-label">Reviews the whole cut · proposes structured edits · nothing changes until you apply</span>
      </div>

      {reviews === null ? (
        <p className="mt-3 text-[12px] text-cf-muted">The Editor opens once migration 0048 is applied.</p>
      ) : !enabled ? (
        <p className="mt-3 text-[12px] text-cf-muted">The Editor needs a planning model; none is configured right now.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              aria-label="What should the Editor change? (leave empty for a full review)"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Make the opening 15 seconds faster — or leave empty to review the whole cut"
              maxLength={2000}
              className="cf-input min-w-[240px] flex-1 py-1.5 text-[13px]"
            />
            <button
              type="button"
              className="cf-btn-ink px-3 py-1.5"
              disabled={!!busy || !!open}
              onClick={() => void act("ask", async () => { await requestReview(projectId, request); setRequest(""); })}
            >
              {request.trim() ? "Ask the Editor" : "Review the cut"}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-[12px] text-cf-danger">{error}</p>}
          {current ? <ReviewView review={current} busy={busy} act={act} /> : (
            <p className="mt-3 text-[12px] text-cf-muted">
              The Editor watches the film as a whole — pacing, the opening, redundant shots, escalation, scene length, the
              climax, the ending, transitions, repetition — and proposes cuts, trims, moves and inserts.
            </p>
          )}
          {reviews.length > 1 && (
            <details className="mt-4 text-[12px]">
              <summary className="cursor-pointer text-cf-muted">Earlier reviews ({reviews.length - 1})</summary>
              <ul className="mt-2 space-y-1">
                {reviews.slice(1).map((r) => (
                  <li key={r.id} className="text-cf-muted">
                    {new Date(r.created_at).toLocaleString()} · {r.instruction ? `“${r.instruction}”` : "whole-cut review"} · {STATUS_TEXT[r.status]}
                    {r.proposals.length ? ` · ${r.proposals.filter((p) => p.status === "applied").length}/${r.proposals.length} applied` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function ReviewView({ review, busy, act }: { review: Review; busy: string | null; act: (k: string, f: () => Promise<void>) => Promise<void> }) {
  const findings = (Array.isArray(review.findings) ? review.findings : []) as unknown as Finding[];
  const dropped = Array.isArray(review.dropped) ? review.dropped.length : 0;
  const approved = review.proposals.filter((p) => p.status === "approved");
  const total = approved.reduce((a, p) => a + effectOf(p).deltaSec, 0);
  const deciding = review.status === "ready";

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div>
        <p className="text-[12px] text-cf-muted">
          {review.instruction ? <>Request: <span className="text-cf-fg">“{review.instruction}”</span> · </> : "Whole-cut review · "}
          {STATUS_TEXT[review.status]}
        </p>
        {review.error && <p className="mt-2 text-[12px] text-cf-danger">{review.error}</p>}
        {review.summary && <p className="mt-2 text-[14px] leading-relaxed">{review.summary}</p>}
        {findings.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {findings.map((f) => (
              <li key={f.question} className="text-[12px] leading-relaxed">
                <Status tone={f.verdict === "works" ? "ok" : "warn"}>{QUESTION_LABEL[f.question] ?? f.question}</Status>{" "}
                <span className="text-cf-muted">{f.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="cf-label mb-2">Proposed edits</h3>
        {review.proposals.length === 0 ? (
          <p className="text-[12px] text-cf-muted">{review.status === "ready" || review.status === "applied" ? "No edits proposed — the Editor would leave the cut as it is." : "…"}</p>
        ) : (
          <ol className="space-y-2">
            {review.proposals.map((p) => {
              const e = effectOf(p);
              const reason = (p.op as { reason?: string }).reason;
              return (
                <li key={p.id} className="rounded border border-cf-line px-3 py-2 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{p.description}</span>
                    {deciding ? (
                      <span className="flex gap-1">
                        <button type="button" className="cf-option" aria-pressed={p.status === "approved"} disabled={!!busy} onClick={() => void act(p.id, () => decideProposal(p.id, true))}>Approve</button>
                        <button type="button" className="cf-option" aria-pressed={p.status === "rejected"} disabled={!!busy} onClick={() => void act(p.id, () => decideProposal(p.id, false))}>Reject</button>
                      </span>
                    ) : (
                      <Status tone={p.status === "applied" ? "ok" : p.status === "failed" ? "danger" : "idle"}>{p.status}</Status>
                    )}
                  </div>
                  {reason && <p className="mt-1 text-[12px] text-cf-muted">{reason}</p>}
                  <p className="mt-1 font-mono text-[11px] text-cf-dim">{costLine(e)}</p>
                </li>
              );
            })}
          </ol>
        )}
        {dropped > 0 && <p className="mt-2 text-[11px] text-cf-dim">{dropped} suggestion{dropped === 1 ? "" : "s"} dropped: they would have broken the story, continuity or a line.</p>}
        {deciding && review.proposals.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="cf-btn-accent px-4 py-2" disabled={!!busy || approved.length === 0} onClick={() => void act("apply", () => applyApproved(review.id))}>
              Apply {approved.length || ""} approved edit{approved.length === 1 ? "" : "s"}
            </button>
            {approved.length > 0 && (
              <span className="text-[12px] text-cf-muted">
                {total ? `${total > 0 ? "+" : "−"}${Math.abs(total)}s · ` : ""}re-cut shots keep their clips; only extended or new shots are generated, then the film renders as a new version.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
