"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { getSupabase } from "../../lib/supabase";
import { EmptyState, PageHeader, Section } from "../cf/primitives";

/** Admin · Moderation — voice-share submissions to review + the platform's
 *  recent failures (projects/voiceovers/launches) in one operational view. */
export function AdminModeration() {
  const { user, profile } = useAuth();
  const [pending, setPending] = useState<{ id: string; name: string; share_terms: string | null }[] | null>(null);
  const [failures, setFailures] = useState<{ kind: string; title: string; error: string; at: string }[] | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const [v, p, vo, l] = await Promise.all([
      sb.from("voices").select("id,name,share_terms").eq("share_status", "PENDING_REVIEW"),
      sb.from("projects").select("title,error_message,updated_at").eq("status", "FAILED").order("updated_at", { ascending: false }).limit(8),
      sb.from("voiceovers").select("title,error_message,updated_at").eq("status", "FAILED").order("updated_at", { ascending: false }).limit(5),
      sb.from("social_launches").select("brief,error_message,updated_at").eq("status", "FAILED").order("updated_at", { ascending: false }).limit(5),
    ]);
    setPending((v.data as { id: string; name: string; share_terms: string | null }[]) ?? []);
    const rows: { kind: string; title: string; error: string; at: string }[] = [];
    for (const r of p.data ?? []) rows.push({ kind: "film", title: r.title, error: r.error_message ?? "", at: r.updated_at });
    for (const r of vo.data ?? []) rows.push({ kind: "voiceover", title: r.title, error: r.error_message ?? "", at: r.updated_at });
    for (const r of l.data ?? []) rows.push({ kind: "launch", title: r.brief, error: r.error_message ?? "", at: r.updated_at });
    rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    setFailures(rows);
  }, []);

  useEffect(() => {
    if (profile?.role === "ADMIN") void refresh();
  }, [profile, refresh]);

  async function review(id: string, approve: boolean) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("voices").update({ share_status: approve ? "APPROVED" : "REJECTED" }).eq("id", id);
    await refresh();
  }

  const header = (
    <PageHeader
      eyebrow="System administration / Moderation"
      title={<>The review<br /><em>desk.</em></>}
      copy={<p>Voice-share submissions awaiting a decision, and the platform&apos;s most recent failures across films, readings and launches.</p>}
      status={{ tone: pending?.length ? "warn" : "ok", label: pending ? `${pending.length} awaiting review` : "Review desk" }}
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

      <Section label="Voice submissions" title={pending ? `${String(pending.length).padStart(2, "0")} in the queue` : "Queue"}>
        {pending?.length === 0 ? (
          <EmptyState title="The queue is clear." />
        ) : (
          <ol className="border-t border-cf-fg">
            {(pending ?? []).map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-cf-line py-4">
                <div className="min-w-0">
                  <div className="truncate font-display font-semibold text-[19px]">{v.name}</div>
                  <div className="cf-label mt-1 truncate">Terms: {v.share_terms || "—"}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => void review(v.id, true)} className="cf-btn-accent px-4 py-2.5">
                    Approve
                  </button>
                  <button type="button" onClick={() => void review(v.id, false)} className="cf-btn-line px-4 py-2.5">
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section label="Recent failures" title="What stopped.">
        {failures?.length === 0 ? (
          <EmptyState title={<>Nothing is <em>failing.</em></>} />
        ) : (
          <ol className="border-t border-cf-fg">
            {(failures ?? []).map((f, i) => (
              <li key={i} className="grid gap-2 border-b border-cf-line py-4 md:grid-cols-[1fr_1.4fr_auto] md:items-start md:gap-6">
                <span className="truncate font-display font-semibold text-[18px]">{f.title || "Untitled"}</span>
                <p className="line-clamp-2 text-[12px] text-cf-danger">{f.error}</p>
                <span className="flex items-center gap-4">
                  <span className="cf-label">{f.kind}</span>
                  <span className="cf-label text-cf-dim">{new Date(f.at).toLocaleDateString()}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
