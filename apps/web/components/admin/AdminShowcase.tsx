"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { getSupabase } from "../../lib/supabase";
import { signedUrl } from "../../lib/storyboard";
import {
  featureFilm,
  listShowcase,
  listSlotCandidates,
  publicUrl,
  SHOWCASE_SLOTS,
  type ShowcaseRow,
  type ShowcaseSlot,
  type SlotCandidate,
} from "../../lib/showcase";
import { EmptyState, PageHeader, Section } from "../cf/primitives";

/** What each homepage frame shows (the placeholder titles on the homepage). */
const SLOT_NAMES: Record<ShowcaseSlot, { name: string; tag: string }> = {
  hero: { name: "Hero (top of the homepage)", tag: "Film" },
  "work-1": { name: "Showreel 1 · Feature Film", tag: "Drama" },
  "work-2": { name: "Showreel 2 · World", tag: "Fantasy" },
  "work-3": { name: "Showreel 3 · Documentary", tag: "Film" },
  "work-4": { name: "Showreel 4 · Commercial", tag: "Brand" },
  "work-5": { name: "Showreel 5 · Short", tag: "Vertical" },
  "work-6": { name: "Showreel 6 · Music Video", tag: "Performance" },
};

/**
 * Admin · Showcase (docs/76) — films made for a homepage frame wait here.
 * Watch each one next to what the frame shows now, then Replace (the film
 * goes live in that frame) or Dismiss (it stays a normal project).
 */
export function AdminShowcase() {
  const { user, profile } = useAuth();
  const [live, setLive] = useState<ShowcaseRow[]>([]);
  const [candidates, setCandidates] = useState<SlotCandidate[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [rows, cands] = await Promise.all([listShowcase(50), listSlotCandidates()]);
    setLive(rows);
    setCandidates(cands);
    const urls: Record<string, string> = {};
    for (const c of cands) if (c.mp4Key) urls[c.projectId] = (await signedUrl(c.mp4Key)) ?? "";
    setPreviews(urls);
  }, []);

  useEffect(() => {
    if (profile?.role === "ADMIN") void refresh();
  }, [profile, refresh]);

  async function replace(c: SlotCandidate) {
    if (!c.mp4Key) return;
    setBusy(c.projectId);
    setError(null);
    try {
      await featureFilm(c.projectId, c.mp4Key, c.title, SLOT_NAMES[c.slot].tag, c.slot);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(c: SlotCandidate) {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(c.projectId);
    await sb.from("projects").update({ showcase_slot: null }).eq("id", c.projectId);
    setBusy(null);
    await refresh();
  }

  const waiting = (candidates ?? []).filter((c) => !live.some((r) => r.project_id === c.projectId && r.slot === c.slot));
  const header = (
    <PageHeader
      eyebrow="System administration / Showcase"
      title={<>The homepage<br /><em>frames.</em></>}
      copy={<p>Films made for a homepage frame. Watch each one next to what the frame shows now, then replace the frame with it, or dismiss it.</p>}
      status={{ tone: waiting.length ? "warn" : "ok", label: candidates ? `${waiting.length} waiting` : "Showcase" }}
    />
  );

  if (!user || profile?.role !== "ADMIN")
    return (
      <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
        {header}
        <EmptyState className="mt-12" title={<>Administrators <em>only.</em></>} hint="Sign in with an account that carries the ADMIN role." />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      {header}
      {error && <p className="mt-6 text-[13px] text-cf-danger">Could not replace: {error}</p>}

      {SHOWCASE_SLOTS.map((slot) => {
        const current = live.find((r) => r.slot === slot);
        const mine = waiting.filter((c) => c.slot === slot);
        return (
          <Section key={slot} label={SLOT_NAMES[slot].name} title={current ? current.title : <em>Placeholder</em>}>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div>
                <div className="cf-label mb-2">Showing now</div>
                {current ? (
                  <video src={publicUrl(current.video_path)} controls muted playsInline preload="metadata" className="aspect-video w-full bg-black" />
                ) : (
                  <div className="grid aspect-video w-full place-items-center border border-cf-line text-[12px] text-cf-dim">Example frame (placeholder)</div>
                )}
              </div>
              <div>
                <div className="cf-label mb-2">Made for this frame</div>
                {mine.length === 0 ? (
                  <p className="text-[13px] text-cf-dim">Nothing waiting.</p>
                ) : (
                  <ol className="grid gap-4 sm:grid-cols-2">
                    {mine.map((c) => (
                      <li key={c.projectId} className="border border-cf-line p-3">
                        {c.mp4Key && previews[c.projectId] ? (
                          <video src={previews[c.projectId]} controls muted playsInline preload="metadata" className="aspect-video w-full bg-black" />
                        ) : (
                          <div className="grid aspect-video w-full place-items-center bg-cf-line/30 text-[12px] text-cf-dim">
                            {c.status === "FAILED" ? "Failed" : `Still making it · ${c.status.toLowerCase()}`}
                          </div>
                        )}
                        <div className="mt-2 truncate font-display font-semibold text-[16px]">{c.title}</div>
                        {c.errorMessage && <p className="line-clamp-2 text-[12px] text-cf-danger">{c.errorMessage}</p>}
                        <div className="mt-3 flex gap-2">
                          <button type="button" disabled={!c.mp4Key || busy !== null} onClick={() => void replace(c)} className="cf-btn-accent px-4 py-2 disabled:opacity-40">
                            {busy === c.projectId ? "Replacing…" : "Replace"}
                          </button>
                          <button type="button" disabled={busy !== null} onClick={() => void dismiss(c)} className="cf-btn-line px-4 py-2 disabled:opacity-40">
                            Dismiss
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </Section>
        );
      })}
    </div>
  );
}
