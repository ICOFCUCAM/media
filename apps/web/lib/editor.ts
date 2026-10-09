/**
 * The Editor (DirectorOS W13; Part 1 §21, §46): ask for a review of the cut or
 * one editing request, read the findings and proposals, approve or reject
 * each, and ask for the approved ones to be applied. The worker does the rest.
 */
import type { Database } from "./database.types";
import { getSupabase } from "./supabase";

export type ReviewRow = Database["public"]["Tables"]["editorial_reviews"]["Row"];
export type ProposalRow = Database["public"]["Tables"]["edit_proposals"]["Row"];

export interface Finding {
  question: string;
  verdict: "works" | "needs_work";
  note: string;
}

export interface ProposalEffect {
  deltaSec: number;
  regenerate: number;
  recut: number;
  remove: number;
  revoice: string[];
  reordered: boolean;
}

export interface Review extends ReviewRow {
  proposals: ProposalRow[];
}

/** The nine questions (§21.1), in the order the Editor answers them. */
export const QUESTION_LABEL: Record<string, string> = {
  pacing: "Pacing", opening: "Opening", redundancy: "Redundant shots", escalation: "Emotional escalation",
  scene_length: "Scene length", climax: "Climax timing", ending: "Ending", transitions: "Transitions", dialogue: "Dialogue",
};

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb;
}

/** Newest reviews first, with their proposals. Null when migration 0048 is not applied. */
export async function listReviews(projectId: string): Promise<Review[] | null> {
  const sb = client();
  const { data, error } = await sb.from("editorial_reviews").select().eq("project_id", projectId).order("created_at", { ascending: false }).limit(10);
  if (error) return null;
  if (!data?.length) return [];
  const { data: props } = await sb.from("edit_proposals").select().in("review_id", data.map((r) => r.id)).order("position", { ascending: true });
  return data.map((r) => ({ ...r, proposals: (props ?? []).filter((p) => p.review_id === r.id) }));
}

/** A whole-cut review (no instruction) or one editing request. */
export async function requestReview(projectId: string, instruction?: string | null): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const text = instruction?.trim() || null;
  const { error } = await sb.from("editorial_reviews").insert({ project_id: projectId, requested_by: auth.user.id, instruction: text });
  if (error) throw new Error(error.message);
}

export async function decideProposal(proposalId: string, approve: boolean): Promise<void> {
  const { error } = await client().rpc("decide_edit_proposal", { p_id: proposalId, p_approve: approve });
  if (error) throw new Error(error.message);
}

export async function applyApproved(reviewId: string): Promise<void> {
  const { error } = await client().rpc("request_editorial_apply", { p_review: reviewId });
  if (error) throw new Error(error.message);
}

export const effectOf = (p: ProposalRow): ProposalEffect => {
  const e = (p.effect ?? {}) as Partial<ProposalEffect>;
  return { deltaSec: e.deltaSec ?? 0, regenerate: e.regenerate ?? 0, recut: e.recut ?? 0, remove: e.remove ?? 0, revoice: e.revoice ?? [], reordered: !!e.reordered };
};

/** What a proposal costs, in plain words. */
export function costLine(e: ProposalEffect): string {
  const parts = [
    e.deltaSec ? `${e.deltaSec > 0 ? "+" : "−"}${Math.abs(e.deltaSec)}s` : null,
    e.recut ? `${e.recut} re-cut` : null,
    e.remove ? `${e.remove} removed` : null,
    e.regenerate ? `${e.regenerate} to generate` : null,
    e.revoice.length ? "re-voiced" : null,
    e.reordered ? "reordered" : null,
  ].filter(Boolean);
  return parts.join(" · ") || "no change to length";
}
