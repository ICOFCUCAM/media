/**
 * Seed candidates → media_versions (migration 0029, applied): one immutable
 * row per candidate still, with its review and whether it was chosen. The
 * shot's seed_image_key points at the chosen one.
 */
import type { Candidate } from "./candidates";

export interface MediaVersionDb {
  mediaVersion: {
    findFirst(a: unknown): Promise<{ version: number } | null>;
    create(a: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<unknown>;
  };
}

export async function recordSeedCandidates(db: MediaVersionDb, projectId: string, shotId: string, cands: Candidate[], chosen: number): Promise<void> {
  try {
    const last = await db.mediaVersion.findFirst({ where: { assetType: "image", assetId: shotId }, orderBy: { version: "desc" }, select: { version: true } });
    let v = last?.version ?? 0;
    for (const [i, c] of cands.entries()) {
      await db.mediaVersion.create({
        data: {
          projectId, assetType: "image", assetId: shotId, version: ++v, storageKey: c.key,
          derivation: {
            role: "seed_candidate", candidate: i, chosen: i === chosen,
            review: c.review ? { passed: c.review.passed, unverified: c.review.unverified, findings: c.review.findings, reviewer: `${c.review.provider}:${c.review.model}` } : null,
          },
        },
        select: { id: true },
      });
    }
  } catch (e) {
    // The choice is already made; the record is best effort (logged).
    console.warn(JSON.stringify({ event: "seed.candidates", shotId, error: e instanceof Error ? e.message : String(e) }));
  }
}
