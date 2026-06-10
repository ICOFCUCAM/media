"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { AuthCard } from "../AuthCard";
import { getSupabase } from "../../lib/supabase";
import { msToCredits, creditsToMs } from "../../lib/plans";

const TIERS = ["FREE", "CREATOR", "STUDIO", "AGENCY", "ENTERPRISE"] as const;

/** Admin · Users — the real roster (ADMIN-only via RLS): tier, credits,
 *  role, with inline credit grants and tier changes. */
export function AdminUsers() {
  const { enabled, loading, user, profile } = useAuth();
  const [rows, setRows] = useState<{ id: string; email: string; role: string; tier: string; credits_ms: number; created_at: string }[] | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const [amount, setAmount] = useState("1000");

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from("users").select("id,email,role,tier,credits_ms,created_at").order("created_at", { ascending: true });
    if (data) setRows(data);
  }, []);

  useEffect(() => {
    if (profile?.role === "ADMIN") void refresh();
  }, [profile, refresh]);

  async function grant(id: string, currentMs: number) {
    const sb = getSupabase();
    const credits = Number(amount);
    if (!sb || !Number.isFinite(credits) || credits <= 0) return;
    await sb.from("users").update({ credits_ms: currentMs + creditsToMs(credits) }).eq("id", id);
    setGranting(null);
    await refresh();
  }

  async function setTier(id: string, tier: string) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("users").update({ tier: tier as (typeof TIERS)[number] }).eq("id", id);
    await refresh();
  }

  if (!enabled || loading) return <p className="px-6 py-8 text-sm text-white/40">Loading…</p>;
  if (!user) return <div className="px-6 py-8"><AuthCard title="Sign in" /></div>;
  if (profile?.role !== "ADMIN")
    return <p className="px-6 py-8 text-sm text-white/45">Admins only.</p>;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-white/55">{rows?.length ?? "…"} accounts · grant credits, set tiers.</p>
      </header>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Tier</th>
              <th className="px-4 py-2.5 font-medium">Credits</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="max-w-[220px] truncate px-4 py-2.5 text-white/80">{r.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${r.role === "ADMIN" ? "border-fuchsia-400/40 text-fuchsia-300" : "border-white/15 text-white/50"}`}>{r.role}</span>
                </td>
                <td className="px-4 py-2.5">
                  <select value={r.tier} onChange={(e) => void setTier(r.id, e.target.value)} className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs outline-none">
                    {TIERS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5 text-white/70">{msToCredits(r.credits_ms).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-white/40">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2.5 text-right">
                  {granting === r.id ? (
                    <span className="flex justify-end gap-1.5">
                      <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-20 rounded border border-white/15 bg-black/40 px-2 py-1 text-xs outline-none" />
                      <button onClick={() => void grant(r.id, r.credits_ms)} className="rounded bg-emerald-400 px-2 py-1 text-xs font-semibold text-black">Grant</button>
                      <button onClick={() => setGranting(null)} className="rounded border border-white/15 px-2 py-1 text-xs">✕</button>
                    </span>
                  ) : (
                    <button onClick={() => setGranting(r.id)} className="rounded border border-white/15 px-2.5 py-1 text-xs text-white/60 hover:bg-white/5">
                      + credits
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
