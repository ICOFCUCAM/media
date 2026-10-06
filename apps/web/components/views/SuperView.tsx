"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { getSupabase } from "../../lib/supabase";
import { SUBSYSTEMS } from "../../lib/system";
import { msToCredits } from "../../lib/plans";
import { EmptyState, PageHeader, Section, Status } from "../cf/primitives";
import { StudioGate } from "../cf/StudioGate";
import { ViewContext } from "./ViewContext";

interface PlatformUser {
  tier: string;
  credits_ms: number;
  role: string;
  projects: number;
}

/**
 * Viewing as Super (docs/design/view-super-admin.html) — the platform at a
 * glance from admin_list_users (enforced server-side to ADMIN) and the
 * subsystem registry. Non-admins see a restricted state, never invented figures.
 */
export function SuperView() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "ADMIN";
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user || !isAdmin) return;
    void sb.rpc("admin_list_users").then(({ data, error }) => {
      if (error) setErr(error.message);
      else setUsers((data ?? []) as PlatformUser[]);
    });
  }, [user, isAdmin]);

  const tiers = Object.entries(
    (users ?? []).reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.tier]: (acc[u.tier] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const implemented = SUBSYSTEMS.filter((s) => s.status === "Implemented").length;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="System context / 03"
        title={<>Govern the<br /><em>system.</em></>}
        copy={
          <>
            <p>Super mode is the highest operational view of Cineforge — the members, plans and production infrastructure behind the work.</p>
            <p><strong>Authority without unnecessary noise.</strong></p>
          </>
        }
        status={{ tone: isAdmin ? "live" : "warn", label: isAdmin ? "Current context · Super" : "Restricted to administrators" }}
      />
      <ViewContext slug="super" />
      <StudioGate signIn="Sign in as an administrator" what="System views">
        {!isAdmin ? (
          <Section label="System position" title="Restricted.">
            <EmptyState
              title={<>Administrators <em>only.</em></>}
              hint="Platform members, plans and spend are only readable by accounts with the ADMIN role — enforced by the database, not this page."
              action={{ label: "See the system design", href: "/admin" }}
            />
          </Section>
        ) : (
          <>
            <Section label="System position" title="The platform at a glance.">
              {err && <p role="alert" className="mb-5 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">{err}</p>}
              <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Members", users ? String(users.length) : "—", "accounts on the platform"],
                  ["Productions", users ? users.reduce((t, u) => t + u.projects, 0).toLocaleString() : "—", "projects in the system"],
                  ["Credits held", users ? msToCredits(users.reduce((t, u) => t + u.credits_ms, 0)).toLocaleString() : "—", "unspent across members"],
                  ["Administrators", users ? String(users.filter((u) => u.role === "ADMIN").length) : "—", "with system authority"],
                ].map(([k, v, sub]) => (
                  <div key={k} className="bg-cf-bg p-6">
                    <div className="cf-label">{k}</div>
                    <div className="cf-display mt-7 text-[44px] leading-none">{v}</div>
                    <div className="mt-2 text-[11px] text-cf-muted">{sub}</div>
                  </div>
                ))}
              </div>
              {tiers.length > 0 && (
                <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 border-t border-cf-line pt-5">
                  {tiers.map(([tier, n]) => (
                    <div key={tier} className="flex items-baseline gap-3">
                      <dt className="cf-label">{tier}</dt>
                      <dd className="font-mono text-[11px]">{n}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Section>

            <Section
              label="Infrastructure"
              title="The machine behind the work."
              aside={<span className="cf-label">{implemented} / {SUBSYSTEMS.length} implemented</span>}
            >
              <ol className="border-t border-cf-fg">
                {SUBSYSTEMS.map((s, i) => (
                  <li key={s.name} className="grid gap-3 border-b border-cf-line py-4 md:grid-cols-[36px_1fr_auto] md:items-center">
                    <span className="font-mono text-[11px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-display font-semibold text-[18px]">{s.name}</span>
                    <Status tone={s.status === "Implemented" ? "ok" : s.status === "Stubbed" ? "warn" : "idle"}>{s.status}</Status>
                  </li>
                ))}
              </ol>
              <div className="mt-8 flex flex-wrap gap-2">
                <Link href="/admin" className="cf-btn-ink">Infrastructure</Link>
                <Link href="/admin/users" className="cf-btn-line">Users &amp; credits</Link>
                <Link href="/admin/moderation" className="cf-btn-line">Moderation</Link>
                <Link href="/admin/gateway" className="cf-btn-line">GPU gateway</Link>
              </div>
            </Section>
          </>
        )}
      </StudioGate>
    </div>
  );
}
