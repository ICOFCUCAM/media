/**
 * Plan length ceilings (docs/33) — the authoritative copy the worker enforces.
 * apps/web/lib/plans.ts (MAX_FILM_SEC) mirrors these for the UI; keep in sync.
 */
export type PlanTier = "FREE" | "CREATOR" | "STUDIO" | "AGENCY" | "ENTERPRISE";

export const PLAN_MAX_FILM_SEC: Record<PlanTier, number> = {
  FREE: 30,
  CREATOR: 180,
  STUDIO: 600,
  AGENCY: 1200,
  ENTERPRISE: Number.MAX_SAFE_INTEGER,
};

/** The longest production a member may run. Admins are uncapped; unknown tiers get the Free ceiling. */
export function planCapSec(tier: string, role?: string): number {
  if (role === "ADMIN") return Number.MAX_SAFE_INTEGER;
  return PLAN_MAX_FILM_SEC[tier as PlanTier] ?? PLAN_MAX_FILM_SEC.FREE;
}
