"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { AuthCard } from "../AuthCard";
import { getSupabase } from "../../lib/supabase";
import { msToCredits, creditsToMs } from "../../lib/plans";
import { EmptyState, PageHeader, Status } from "../cf/primitives";

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

  const shell = (body: React.ReactNode) => (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="System administration / Users & credits"
        title={<>The<br /><em>members.</em></>}
        copy={<p>The real roster — readable by administrators only (enforced by RLS). Grant credits and set tiers inline.</p>}
        status={{ tone: rows ? "live" : "idle", label: rows ? `${rows.length} accounts` : "Roster" }}
      />
      <div className="pt-12">{body}</div>
    </div>
  );

  if (!enabled) return shell(<EmptyState title="The roster needs a studio." hint="Connect Supabase (NEXT_PUBLIC_SUPABASE_URL)." />);
  if (loading) return shell(<p className="cf-label">Opening the roster…</p>);
  if (!user) return shell(<AuthCard title="Sign in as an admin" />);
  if (profile?.role !== "ADMIN") return shell(<EmptyState title={<>Administrators <em>only.</em></>} hint="Your account does not carry the ADMIN role." />);

  return shell(
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-t border-cf-fg text-left">
        <caption className="sr-only">Platform members</caption>
        <thead>
          <tr className="border-b border-cf-line">
            {["Email", "Role", "Tier", "Credits", "Joined", ""].map((h, i) => (
              <th key={i} scope="col" className="cf-label py-4 pr-4 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id} className="border-b border-cf-line">
              <th scope="row" className="max-w-[260px] truncate py-4 pr-4 text-left font-display font-semibold text-[17px] font-normal">
                {r.email}
              </th>
              <td className="py-4 pr-4">
                <Status tone={r.role === "ADMIN" ? "live" : "idle"}>{r.role.toLowerCase()}</Status>
              </td>
              <td className="py-4 pr-4">
                <select
                  value={r.tier}
                  onChange={(e) => void setTier(r.id, e.target.value)}
                  aria-label={`Tier for ${r.email}`}
                  className="border border-cf-line bg-cf-panel px-2 py-1.5 font-mono text-[12px] uppercase text-cf-fg outline-none focus:border-cf-fg"
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </td>
              <td className="py-4 pr-4 font-mono text-[11px]">{msToCredits(r.credits_ms).toLocaleString()}</td>
              <td className="cf-label py-4 pr-4">{new Date(r.created_at).toLocaleDateString()}</td>
              <td className="py-4 text-right">
                {granting === r.id ? (
                  <span className="flex justify-end gap-1.5">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="numeric"
                      aria-label={`Credits to grant ${r.email}`}
                      className="cf-input w-24 px-2 py-1.5 font-mono text-[11px]"
                    />
                    <button type="button" onClick={() => void grant(r.id, r.credits_ms)} className="cf-btn-accent px-3 py-1.5">
                      Grant
                    </button>
                    <button type="button" onClick={() => setGranting(null)} aria-label="Cancel grant" className="cf-btn-line px-3 py-1.5">
                      ×
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setGranting(r.id)} className="cf-link text-cf-muted hover:text-cf-fg">
                    + Credits
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
  );
}
