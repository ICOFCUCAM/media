/**
 * Fair scheduling across tenants (docs/24 §C5). Prevents one 90-minute epic
 * from starving everyone else: higher tiers get more GPU share, but lower tiers
 * are never fully starved. Pure + testable.
 */

export type Tier = "FREE" | "CREATOR" | "STUDIO" | "ENTERPRISE";

/** Relative GPU share weight per tier. */
export const TIER_WEIGHT: Record<Tier, number> = {
  FREE: 1,
  CREATOR: 2,
  STUDIO: 6,
  ENTERPRISE: 12,
};

/** BullMQ job priority (LOWER = higher priority). Higher tiers dispatch first. */
export function tierPriority(tier: Tier): number {
  return ({ ENTERPRISE: 1, STUDIO: 2, CREATOR: 3, FREE: 4 } as const)[tier] ?? 5;
}

export interface FairQueue {
  id: string; // tenant/project id
  weight: number; // e.g. TIER_WEIGHT[tier]
  pending: number; // jobs waiting
}

/**
 * Deficit weighted round-robin scheduler. Over many picks, each active tenant's
 * share of selections approximates its weight, while guaranteeing every
 * backlogged tenant is eventually served (no starvation). Stateful by design.
 */
export class DeficitFairScheduler {
  private deficit = new Map<string, number>();

  pick(queues: FairQueue[]): string | null {
    const active = queues.filter((q) => q.pending > 0);
    if (active.length === 0) return null;

    for (const q of active) {
      this.deficit.set(q.id, (this.deficit.get(q.id) ?? 0) + q.weight);
    }
    const chosen = active.reduce((b, q) =>
      (this.deficit.get(q.id) ?? 0) > (this.deficit.get(b.id) ?? 0) ? q : b,
    );
    const cost = Math.max(...active.map((a) => a.weight));
    this.deficit.set(chosen.id, (this.deficit.get(chosen.id) ?? 0) - cost);
    return chosen.id;
  }

  reset(id?: string) {
    if (id) this.deficit.delete(id);
    else this.deficit.clear();
  }
}
