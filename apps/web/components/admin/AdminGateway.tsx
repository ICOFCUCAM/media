"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { getSupabase } from "../../lib/supabase";
import { enforcementReadiness, loadGatewayAudit, shortImage, tally, type GatewayAudit } from "../../lib/gateway-audit";
import { EmptyState, PageHeader, Section, Status } from "../cf/primitives";

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Admin · GPU gateway — the Media Runtime Gateway's registry and audit trail
 * (docs/39). Read-only: what each GPU deployment is approved to run, what
 * enforcement would have blocked in report mode, and every execution grant.
 * Enforcement is switched only by `gateway:admin enforce`, never from here.
 */
export function AdminGateway() {
  const { user, profile } = useAuth();
  const [audit, setAudit] = useState<GatewayAudit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    try {
      setAudit(await loadGatewayAudit(sb));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (profile?.role === "ADMIN") void refresh();
  }, [profile, refresh]);

  const enforcing = audit?.deployments.filter((d) => d.enforcement === "enforce").length ?? 0;
  const header = (
    <PageHeader
      eyebrow="System administration / GPU gateway"
      title={<>Who may run<br /><em>on the GPU.</em></>}
      copy={
        <>
          <p>Every GPU deployment, the image and models it is approved to run, and every execution credential Cineforge has issued or refused.</p>
          <p>Read-only. Enforcement changes only through <code className="font-mono text-[12px]">gateway:admin enforce</code>, which re-checks everything live.</p>
        </>
      }
      status={
        audit
          ? { tone: enforcing ? "ok" : "warn", label: `${enforcing} / ${audit.deployments.length} enforcing` }
          : { tone: "idle", label: "Gateway" }
      }
    />
  );

  if (!user || profile?.role !== "ADMIN")
    return (
      <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
        {header}
        <EmptyState className="mt-12" title={<>Administrators <em>only.</em></>} hint="Sign in with an account that carries the ADMIN role." />
      </div>
    );

  if (audit && !audit.available)
    return (
      <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
        {header}
        <EmptyState className="mt-12" title={<>No audit trail <em>yet.</em></>} hint="The gateway tables are missing: apply migration 0026 (docs/39 §10, step 0)." />
      </div>
    );

  const wouldDeny = tally(audit?.events.filter((e) => e.type === "dispatch.would_deny") ?? [], (e) => e.code);
  const denied = tally(audit?.events.filter((e) => e.type === "dispatch.denied") ?? [], (e) => e.code);
  const outcomes = tally(audit?.grants ?? [], (g) => g.outcome);
  const legacy = audit?.events.filter((e) => e.type === "dispatch.legacy").length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      {header}
      {error && <p className="mt-6 text-[13px] text-cf-danger">Could not load the audit trail: {error}</p>}

      <Section label="Deployments" title={audit ? `${String(audit.deployments.length).padStart(2, "0")} registered` : "Deployments"}>
        {audit?.deployments.length === 0 ? (
          <EmptyState title={<>No GPU deployment is <em>registered.</em></>} hint="Register and approve one with gateway:admin register / approve (docs/39 §10)." />
        ) : (
          <ol className="border-t border-cf-fg">
            {(audit?.deployments ?? []).map((d) => {
              const checks = enforcementReadiness(d, audit!.events);
              return (
                <li key={d.id} className="grid gap-4 border-b border-cf-line py-5 lg:grid-cols-[1fr_1.6fr] lg:gap-10">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-display font-semibold text-[19px]">{d.id}</span>
                      <Status tone={d.enforcement === "enforce" ? "ok" : "warn"}>{d.enforcement}</Status>
                    </div>
                    <div className="cf-label mt-1 truncate">{d.model_id} · {d.base_url}</div>
                    <div className="mt-1 truncate font-mono text-[11px] text-cf-muted">{d.approved_image ? shortImage(d.approved_image) : "no approved image"}</div>
                  </div>
                  <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {checks.map((c) => (
                      <li key={c.label} className="flex items-center justify-between gap-3 border-b border-cf-line/60 py-1">
                        <Status tone={c.ok ? "ok" : "warn"}>{c.label}</Status>
                        <span className="truncate font-mono text-[11px] text-cf-muted">{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section label="Report mode" title="What enforcement would block.">
        <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-3">
          <Tally title="Would deny (report mode)" rows={wouldDeny} empty="Nothing would be blocked." />
          <Tally title="Denied (enforced)" rows={denied} empty="Nothing denied." />
          <Tally title="Grant outcomes" rows={outcomes} empty="No grants issued yet." />
        </div>
        <p className="cf-label mt-4 leading-relaxed">
          Unsigned legacy calls in this window: {legacy}. Legacy calls stop once the worker has its signing key and the deployment is approved.
        </p>
      </Section>

      <Section label="Events" title="Security events.">
        {audit?.events.length === 0 ? (
          <EmptyState title="No events recorded." />
        ) : (
          <ol className="border-t border-cf-fg">
            {(audit?.events ?? []).slice(0, 60).map((e) => (
              <li key={e.id} className="grid gap-1 border-b border-cf-line py-3 md:grid-cols-[150px_220px_1fr_auto] md:items-center md:gap-6">
                <span className="cf-label text-cf-dim">{time(e.created_at)}</span>
                <span className="font-mono text-[12px]">{e.type}</span>
                <span className="truncate font-mono text-[12px] text-cf-muted">
                  {[e.code, e.deployment_id, e.grant_id].filter(Boolean).join(" · ") || "—"}
                </span>
                <span className="cf-label truncate">{e.actor}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section label="Grants" title="Execution credentials.">
        {audit?.grants.length === 0 ? (
          <EmptyState title="No execution grants yet." />
        ) : (
          <ol className="border-t border-cf-fg">
            {(audit?.grants ?? []).slice(0, 60).map((g) => (
              <li key={g.id} className="grid gap-1 border-b border-cf-line py-3 md:grid-cols-[150px_1fr_120px_110px_auto] md:items-center md:gap-6">
                <span className="cf-label text-cf-dim">{time(g.issued_at)}</span>
                <span className="truncate font-mono text-[12px]">
                  {g.deployment_id ?? "unregistered"} · shot {g.shot_id?.slice(0, 8) ?? "—"} · {g.scope}
                </span>
                <Status tone={g.outcome === "completed" ? "ok" : g.outcome === "denied" || g.outcome === "rejected" || g.outcome === "failed" ? "danger" : "warn"}>
                  {g.outcome}
                </Status>
                <span className="cf-label">{g.mode}</span>
                <span className="truncate font-mono text-[11px] text-cf-muted">{g.error_code ?? (g.authz_digest ? `authz ${g.authz_digest.slice(0, 10)}…` : "")}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function Tally({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  return (
    <div className="bg-cf-bg p-6">
      <div className="cf-label">{title}</div>
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-cf-muted">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {rows.map(([k, n]) => (
            <li key={k} className="flex items-center justify-between gap-3 font-mono text-[12px]">
              <span className="truncate">{k}</span>
              <span className="tabular-nums text-cf-muted">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
