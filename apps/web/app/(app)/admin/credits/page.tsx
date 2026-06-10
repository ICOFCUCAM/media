"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../components/AuthProvider";
import { AuthCard } from "../../../../components/AuthCard";
import { getSupabase } from "../../../../lib/supabase";

interface BetaUser {
  id: string;
  email: string;
  tier: string;
  credits_ms: number;
  role: string;
  created_at: string;
  projects: number;
}

/**
 * Admin credits console (closed beta). Lists every user with their balance and
 * grants/removes GPU-minutes. Both operations run through SECURITY DEFINER
 * Postgres functions that refuse non-admin callers, so this page is safe to
 * ship: a non-admin just sees the error.
 */
export default function AdminCreditsPage() {
  const { enabled, loading, user } = useAuth();
  const [users, setUsers] = useState<BetaUser[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.rpc("admin_list_users");
    if (error) {
      setDenied(true);
      return;
    }
    setUsers((data as BetaUser[]) ?? []);
  }, []);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  async function grant(target: string, mins: number) {
    const sb = getSupabase();
    if (!sb || busy) return;
    setBusy(true);
    setNote(null);
    const { data, error } = await sb.rpc("grant_credits", { target_email: target, minutes: mins });
    if (error) setNote(`✕ ${error.message}`);
    else setNote(`✓ ${target} → ${(Number(data) / 60000).toFixed(0)} GPU-min balance`);
    await refresh();
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <Link href="/admin" className="text-xs text-white/40 hover:text-white/70">← Admin</Link>
        <h1 className="mt-2 text-2xl font-semibold">Beta credits</h1>
        <p className="mt-1 text-sm text-white/55">
          Grant GPU-minutes to beta users. New signups start with 60 min automatically; generation is blocked at zero.
        </p>
      </header>

      {!enabled ? (
        <p className="text-sm text-white/40">Connect Supabase first.</p>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in as an admin" />
      ) : denied ? (
        <p className="text-sm text-amber-300">This page is admin-only. Your account doesn't have the ADMIN role.</p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void grant(email, minutes);
            }}
            className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
          >
            <label className="flex-1">
              <span className="text-xs uppercase tracking-wider text-white/40">User email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="beta-user@example.com"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
              />
            </label>
            <label>
              <span className="text-xs uppercase tracking-wider text-white/40">GPU-minutes (± allowed)</span>
              <input
                type="number"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="mt-1 w-32 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !email}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Granting…" : "Grant credits"}
            </button>
            {note && <p className="w-full text-xs text-white/60">{note}</p>}
          </form>

          {!users ? (
            <p className="text-sm text-white/40">Loading users…</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium">Tier</th>
                    <th className="px-4 py-2.5 font-medium">Credits</th>
                    <th className="px-4 py-2.5 font-medium">Projects</th>
                    <th className="px-4 py-2.5 font-medium">Joined</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-white/5">
                      <td className="px-4 py-2.5 text-white/80">
                        {u.email}
                        {u.role === "ADMIN" && (
                          <span className="ml-2 rounded-full border border-white/20 px-1.5 text-[9px] uppercase text-white/50">admin</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-white/55">{u.tier}</td>
                      <td className={`px-4 py-2.5 ${u.credits_ms <= 0 ? "text-rose-300" : "text-white/70"}`}>
                        {(u.credits_ms / 60000).toFixed(0)} min
                      </td>
                      <td className="px-4 py-2.5 text-white/55">{u.projects}</td>
                      <td className="px-4 py-2.5 text-white/40">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => void grant(u.email, 60)}
                          disabled={busy}
                          className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
                        >
                          +60 min
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
