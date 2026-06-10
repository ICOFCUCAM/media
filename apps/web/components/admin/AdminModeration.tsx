"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { getSupabase } from "../../lib/supabase";

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

  if (!user || profile?.role !== "ADMIN") return <p className="px-6 py-8 text-sm text-white/45">Admins only.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Moderation</h1>
        <p className="mt-1 text-sm text-white/55">Review queue + recent platform failures.</p>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/70">Voice submissions ({pending?.length ?? "…"})</h2>
        {pending?.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">Queue is clear.</p>
        ) : (
          <div className="space-y-2">
            {(pending ?? []).map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{v.name}</div>
                  <div className="truncate text-xs text-white/45">Terms: {v.share_terms || "—"}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => void review(v.id, true)} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-black">Approve</button>
                  <button onClick={() => void review(v.id, false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/70">Recent failures</h2>
        {failures?.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">Nothing failing. Enjoy it.</p>
        ) : (
          <div className="space-y-2">
            {(failures ?? []).map((f, i) => (
              <div key={i} className="rounded-xl border border-rose-400/20 bg-rose-400/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{f.title || "Untitled"}</span>
                  <span className="shrink-0 rounded-full border border-rose-400/30 px-2 py-0.5 text-[10px] uppercase text-rose-300">{f.kind}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-white/45">{f.error}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
