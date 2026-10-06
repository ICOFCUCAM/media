/**
 * Read-only view model for the Media Runtime Gateway audit trail
 * (migration 0026; docs/39). Admins read these tables through RLS (admin-only
 * SELECT policies); nothing here writes, and clients have no write grant.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export interface DeploymentRow {
  id: string;
  model_id: string;
  base_url: string;
  runpod_pod_id: string | null;
  status: "pending" | "approved" | "revoked";
  enforcement: "report" | "enforce";
  manifest: { authzVersion?: number; runtime?: string; models?: { role: string; id: string; revision: string; weights: string }[] } | null;
  approved_image: string | null;
  updated_at: string;
}

export interface GrantRow {
  id: string;
  deployment_id: string | null;
  shot_id: string | null;
  project_id: string | null;
  scope: string;
  mode: "report" | "enforce";
  authz_digest: string | null;
  issued_at: string;
  outcome: "issued" | "completed" | "completed_unverified" | "rejected" | "failed" | "denied";
  error_code: string | null;
  gpu_ms: number | null;
}

export interface EventRow {
  id: string;
  type: string;
  deployment_id: string | null;
  grant_id: string | null;
  code: string | null;
  actor: string;
  created_at: string;
}

export interface GatewayAudit {
  available: boolean; // false if the gateway tables are missing (migration 0026 not applied)
  deployments: DeploymentRow[];
  grants: GrantRow[];
  events: EventRow[];
}

const IMMUTABLE_IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;

export async function loadGatewayAudit(db: SupabaseClient<Database>, limit = 200): Promise<GatewayAudit> {
  const [d, g, e] = await Promise.all([
    db.from("runtime_deployments").select("id,model_id,base_url,runpod_pod_id,status,enforcement,manifest,approved_image,updated_at").order("id"),
    db.from("runtime_execution_grants").select("id,deployment_id,shot_id,project_id,scope,mode,authz_digest,issued_at,outcome,error_code,gpu_ms").order("issued_at", { ascending: false }).limit(limit),
    db.from("runtime_gateway_events").select("id,type,deployment_id,grant_id,code,actor,created_at").order("created_at", { ascending: false }).limit(limit),
  ]);
  const missing = [d.error, g.error, e.error].some((err) => err && /does not exist|schema cache|42P01|PGRST205/i.test(`${err.code ?? ""} ${err.message ?? ""}`));
  return {
    available: !missing,
    deployments: (d.data as unknown as DeploymentRow[] | null) ?? [],
    grants: (g.data as unknown as GrantRow[] | null) ?? [],
    events: (e.data as unknown as EventRow[] | null) ?? [],
  };
}

/** Counts per key, most frequent first. */
export function tally<T>(rows: T[], key: (r: T) => string | null | undefined): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export interface ReadinessCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Whether a deployment is ready for `gateway:admin enforce` — as far as the
 * database can tell. The command itself re-checks live (provider image, pod
 * mode, manifest, rejection probes); this view shows what still blocks it.
 */
export function enforcementReadiness(dep: DeploymentRow, events: EventRow[], now = Date.now()): ReadinessCheck[] {
  const dayAgo = now - 24 * 3600 * 1000;
  const recent = events.filter((e) => e.deployment_id === dep.id && Date.parse(e.created_at) >= dayAgo);
  const wouldDeny = recent.filter((e) => e.type === "dispatch.would_deny" || e.type === "output.legacy" || e.type === "dispatch.legacy");
  const authzVersion = dep.manifest?.authzVersion ?? 0;
  return [
    { label: "Approved", ok: dep.status === "approved", detail: dep.status },
    {
      label: "Immutable image",
      ok: Boolean(dep.approved_image && IMMUTABLE_IMAGE.test(dep.approved_image)),
      detail: dep.approved_image ? shortImage(dep.approved_image) : "none approved",
    },
    { label: "Manifest", ok: Boolean(dep.manifest), detail: dep.manifest ? `${dep.manifest.runtime ?? "?"}` : "not captured" },
    { label: "Authz v2", ok: authzVersion >= 2, detail: authzVersion ? `v${authzVersion}` : "unknown" },
    {
      label: "Clean report window (24 h)",
      ok: wouldDeny.length === 0,
      detail: wouldDeny.length ? `${wouldDeny.length} would-deny / legacy` : "no findings",
    },
  ];
}

export function shortImage(ref: string): string {
  const at = ref.indexOf("@sha256:");
  return at < 0 ? ref : `${ref.slice(0, at)}@sha256:${ref.slice(at + 8, at + 20)}…`;
}
