"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../../components/AuthProvider";
import { AuthCard } from "../../../../components/AuthCard";
import { getSupabase } from "../../../../lib/supabase";
import { EmptyState, PageHeader } from "../../../../components/cf/primitives";

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
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <Link href="/admin" className="cf-link text-cf-muted hover:text-cf-fg">
        ← Infrastructure
      </Link>
      <div className="mt-8">
        <PageHeader
          eyebrow="System administration / Beta credits"
          title={<>Beta<br /><em>credits.</em></>}
          copy={<p>Grant GPU-minutes to beta users. New signups start with 60 minutes automatically; generation is blocked at zero. Both operations run through SECURITY DEFINER functions that refuse non-admin callers.</p>}
          status={{ tone: users ? "live" : "idle", label: users ? `${users.length} accounts` : "Credits console" }}
        />
      </div>

      <div className="pt-12">
        {!enabled ? (
          <EmptyState title="The console needs a studio." hint="Connect Supabase (NEXT_PUBLIC_SUPABASE_URL)." />
        ) : loading ? (
          <p className="cf-label">Opening the console…</p>
        ) : !user ? (
          <AuthCard title="Sign in as an admin" />
        ) : denied ? (
          <EmptyState title={<>Administrators <em>only.</em></>} hint="Your account does not have the ADMIN role." />
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void grant(email, minutes);
              }}
              className="grid gap-3 border-b border-cf-line pb-10 md:grid-cols-[1fr_180px_auto] md:items-end"
            >
              <label className="block">
                <span className="cf-label mb-2 block text-cf-fg">User email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="beta-user@example.com" className="cf-input" />
              </label>
              <label className="block">
                <span className="cf-label mb-2 block text-cf-fg">GPU-minutes (±)</span>
                <input type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="cf-input font-mono" />
              </label>
              <button type="submit" disabled={busy || !email} className="cf-btn-ink">
                {busy ? "Granting…" : "Grant credits"}
              </button>
              {note && (
                <p role="status" className={`border-l-2 pl-3 text-[12px] md:col-span-3 ${note.startsWith("✕") ? "border-cf-danger text-cf-danger" : "border-cf-ok text-cf-ok"}`}>
                  {note.replace(/^[✓✕] /, "")}
                </p>
              )}
            </form>

            {!users ? (
              <p className="cf-label mt-10">Loading users…</p>
            ) : (
              <div className="mt-10 overflow-x-auto">
                <table className="w-full min-w-[720px] border-t border-cf-fg text-left">
                  <caption className="sr-only">Beta users and their GPU-minute balance</caption>
                  <thead>
                    <tr className="border-b border-cf-line">
                      {["Email", "Tier", "Balance", "Projects", "Joined", ""].map((h, i) => (
                        <th key={i} scope="col" className="cf-label py-4 pr-4 font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-cf-line">
                        <th scope="row" className="py-4 pr-4 text-left font-serif text-[17px] font-normal">
                          {u.email}
                          {u.role === "ADMIN" && <span className="cf-label ml-3">admin</span>}
                        </th>
                        <td className="cf-label py-4 pr-4">{u.tier}</td>
                        <td className={`py-4 pr-4 font-mono text-[11px] ${u.credits_ms <= 0 ? "text-cf-danger" : ""}`}>{(u.credits_ms / 60000).toFixed(0)} min</td>
                        <td className="py-4 pr-4 font-mono text-[11px]">{u.projects}</td>
                        <td className="cf-label py-4 pr-4">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="py-4 text-right">
                          <button type="button" onClick={() => void grant(u.email, 60)} disabled={busy} className="cf-link text-cf-muted hover:text-cf-fg disabled:opacity-40">
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
    </div>
  );
}
