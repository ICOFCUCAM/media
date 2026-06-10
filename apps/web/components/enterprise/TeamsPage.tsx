"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { AuthCard } from "../AuthCard";
import { getSupabase } from "../../lib/supabase";

const ROLES = ["EDITOR", "PRODUCER", "VIEWER"] as const;

/** Teams — invite collaborators by email; invites persist and are manageable.
 *  Email delivery + acceptance flow arrives with SMTP; stated honestly. */
export function TeamsPage() {
  const { enabled, loading, user, profile } = useAuth();
  const [invites, setInvites] = useState<{ id: string; email: string; role: string; status: string; created_at: string }[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("EDITOR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !user) return;
    const { data } = await sb.from("team_invites").select("id,email,role,status,created_at").order("created_at", { ascending: false });
    if (data) setInvites(data);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ins = await sb.from("team_invites").insert({ owner_id: user.id, email: email.trim().toLowerCase(), role });
      if (ins.error) throw new Error(ins.error.message);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("team_invites").update({ status: "REVOKED" }).eq("id", id);
    await refresh();
  }

  const seatLimit = profile?.tier === "ENTERPRISE" ? Infinity : profile?.tier === "AGENCY" ? 8 : profile?.tier === "STUDIO" ? 3 : 1;
  const active = (invites ?? []).filter((i) => i.status !== "REVOKED").length + 1; // + the owner

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="mt-1 text-sm text-white/55">
          Invite collaborators into your studio.{" "}
          {Number.isFinite(seatLimit) ? `${active}/${seatLimit} seats used on your ${profile?.tier ?? "FREE"} plan.` : "Unlimited seats."}
        </p>
      </header>

      {!enabled ? (
        <p className="text-sm text-white/45">Connect Supabase first.</p>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to manage your team" />
      ) : (
        <div className="space-y-5">
          <form onSubmit={onInvite} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@studio.com"
              required
              className="min-w-56 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
            />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !email.trim() || (Number.isFinite(seatLimit) && active >= (seatLimit as number))}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Inviting…" : "Invite"}
            </button>
            {error && <p className="w-full text-xs text-amber-300">{error}</p>}
            {Number.isFinite(seatLimit) && active >= (seatLimit as number) && (
              <p className="w-full text-xs text-amber-300/80">
                Seat limit reached — <a href="/pricing" className="underline">upgrade</a> for more.
              </p>
            )}
          </form>

          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Member</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/5">
                  <td className="px-4 py-2.5 text-white/80">You</td>
                  <td className="px-4 py-2.5 text-white/55">Owner</td>
                  <td className="px-4 py-2.5"><Chip kind="active">active</Chip></td>
                  <td />
                </tr>
                {(invites ?? []).map((i) => (
                  <tr key={i.id} className="border-t border-white/5">
                    <td className="px-4 py-2.5 text-white/80">{i.email}</td>
                    <td className="px-4 py-2.5 text-white/55">{i.role.charAt(0) + i.role.slice(1).toLowerCase()}</td>
                    <td className="px-4 py-2.5">
                      <Chip kind={i.status === "ACCEPTED" ? "active" : i.status === "REVOKED" ? "off" : "pending"}>{i.status.toLowerCase()}</Chip>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {i.status !== "REVOKED" && (
                        <button onClick={() => void revoke(i.id)} className="rounded px-2 py-1 text-xs text-white/30 hover:bg-rose-500/10 hover:text-rose-300">
                          revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-white/35">
            Invites are recorded now; email delivery + sign-in acceptance ships with SMTP configuration.
          </p>
        </div>
      )}
    </div>
  );
}

function Chip({ kind, children }: { kind: "active" | "pending" | "off"; children: React.ReactNode }) {
  const cls = kind === "active" ? "border-emerald-400/40 text-emerald-300" : kind === "pending" ? "border-amber-400/40 text-amber-300" : "border-white/20 text-white/40";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>{children}</span>;
}
