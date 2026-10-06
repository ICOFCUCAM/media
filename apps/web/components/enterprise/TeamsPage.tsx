"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import Link from "next/link";
import { StudioGate } from "../cf/StudioGate";
import { PageHeader, Section, Status } from "../cf/primitives";
import { getSupabase } from "../../lib/supabase";

const ROLES = ["EDITOR", "PRODUCER", "VIEWER"] as const;

/** Teams — invite collaborators by email. The invite row is the record; the
 *  team-invite edge function emails it through Supabase Auth and marks it
 *  ACCEPTED once that email has a Cineforge account. */

/** Call the team-invite edge function with the member's JWT. */
async function inviteFn(body: Record<string, unknown>): Promise<{ ok: boolean; data: { message?: string; error?: string; accepted?: number } }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, data: { error: "Supabase not configured" } };
  const { data: session } = await sb.auth.getSession();
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/team-invite`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session?.session?.access_token ?? ""}` },
      body: JSON.stringify(body),
    });
    if (res.status === 404) return { ok: false, data: { error: "Email delivery needs the team-invite function deployed (supabase functions deploy team-invite)." } };
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch (e) {
    return { ok: false, data: { error: e instanceof Error ? e.message : "Invite service unreachable" } };
  }
}
export function TeamsPage() {
  const { user, profile } = useAuth();
  const [invites, setInvites] = useState<{ id: string; email: string; role: string; status: string; created_at: string }[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("EDITOR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !user) return;
    const { data } = await sb.from("team_invites").select("id,email,role,status,created_at").order("created_at", { ascending: false });
    if (data) setInvites(data);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Pick up invitees who have joined since, then show the ledger.
    void inviteFn({ action: "sync" }).finally(() => void refresh());
  }, [user, refresh]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ins = await sb.from("team_invites").insert({ owner_id: user.id, email: email.trim().toLowerCase(), role }).select("id").single();
      if (ins.error) throw new Error(ins.error.message);
      setEmail("");
      setNotice(null);
      const sent = await inviteFn({ action: "send", inviteId: ins.data.id, redirectTo: `${window.location.origin}/projects` });
      setNotice(sent.ok ? (sent.data.message ?? "Invite sent.") : `Invite saved, but not emailed: ${sent.data.error ?? "unknown error"}`);
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

  const full = Number.isFinite(seatLimit) && active >= (seatLimit as number);
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Enterprise / Teams"
        title={<>The<br /><em>company.</em></>}
        copy={
          <>
            <p>Invite collaborators into your studio as editors, producers or viewers.</p>
            <p><strong>Each invite is emailed through your Supabase Auth email settings, and marked accepted when that person joins.</strong></p>
          </>
        }
        status={{ tone: full ? "warn" : "live", label: Number.isFinite(seatLimit) ? `${active} / ${seatLimit} seats · ${profile?.tier ?? "FREE"}` : "Unlimited seats" }}
      />
      <div className="pt-12">
        <StudioGate signIn="Sign in to manage your team" what="Teams">
          <Section label="Invite" title="Bring someone in.">
            <form onSubmit={onInvite} className="grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-end">
              <label className="block">
                <span className="cf-label mb-2 block text-cf-fg">Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@studio.com" required className="cf-input" />
              </label>
              <label className="block">
                <span className="cf-label mb-2 block text-cf-fg">Role</span>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="cf-input py-[11px]">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0) + r.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={busy || !email.trim() || full} className="cf-btn-ink">
                {busy ? "Inviting…" : "Invite"}
              </button>
            </form>
            {error && <p role="alert" className="mt-4 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">{error}</p>}
            {notice && (
              <p role="status" className={`mt-4 border-l-2 pl-3 text-[12px] ${notice.startsWith("Invite saved, but") ? "border-cf-warn text-cf-warn" : "border-cf-ok text-cf-ok"}`}>
                {notice}
              </p>
            )}
            {full && (
              <p className="mt-4 border-l-2 border-cf-warn pl-3 text-[12px] text-cf-warn">
                Seat limit reached — <Link href="/pricing" className="underline">upgrade</Link> for more.
              </p>
            )}
          </Section>

          <Section label="Members" title={`${String(active).padStart(2, "0")} in the company`}>
            <ol className="border-t border-cf-fg">
              <li className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-cf-line py-4 md:grid-cols-[1.4fr_0.6fr_0.6fr_80px]">
                <span className="font-display font-semibold text-[19px]">You</span>
                <span className="cf-label hidden md:block">Owner</span>
                <Status tone="ok">Active</Status>
                <span className="hidden md:block" />
              </li>
              {(invites ?? []).map((i) => (
                <li key={i.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-cf-line py-4 md:grid-cols-[1.4fr_0.6fr_0.6fr_80px]">
                  <span className="min-w-0">
                    <span className="block truncate font-display font-semibold text-[19px]">{i.email}</span>
                    <span className="cf-label mt-1 block md:hidden">{i.role.toLowerCase()}</span>
                  </span>
                  <span className="cf-label hidden md:block">{i.role.charAt(0) + i.role.slice(1).toLowerCase()}</span>
                  <Status tone={i.status === "ACCEPTED" ? "ok" : i.status === "REVOKED" ? "idle" : "warn"}>{i.status.toLowerCase()}</Status>
                  <span className="text-right">
                    {i.status !== "REVOKED" && (
                      <button type="button" onClick={() => void revoke(i.id)} className="cf-link text-cf-muted hover:text-cf-danger">
                        Revoke
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        </StudioGate>
      </div>
    </div>
  );
}
