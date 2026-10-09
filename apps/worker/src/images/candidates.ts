/**
 * Seed-still candidates (W6). For an image-to-video shot CineForge can draw N
 * candidate stills and let the Visual Reviewer pick the one that best shows
 * the shot's canon — before any GPU second is spent on video. Every candidate
 * is kept as a media version with its review, so the choice is on record.
 *
 *   SEED_CANDIDATES  1–4, default 1 (each candidate is one image call).
 */
import { meanScore, type VisualReviewResult } from "@cineforge/movie";

export function seedCandidates(env: Record<string, string | undefined> = process.env): number {
  const n = Math.floor(Number(env.SEED_CANDIDATES ?? 1));
  return Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : 1;
}

export interface Candidate {
  key: string;
  review: VisualReviewResult | null;
}

const score = (r: VisualReviewResult | null): [number, number, number, number] => {
  if (!r) return [0, 0, 0, 0];
  const matches = r.findings.filter((f) => f.status === "match").length;
  const mismatches = r.findings.filter((f) => f.status === "mismatch").length;
  return [r.passed ? 1 : 0, matches - mismatches, -r.unverified, meanScore(r.scores) ?? 0];
};

/** Lexicographic comparison of two scores. */
const better = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
};

/**
 * The best candidate: passing first, then most matches net of mismatches, then fewest unverified,
 * then the higher mean reviewer score (W18); ties keep the earlier one.
 */
export function pickCandidate(cands: Candidate[]): { chosen: Candidate; index: number } {
  if (!cands.length) throw new Error("no candidates");
  let best = 0;
  for (let i = 1; i < cands.length; i++) {
    if (better(score(cands[i]!.review), score(cands[best]!.review))) best = i;
  }
  return { chosen: cands[best]!, index: best };
}
